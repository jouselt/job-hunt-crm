import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OfferTriageService } from './offer-triage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOfferDto } from './dto/create-offer.dto';

describe('OffersController', () => {
  let controller: OffersController;
  let offers: any;
  let triage: any;

  beforeEach(async () => {
    offers = {
      ingest: jest.fn(async () => ({ id: '1', status: 'NEW' })),
      findOwned: jest.fn(async () => []),
      findReview: jest.fn(async () => []),
    };
    triage = {
      humanSend: jest.fn(async () => ({ id: '1', status: 'SENT' })),
      humanSkip: jest.fn(async () => ({ id: '1', status: 'REJECTED' })),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [
        { provide: OffersService, useValue: offers },
        { provide: OfferTriageService, useValue: triage },
      ],
    }).compile();
    controller = moduleRef.get(OffersController);
  });

  /**
   * Boots a real HTTP layer so the `ParseUUIDPipe` param decorators actually run.
   * Calling the controller method directly skips pipes entirely, which is why
   * this is a separate harness. The auth guard is stubbed to inject a user.
   */
  const buildHttpApp = async (): Promise<INestApplication> => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [
        { provide: OffersService, useValue: offers },
        { provide: OfferTriageService, useValue: triage },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { userId: 'u1' };
          return true;
        },
      })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  };

  it('ingests for the authenticated user', async () => {
    const dto = { id: 'ext', title: 't', company: 'c' } as CreateOfferDto;
    await controller.ingest(dto, { user: { userId: 'u1' } } as any);
    expect(offers.ingest).toHaveBeenCalledWith('u1', dto);
  });

  it('lists owned offers', async () => {
    await controller.findOwned({ user: { userId: 'u1' } } as any);
    expect(offers.findOwned).toHaveBeenCalledWith('u1');
  });

  it('lists review offers', async () => {
    await controller.findReview({ user: { userId: 'u1' } } as any);
    expect(offers.findReview).toHaveBeenCalledWith('u1');
  });

  it('human send delegates to triage', async () => {
    await controller.send('o1', { user: { userId: 'u1' } } as any);
    expect(triage.humanSend).toHaveBeenCalledWith('o1', 'u1');
  });

  it('human skip delegates to triage', async () => {
    await controller.skip('o1', { user: { userId: 'u1' } } as any);
    expect(triage.humanSkip).toHaveBeenCalledWith('o1', 'u1');
  });

  it('rejects a non-UUID id with 400 before it can reach the database', async () => {
    const app = await buildHttpApp();
    try {
      await request(app.getHttpServer()).post('/offers/not-a-uuid/send').expect(400);
      await request(app.getHttpServer()).post('/offers/123/skip').expect(400);
      expect(triage.humanSend).not.toHaveBeenCalled();
      expect(triage.humanSkip).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('lets a valid UUID through the pipe', async () => {
    const app = await buildHttpApp();
    const validId = '11111111-1111-4111-8111-111111111111';
    try {
      await request(app.getHttpServer()).post(`/offers/${validId}/send`).expect(201);
      expect(triage.humanSend).toHaveBeenCalledWith(validId, 'u1');
    } finally {
      await app.close();
    }
  });
});
