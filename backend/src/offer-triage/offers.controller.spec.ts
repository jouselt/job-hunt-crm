import { Test } from '@nestjs/testing';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OfferTriageService } from './offer-triage.service';
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
});
