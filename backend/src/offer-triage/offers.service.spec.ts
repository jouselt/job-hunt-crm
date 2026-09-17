import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OffersService } from './offers.service';
import { Offer } from './offer.entity';
import { CreateOfferDto } from './dto/create-offer.dto';

describe('OffersService', () => {
  let service: OffersService;
  let store: Map<string, Offer>;
  let repo: any;

  const makeDto = (over: Partial<CreateOfferDto> = {}): CreateOfferDto =>
    ({ id: 'ext-1', title: 'Backend Dev', company: 'Acme', ...over } as CreateOfferDto);

  beforeEach(async () => {
    store = new Map<string, Offer>();
    repo = {
      findOne: jest.fn(async ({ where }: any) => {
        for (const o of store.values()) {
          if (o.userId === where.userId && o.externalId === where.externalId) return o;
        }
        return null;
      }),
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => {
        const key = `${e.userId}:${e.externalId}`;
        const merged = store.get(key) ? { ...store.get(key), ...e } : e;
        store.set(key, merged);
        return merged;
      }),
      find: jest.fn(async ({ where }: any) => {
        let rows = [...store.values()].filter((o) => o.userId === where.userId);
        if (where.status) rows = rows.filter((o) => o.status === where.status);
        return rows;
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OffersService,
        { provide: getRepositoryToken(Offer), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(OffersService);
  });

  it('creates a NEW offer on first ingest', async () => {
    const o = await service.ingest('u1', makeDto());
    expect(o.status).toBe('NEW');
    expect(o.externalId).toBe('ext-1');
  });

  it('dedupes on externalId (updates, keeps status)', async () => {
    await service.ingest('u1', makeDto({ title: 'Backend Dev' }));
    const second = await service.ingest('u1', makeDto({ title: 'Senior Backend Dev' }));
    expect(second.title).toBe('Senior Backend Dev');
    expect([...store.values()].filter((o) => o.userId === 'u1').length).toBe(1);
  });

  it('isolates offers per user', async () => {
    await service.ingest('u1', makeDto({ id: 'a' }));
    await service.ingest('u2', makeDto({ id: 'a' }));
    expect([...store.values()].filter((o) => o.userId === 'u1').length).toBe(1);
    expect([...store.values()].filter((o) => o.userId === 'u2').length).toBe(1);
  });

  it('findReview returns only REVIEW offers', async () => {
    const first = await service.ingest('u1', makeDto({ id: 'a' }));
    first.status = 'REVIEW';
    store.set('u1:a', first);
    const review = await service.findReview('u1');
    expect(review.length).toBe(1);
    expect(review[0].status).toBe('REVIEW');
  });
});
