import { Test } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SetJevKeyDto } from './dto/set-jev-key.dto';
import { SetProfileDto } from './dto/set-profile.dto';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: any;

  beforeEach(async () => {
    service = {
      setJevKey: jest.fn(async () => undefined),
      getJevKeyMasked: jest.fn(async () => ({ configured: true, masked: '****abcd' })),
      setTriageProfile: jest.fn(async () => undefined),
      getTriageProfile: jest.fn(async () => ({ roles: ['X'] })),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(SettingsController);
  });

  it('sets key', async () => {
    await controller.setJevKey({ key: 'sk' } as SetJevKeyDto, { user: { userId: 'u1' } } as any);
    expect(service.setJevKey).toHaveBeenCalledWith('u1', 'sk');
  });

  it('gets masked', async () => {
    expect(await controller.getJevKey({ user: { userId: 'u1' } } as any)).toEqual({
      configured: true,
      masked: '****abcd',
    });
  });

  it('sets profile', async () => {
    await controller.setProfile(
      { profile: { roles: ['X'] } } as SetProfileDto,
      { user: { userId: 'u1' } } as any,
    );
    expect(service.setTriageProfile).toHaveBeenCalledWith('u1', { roles: ['X'] });
  });

  it('gets profile', async () => {
    expect(await controller.getProfile({ user: { userId: 'u1' } } as any)).toEqual({
      configured: true,
      profile: { roles: ['X'] },
    });
  });
});
