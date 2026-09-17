import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { UserSettings } from './user-settings.entity';

describe('SettingsService', () => {
  let service: SettingsService;
  let store: Map<string, UserSettings>;

  beforeEach(async () => {
    store = new Map<string, UserSettings>();
    const repo = {
      findOne: jest.fn(async ({ where }: any) => store.get(where.userId) ?? null),
      save: jest.fn(async (entity: any) => {
        store.set(entity.userId, entity);
        return entity;
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getRepositoryToken(UserSettings), useValue: repo },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
      ],
    }).compile();
    service = moduleRef.get(SettingsService);
  });

  it('encrypts and decrypts round-trip', async () => {
    await service.setJevKey('u1', 'sk-jev-1234abcd');
    expect(await service.getJevKeyPlain('u1')).toBe('sk-jev-1234abcd');
  });

  it('returns masked key on GET', async () => {
    await service.setJevKey('u2', 'sk-jev-1234abcd');
    const res = await service.getJevKeyMasked('u2');
    expect(res).toEqual({ configured: true, masked: '****abcd' });
  });

  it('reports not configured when absent', async () => {
    expect(await service.getJevKeyMasked('nope')).toEqual({
      configured: false,
      masked: null,
    });
  });

  it('throws when plain requested but not configured', async () => {
    await expect(service.getJevKeyPlain('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('same plaintext yields different ciphertext each save (random IV)', async () => {
    await service.setJevKey('u3', 'sk-jev-1234abcd');
    const first = store.get('u3')!.jevApiKeyEnc;
    await service.setJevKey('u3', 'sk-jev-1234abcd');
    const second = store.get('u3')!.jevApiKeyEnc;
    expect(first).not.toBe(second);
    expect(await service.getJevKeyPlain('u3')).toBe('sk-jev-1234abcd');
  });
});
