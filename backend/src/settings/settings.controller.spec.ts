import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SetJevKeyDto } from './dto/set-jev-key.dto';
import { SetProfileDto } from './dto/set-profile.dto';
import { probeJevKey } from './jev-key-probe';

jest.mock('./jev-key-probe', () => ({ probeJevKey: jest.fn() }));
const probeMock = probeJevKey as jest.MockedFunction<typeof probeJevKey>;

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
    probeMock.mockReset();
    probeMock.mockResolvedValue({
      verified: true,
      rejected: false,
      status: 200,
      message: 'Key accepted by TypeSafe.',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(SettingsController);
  });

  it('stores a key TypeSafe accepts', async () => {
    await controller.setJevKey(
      { key: 'apik_example_token_value' } as SetJevKeyDto,
      { user: { userId: 'u1' } } as any,
    );
    expect(probeMock).toHaveBeenCalledWith('apik_example_token_value');
    expect(service.setJevKey).toHaveBeenCalledWith('u1', 'apik_example_token_value');
  });

  it('refuses to store a key TypeSafe rejects, and says why', async () => {
    probeMock.mockResolvedValue({
      verified: false,
      rejected: true,
      status: 401,
      message: 'TypeSafe rejected this key (401).',
    });

    await expect(
      controller.setJevKey({ key: 'not_a_key' } as SetJevKeyDto, { user: { userId: 'u1' } } as any),
    ).rejects.toThrow(BadRequestException);

    // The whole point: a rejected key must not be persisted, because a stored
    // key that does not work turns a config mistake into a triage bug hunt.
    expect(service.setJevKey).not.toHaveBeenCalled();
  });

  it('stores a key it could not verify, so a vendor outage does not block setup', async () => {
    probeMock.mockResolvedValue({
      verified: false,
      rejected: false,
      status: null,
      message: 'Could not reach TypeSafe to verify the key. The key was stored anyway.',
    });

    await controller.setJevKey(
      { key: 'apik_example_token_value' } as SetJevKeyDto,
      { user: { userId: 'u1' } } as any,
    );

    expect(service.setJevKey).toHaveBeenCalledWith('u1', 'apik_example_token_value');
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
