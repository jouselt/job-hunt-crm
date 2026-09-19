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
    } as Offer);

  beforeEach(async () => {
    repo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (e: any) => e),
    };
    jev = {
      triage: jest.fn(async () => ({
        fit: 0.9,
        fitConfidence: 0.9,
        gate: 'SEND',
        gateConfidence: 0.95,
        raw: { ok: true },
      })),
    };
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

  it('SEND: marks SENT and creates a kanban card', async () => {
    const o = await service.triageOffer(baseOffer());
    expect(o.status).toBe('SENT');
    expect(apps.create).toHaveBeenCalledTimes(1);
    expect(apps.create.mock.calls[0][0].source).toBe('triage');
    expect(apps.create.mock.calls[0][0].stage).toBe('applied');
  });

  it('SKIP: marks REJECTED and creates no card', async () => {
    jev.triage.mockResolvedValue({
      fit: 0.1,
      fitConfidence: 0.8,
      gate: 'SKIP',
      gateConfidence: 0.9,
      raw: {},
    });
    const o = await service.triageOffer(baseOffer());
    expect(o.status).toBe('REJECTED');
    expect(apps.create).not.toHaveBeenCalled();
  });

  it('NONE: marks REVIEW and creates no card', async () => {
    jev.triage.mockResolvedValue({
      fit: 0.5,
      fitConfidence: 0.3,
      gate: 'NONE',
      gateConfidence: 0.3,
      raw: {},
    });
    const o = await service.triageOffer(baseOffer());
    expect(o.status).toBe('REVIEW');
    expect(apps.create).not.toHaveBeenCalled();
  });

  it('humanSend creates a card for a REVIEW offer', async () => {
    repo.findOne.mockResolvedValue(baseOffer({ status: 'REVIEW' }));
    const o = await service.humanSend('o1', 'u1');
    expect(o.status).toBe('SENT');
    expect(apps.create).toHaveBeenCalledTimes(1);
  });

  it('humanSkip rejects a REVIEW offer', async () => {
    repo.findOne.mockResolvedValue(baseOffer({ status: 'REVIEW' }));
    const o = await service.humanSkip('o1', 'u1');
    expect(o.status).toBe('REJECTED');
    expect(apps.create).not.toHaveBeenCalled();
  });

  it('humanSend throws when offer missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.humanSend('x', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
