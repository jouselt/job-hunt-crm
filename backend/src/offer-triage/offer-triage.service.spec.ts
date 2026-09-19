import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OfferTriageService } from './offer-triage.service';
import { Offer } from './offer.entity';
import { JevClient } from './jev-client';
import { TriageProfileService } from './triage-profile.service';
import { ApplicationsService } from '../applications/applications.service';

describe('OfferTriageService', () => {
  let service: OfferTriageService;
  let repo: any;
  let jev: any;
  let profile: any;
  let apps: any;

  const baseOffer = (over: Partial<Offer> = {}): Offer =>
    ({
      id: 'o1',
      userId: 'u1',
      externalId: 'e1',
      title: 'Backend',
      company: 'Acme',
      status: 'NEW',
      createdAt: new Date(),
      ...over,
    }) as Offer;

  const jevResult = (over: Partial<any> = {}) => ({
    fitScore: 3.1,
    fitConfidence: 0.91,
    hardGateProbability: 0.05,
    raw: { ok: true },
    ...over,
  });

  beforeEach(async () => {
    repo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (e: any) => e),
    };
    jev = { triage: jest.fn(async () => jevResult()) };
    profile = { getForUser: jest.fn(() => ({ roles: ['Backend'] })) };
    apps = { create: jest.fn(async () => ({ id: 'a1' })) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OfferTriageService,
        { provide: getRepositoryToken(Offer), useValue: repo },
        { provide: JevClient, useValue: jev },
        { provide: TriageProfileService, useValue: profile },
        { provide: ApplicationsService, useValue: apps },
      ],
    }).compile();
    service = moduleRef.get(OfferTriageService);
  });

  describe('triageOffer', () => {
    it('SEND: creates the kanban card first, then persists SENT with the numeric fit score', async () => {
      const o = await service.triageOffer(baseOffer());

      expect(o.status).toBe('SENT');
      expect(o.decision).toBe('SEND');
      // The stored score is the number Jev returned, not the gate string.
      expect(o.fitScore).toBe(3.1);
      expect(typeof o.fitScore).toBe('number');
      expect(o.jevConfidence).toBe(0.91);

      expect(apps.create).toHaveBeenCalledTimes(1);
      const card = apps.create.mock.calls[0][0];
      expect(card.source).toBe('triage');
      expect(card.stage).toBe('applied');
      expect(card.notes).toContain('Fit score: 3.10');
      expect(card.notes).not.toContain('Fit score: 0.91');
      expect(apps.create.mock.calls[0][1]).toBe('u1');

      // Card before SENT, so a failed card never leaves an unretryable offer.
      expect(apps.create.mock.invocationCallOrder[0]).toBeLessThan(
        repo.save.mock.invocationCallOrder[0],
      );
    });

    it('REVIEW: fit below the threshold creates no card and is not SENT', async () => {
      jev.triage.mockResolvedValue(jevResult({ fitScore: 1.99, hardGateProbability: 0 }));

      const o = await service.triageOffer(baseOffer());

      expect(o.status).toBe('REVIEW');
      expect(o.decision).toBe('REVIEW');
      expect(o.fitScore).toBe(1.99);
      expect(apps.create).not.toHaveBeenCalled();
    });

    it('REVIEW: a disqualifier probability at the cap creates no card', async () => {
      jev.triage.mockResolvedValue(jevResult({ fitScore: 3.0, hardGateProbability: 0.2 }));

      const o = await service.triageOffer(baseOffer());

      expect(o.status).toBe('REVIEW');
      expect(o.decision).toBe('REVIEW');
      expect(apps.create).not.toHaveBeenCalled();
    });

    it('REVIEW: a Jev rejection marks the offer REVIEW instead of leaving it NEW', async () => {
      jev.triage.mockRejectedValue(new Error('Jev API error 429'));

      const o = await service.triageOffer(baseOffer());

      expect(o.status).toBe('REVIEW');
      expect(o.decision).toBe('REVIEW');
      expect(o.decisionAt).toBeTruthy();
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save.mock.calls[0][0].status).toBe('REVIEW');
      expect(apps.create).not.toHaveBeenCalled();
    });

    it('a failing key lookup (no JEV_API_KEY anywhere) also lands in REVIEW', async () => {
      profile.getForUser.mockResolvedValue({});
      jev.triage.mockRejectedValue(new Error('JEV_API_KEY not configured (user settings or env)'));

      const o = await service.triageOffer(baseOffer());

      expect(o.status).toBe('REVIEW');
    });

    it('does not leave the offer SENT when card creation fails', async () => {
      apps.create.mockRejectedValue(new Error('applications insert failed'));

      const o = await service.triageOffer(baseOffer());

      expect(o.status).toBe('REVIEW');
      expect(o.decision).toBe('REVIEW');
      for (const [saved] of repo.save.mock.calls) {
        expect(saved.status).not.toBe('SENT');
      }
    });

    it('does not throw out of triageOffer when the REVIEW write itself fails', async () => {
      jev.triage.mockRejectedValue(new Error('Jev API error 529'));
      repo.save.mockRejectedValue(new Error('db down'));

      await expect(service.triageOffer(baseOffer())).resolves.toBeDefined();
    });
  });

  describe('runDailyTriage', () => {
    it('triages every NEW offer and keeps going when one fails', async () => {
      const failing = baseOffer({ id: 'o-fail', externalId: 'e-fail' });
      const good = baseOffer({ id: 'o-good', externalId: 'e-good' });
      repo.find.mockResolvedValue([failing, good]);
      jev.triage.mockImplementation(async (offer: Offer) => {
        if (offer.id === 'o-fail') throw new Error('Jev API error 401');
        return jevResult();
      });

      await service.runDailyTriage();

      expect(repo.find).toHaveBeenCalledWith({ where: { status: 'NEW' } });
      expect(jev.triage).toHaveBeenCalledTimes(2);
      expect(failing.status).toBe('REVIEW');
      expect(good.status).toBe('SENT');
    });
  });

  describe('humanSend', () => {
    it('creates a card for a REVIEW offer and reuses the stored fit score', async () => {
      repo.findOne.mockResolvedValue(baseOffer({ status: 'REVIEW', fitScore: 1.5 }));

      const o = await service.humanSend('o1', 'u1');

      expect(o.status).toBe('SENT');
      expect(apps.create).toHaveBeenCalledTimes(1);
      expect(apps.create.mock.calls[0][0].notes).toContain('Fit score: 1.50');
    });

    it('creates the card before persisting SENT', async () => {
      repo.findOne.mockResolvedValue(baseOffer({ status: 'REVIEW' }));

      await service.humanSend('o1', 'u1');

      expect(apps.create.mock.invocationCallOrder[0]).toBeLessThan(
        repo.save.mock.invocationCallOrder[0],
      );
    });

    it('is a no-op for an offer that is already SENT', async () => {
      repo.findOne.mockResolvedValue(baseOffer({ status: 'SENT' }));

      const o = await service.humanSend('o1', 'u1');

      expect(o.status).toBe('SENT');
      expect(apps.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('throws when offer missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.humanSend('x', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('humanSkip', () => {
    it('rejects a REVIEW offer without creating a card', async () => {
      repo.findOne.mockResolvedValue(baseOffer({ status: 'REVIEW' }));

      const o = await service.humanSkip('o1', 'u1');

      expect(o.status).toBe('REJECTED');
      expect(apps.create).not.toHaveBeenCalled();
    });

    it('throws when offer missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.humanSkip('x', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
