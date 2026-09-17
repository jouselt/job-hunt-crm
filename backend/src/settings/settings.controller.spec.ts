import { Test } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: any;

  beforeEach(async () => {
    service = {
      setJevKey: jest.fn(async () => undefined),
      getJevKeyMasked: jest.fn(async () => ({ configured: true, masked: '****abcd' })),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(SettingsController);
  });

  it('sets key for the authenticated user', async () => {
    await controller.setJevKey({ key: 'sk-test' }, { user: { userId: 'u1' } } as any);
    expect(service.setJevKey).toHaveBeenCalledWith('u1', 'sk-test');
  });

  it('returns masked status', async () => {
    const res = await controller.getJevKey({ user: { userId: 'u1' } } as any);
    expect(res).toEqual({ configured: true, masked: '****abcd' });
  });
});
