import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Offer } from './offer.entity';
import { JevClient } from './jev-client';
import { TriageProfileService } from './triage-profile.service';
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
    const profile = await this.profile.getForUser(offer.userId);
    const result = await this.jev.triage(offer, profile, offer.userId);

    offer.jevRaw = result.raw;
    offer.jevConfidence = result.gateConfidence;
    offer.fit = result.gate;
    offer.decisionAt = new Date().toISOString().slice(0, 10);

    if (result.gate === 'SEND') {
      offer.status = 'SENT';
      await this.repo.save(offer);
      await this.sendToKanban(offer, result);
    } else if (result.gate === 'SKIP') {
      offer.status = 'REJECTED';
      await this.repo.save(offer);
    } else {
      offer.status = 'REVIEW';
      await this.repo.save(offer);
    }
    return offer;
  }

  async humanSend(offerId: string, userId: string): Promise<Offer> {
    const offer = await this.repo.findOne({ where: { id: offerId, userId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status === 'SENT') return offer;
    offer.status = 'SENT';
    offer.decisionAt = new Date().toISOString().slice(0, 10);
    await this.repo.save(offer);
    await this.sendToKanban(offer, {
      fit: Number(offer.jevConfidence ?? 0),
      gateConfidence: Number(offer.jevConfidence ?? 0),
    });
    return offer;
  }

  async humanSkip(offerId: string, userId: string): Promise<Offer> {
    const offer = await this.repo.findOne({ where: { id: offerId, userId } });
    if (!offer) throw new NotFoundException('Offer not found');
    offer.status = 'REJECTED';
    offer.decisionAt = new Date().toISOString().slice(0, 10);
    await this.repo.save(offer);
    return offer;
  }

  private async sendToKanban(
    offer: Offer,
    result: { fit: number; gateConfidence: number },
  ): Promise<void> {
    const follow = new Date();
    follow.setDate(follow.getDate() + 7);
    await this.apps.create(
      {
        company: offer.company,
        role: offer.title,
        source: 'triage',
        stage: 'applied',
        applied_date: new Date().toISOString().slice(0, 10),
        follow_up_date: follow.toISOString().slice(0, 10),
        notes: this.buildNotes(offer, result),
      },
      offer.userId,
    );
  }

  private buildNotes(offer: Offer, result: { fit: number; gateConfidence: number }): string {
    const lines = [
      'Triage (Jev): SEND',
      `Fit score: ${result.fit.toFixed(2)} (conf ${result.gateConfidence.toFixed(2)})`,
      `Offer: ${offer.title} @ ${offer.company}`,
    ];
    if (offer.url) lines.push(`URL: ${offer.url}`);
    if (offer.location) lines.push(`Location: ${offer.location}`);
    if (offer.description) lines.push(`Description: ${offer.description.slice(0, 500)}`);
    return lines.join('\n');
  }
}
