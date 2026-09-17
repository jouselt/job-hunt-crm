import { Test } from '@nestjs/testing';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';

describe('OffersController', () => {
  let controller: OffersController;
  let service: any;

  beforeEach(async () => {
    service = {
      ingest: jest.fn(async () => ({ id: '1', status: 'NEW' })),
      findOwned: jest.fn(async () => []),
      findReview: jest.fn(async () => []),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [{ provide: OffersService, useValue: service }],
    }).compile();
    controller = moduleRef.get(OffersController);
  });

  it('ingests for the authenticated user', async () => {
    const dto = { id: 'ext', title: 't', company: 'c' } as CreateOfferDto;
    await controller.ingest(dto, { user: { userId: 'u1' } } as any);
    expect(service.ingest).toHaveBeenCalledWith('u1', dto);
  });

  it('lists owned offers', async () => {
    await controller.findOwned({ user: { userId: 'u1' } } as any);
    expect(service.findOwned).toHaveBeenCalledWith('u1');
  });

  it('lists review offers', async () => {
    await controller.findReview({ user: { userId: 'u1' } } as any);
    expect(service.findReview).toHaveBeenCalledWith('u1');
  });
});
