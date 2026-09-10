import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Application } from '../applications/application.entity';
import { FollowUpsService } from './follow-ups.service';

describe('FollowUpsService', () => {
  let service: FollowUpsService;
  const repo = { find: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FollowUpsService,
        { provide: getRepositoryToken(Application), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(FollowUpsService);
  });

  it('scopes due lookup to the user and orders by follow_up_date', async () => {
    repo.find.mockResolvedValue([]);
    await service.findDue('user-1');
    const args = repo.find.mock.calls[0][0];
    expect(args.where.user_id).toBe('user-1');
    expect(args.where.follow_up_date).toBeDefined();
    expect(args.order).toEqual({ follow_up_date: 'ASC' });
  });

  it('findDueForAll aggregates across users', async () => {
    repo.find.mockResolvedValue([{ id: '1' }]);
    const due = await service.findDueForAll();
    expect(due).toHaveLength(1);
  });
});