import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { UserSettings } from './user-settings.entity';

describe('SettingsService', () => {
  let service: SettingsService;
  let store: Map<string, UserSettings>;
  let repo: any;

  beforeEach(async () => {
    store = new Map<string, UserSettings>();
    repo = {
      findOne: jest.fn(async ({ where }: any) => store.get(where.userId) ?? null),
      create: jest.fn((e: any) => ({ ...e })),
      merge: jest.fn((existing: any, patch: any) => ({ ...existing, ...patch })),
      save: jest.fn(async (e: any) => {
        const key = e.userId;
        const merged = store.get(key) ? { ...store.get(key), ...e } : e;
        store.set(key, merged);
        return merged;
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

  it('returns masked key', async () => {
    await service.setJevKey('u2', 'sk-jev-1234abcd');
    expect(await service.getJevKeyMasked('u2')).toEqual({ configured: true, masked: '****abcd' });
  });

  it('reports not configured', async () => {
    expect(await service.getJevKeyMasked('nope')).toEqual({ configured: false, masked: null });
  });

  it('throws on plain when not configured', async () => {
    await expect(service.getJevKeyPlain('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores triage profile', async () => {
    const profile = { roles: ['X'], skills: ['Y'] };
    await service.setTriageProfile('u1', profile);
    expect(await service.getTriageProfile('u1')).toEqual(profile);
  });

  it('setJevKey does not wipe an existing profile (merge)', async () => {
    await service.setTriageProfile('u3', { roles: ['A'] });
    await service.setJevKey('u3', 'sk-secret');
    expect(await service.getTriageProfile('u3')).toEqual({ roles: ['A'] });
    expect(await service.getJevKeyPlain('u3')).toBe('sk-secret');
  });
});
