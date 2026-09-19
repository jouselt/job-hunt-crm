import { Test } from '@nestjs/testing';
import { TriageProfileService } from './triage-profile.service';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_TRIAGE_PROFILE } from './profile.default';

describe('TriageProfileService', () => {
  let service: TriageProfileService;
  let settings: any;

  beforeEach(async () => {
    settings = { getTriageProfile: jest.fn(async () => null) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TriageProfileService,
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();
    service = moduleRef.get(TriageProfileService);
  });

  it('returns default when no user profile', async () => {
    expect(await service.getForUser('u1')).toBe(DEFAULT_TRIAGE_PROFILE);
  });

  it('returns the user profile when set', async () => {
    const p = { roles: ['Z'] };
    settings.getTriageProfile.mockResolvedValue(p);
    expect(await service.getForUser('u1')).toBe(p);
  });
});
