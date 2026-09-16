import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RemindersCron } from './reminders.cron';
import { FollowUpsService } from './follow-ups.service';
import { UsersService } from '../users/users.service';
import { Application } from '../applications/application.entity';

describe('RemindersCron', () => {
  let cron: RemindersCron;
  const followUps = { findDueForAll: jest.fn() };
  const users = { findById: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RemindersCron,
        { provide: FollowUpsService, useValue: followUps },
        { provide: UsersService, useValue: users },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => undefined) },
        },
      ],
    }).compile();
    cron = moduleRef.get(RemindersCron);
  });

  const app = (userId: string, company: string): Application =>
    ({
      user_id: userId,
      company,
      role: 'Engineer',
      stage: 'applied',
      follow_up_date: '2026-01-01',
    }) as Application;

  it('groups due applications by user', () => {
    const grouped = cron.groupByUser([
      app('u1', 'Acme'),
      app('u1', 'Globex'),
      app('u2', 'Initech'),
    ]);
    expect(grouped.get('u1')).toHaveLength(2);
    expect(grouped.get('u2')).toHaveLength(1);
  });

  it('sends one summary per user (no transport -> logged, not thrown)', async () => {
    const logSpy = jest.spyOn(cron as any, 'sendSummary').mockResolvedValue(undefined);
    followUps.findDueForAll.mockResolvedValue([
      app('u1', 'Acme'),
      app('u1', 'Globex'),
      app('u2', 'Initech'),
    ]);

    await cron.handleDailyReminders();

    expect(logSpy).toHaveBeenCalledTimes(2); // one per user with due apps
  });

  it('does nothing when no applications are due', async () => {
    const logSpy = jest.spyOn(cron as any, 'sendSummary').mockResolvedValue(undefined);
    followUps.findDueForAll.mockResolvedValue([]);

    await cron.handleDailyReminders();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('sendSummary without transport logs instead of sending', async () => {
    // ConfigService.get returns undefined -> no api key -> log path
    await expect(cron.sendSummary('u1', [app('u1', 'Acme')])).resolves.toBeUndefined();
  });
});