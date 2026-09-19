import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JevClient } from './jev-client';
import { SettingsService } from '../settings/settings.service';

describe('JevClient', () => {
  let client: JevClient;
  let settings: any;
  let config: any;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    settings = { getJevKeyPlain: jest.fn(async () => 'user-key') };
    config = { get: () => undefined };
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    const moduleRef = await Test.createTestingModule({
      providers: [
        JevClient,
        { provide: SettingsService, useValue: settings },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    client = moduleRef.get(JevClient);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns SEND verdict and passes bearer key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        questions: {
          fit: { score: 0.9, confidence: 0.8 },
          hard_gate: { choice: 'SEND', confidence: 0.95 },
        },
      }),
    });
    const r = await client.triage({ title: 'X' }, { roles: ['X'] }, 'u1');
    expect(r.gate).toBe('SEND');
    expect(r.fit).toBeCloseTo(0.9);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer user-key' }),
      }),
    );
  });

  it('falls back to env key when user key missing', async () => {
    settings.getJevKeyPlain.mockRejectedValue(new Error('missing'));
    config.get = (k: string) => (k === 'JEV_API_KEY' ? 'env-key' : undefined);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ questions: { hard_gate: { choice: 'NONE' } } }),
    });
    const r = await client.triage({ title: 'X' }, {}, 'u1');
    expect(r.gate).toBe('NONE');
  });

  it('throws on API error and never logs the key', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    await expect(client.triage({ title: 'X' }, {}, 'u1')).rejects.toThrow('Jev API error 401');
  });
});
