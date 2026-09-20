import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Offer } from './offer.entity';
import { JevClient } from './jev-client';
import { TriageProfileService } from './triage-profile.service';
import { decideTriage } from './triage-rules';
import { ApplicationsService } from '../applications/applications.service';

@Injectable()
export class OfferTriageService {
  private readonly logger = new Logger(OfferTriageService.name);

  constructor(
    @InjectRepository(Offer)
    private readonly repo: Repository<Offer>,
    private readonly jev: JevClient,
    private readonly profile: TriageProfileService,
    private readonly apps: ApplicationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyTriage(): Promise<void> {
    this.logger.log('Starting daily offer triage');
    const newOffers = await this.repo.find({ where: { status: 'NEW' } });
    for (const offer of newOffers) {
      try {
        await this.triageOffer(offer);
      } catch (err: any) {
        this.logger.error(`Triage failed for offer ${offer.id}: ${err?.message ?? err}`);
      }
    }
  }

  async triageOffer(offer: Offer): Promise<Offer> {
    try {
      const profile = await this.profile.getForUser(offer.userId);
      const result = await this.jev.triage(offer, profile, offer.userId);

      offer.jevRaw = result.raw;
      offer.jevConfidence = result.fitConfidence;
      offer.fitScore = result.fitScore;
      offer.decision = decideTriage(result.fitScore, result.hardGateProbability);
      offer.decisionAt = this.today();

      if (offer.decision === 'SEND') {
        // Create the card BEFORE persisting SENT: if card creation fails the
        // offer must not be left as SENT, or it would never be retried (the
        // cron only selects status 'NEW').
        await this.sendToKanban(offer, result.fitScore, result.fitConfidence, 'auto');
        offer.status = 'SENT';
        await this.repo.save(offer);
      } else {
        offer.status = 'REVIEW';
        await this.repo.save(offer);
      }
    } catch (err: any) {
      // REQ-3C: a Jev error/timeout (or a failed card creation) must surface the
      // offer to the user as REVIEW. Leaving it at 'NEW' would make the cron
      // retry it forever without ever telling anyone.
      this.logger.error(`Triage failed for offer ${offer.id}: ${err?.message ?? err}`);
      offer.status = 'REVIEW';
      offer.decision = 'REVIEW';
      offer.decisionAt = this.today();
      try {
        await this.repo.save(offer);
      } catch (saveErr: any) {
        this.logger.error(
          `Failed to persist REVIEW for offer ${offer.id}: ${saveErr?.message ?? saveErr}`,
        );
      }
    }
    return offer;
  }

  async humanSend(offerId: string, userId: string): Promise<Offer> {
    const offer = await this.repo.findOne({ where: { id: offerId, userId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status === 'SENT') return offer;
    // Same ordering rule as triageOffer: the card comes first, SENT is only
    // persisted once the card exists.
    await this.sendToKanban(offer, offer.fitScore ?? null, offer.jevConfidence ?? null, 'human');
    offer.status = 'SENT';
    offer.decisionAt = this.today();
    await this.repo.save(offer);
    return offer;
  }

  async humanSkip(offerId: string, userId: string): Promise<Offer> {
    const offer = await this.repo.findOne({ where: { id: offerId, userId } });
    if (!offer) throw new NotFoundException('Offer not found');
    offer.status = 'REJECTED';
    offer.decisionAt = this.today();
    await this.repo.save(offer);
    return offer;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async sendToKanban(
    offer: Offer,
    fitScore: number | null,
    fitConfidence: number | null,
    origin: 'auto' | 'human',
  ): Promise<void> {
    const follow = new Date();
    follow.setDate(follow.getDate() + 7);
    await this.apps.create(
      {
        company: offer.company,
        role: offer.title,
        source: 'triage',
        stage: 'applied',
        applied_date: this.today(),
        follow_up_date: follow.toISOString().slice(0, 10),
        notes: this.buildNotes(offer, fitScore, fitConfidence, origin),
      },
      offer.userId,
    );
  }

  private buildNotes(
    offer: Offer,
    fitScore: number | null,
    fitConfidence: number | null,
    origin: 'auto' | 'human',
  ): string {
    // The verdict must be the one the triage actually reached. Reporting a
    // hardcoded 'SEND' here made a card created from the review queue claim the
    // triage had approved an offer it had in fact flagged for a human, which
    // makes the record lie about why the application happened.
    const lines = [
      `Triage (Jev): ${offer.decision ?? 'n/a'}`,
      `Fit score: ${this.formatScore(fitScore)} (conf ${this.formatScore(fitConfidence)})`,
      origin === 'human'
        ? 'Sent by: human (reviewed from the review queue)'
        : 'Sent by: automatic triage',
      `Offer: ${offer.title} @ ${offer.company}`,
    ];
    if (offer.url) lines.push(`URL: ${offer.url}`);
    if (offer.location) lines.push(`Location: ${offer.location}`);
    if (offer.description) lines.push(`Description: ${offer.description.slice(0, 500)}`);
    return lines.join('\n');
  }

  private formatScore(value: number | null | undefined): string {
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'n/a';
  }
}
