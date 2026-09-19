import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JevClient, FIT_RUBRIC, JEV_REQUEST_TIMEOUT_MS } from './jev-client';
import { decideTriage } from './triage-rules';
import { SettingsService } from '../settings/settings.service';

/**
 * A response body in the shape documented at docs.typesafe.ai/api: answers come
 * back under `answers` (never `questions`, which is only what we send), and each
 * answer uses the fields of its question type ("score" -> score/confidence,
 * "noul" -> noul).
 */
const documentedSendResponse = {
  model: 'jev-latest',
  answers: {
    fit: {
      type: 'score',
      score: 3.1,
      legend: { '0': 'poor', '1': 'fair', '2': 'good', '3': 'strong' },
      probabilities: { '0': 0.01, '1': 0.03, '2': 0.16, '3': 0.8 },
      confidence: 0.91,
    },
    hard_gate: { type: 'noul', noul: 0.05 },
  },
  usage: { input_tokens: 900, output_tokens: 40 },
};

const okResponse = (json: any) => ({
  ok: true,
  status: 200,
  json: async () => json,
  text: async () => JSON.stringify(json),
});

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

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('parses the documented SEND response (answers.*) into SEND inputs', async () => {
    fetchMock.mockResolvedValue(okResponse(documentedSendResponse));

    const r = await client.triage({ title: 'X' }, { roles: ['X'] }, 'u1');

    expect(r.fitScore).toBeCloseTo(3.1);
    expect(r.fitConfidence).toBeCloseTo(0.91);
    expect(r.hardGateProbability).toBeCloseTo(0.05);
    expect(decideTriage(r.fitScore, r.hardGateProbability)).toBe('SEND');
  });

  it('sends the documented request body: score criteria as an array, hard_gate as a noul disqualifier', async () => {
    fetchMock.mockResolvedValue(okResponse(documentedSendResponse));

    await client.triage({ title: 'X' }, { roles: ['X'] }, 'u1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer user-key');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('jev-latest');
    expect(body.state).toEqual({ offer: { title: 'X' }, profile: { roles: ['X'] } });

    // `type: "score"` requires an ordered array of at least two levels.
    expect(body.questions.fit.type).toBe('score');
    expect(Array.isArray(body.questions.fit.criteria)).toBe(true);
    expect(body.questions.fit.criteria.length).toBeGreaterThanOrEqual(2);
    expect(body.questions.fit.criteria).toEqual([...FIT_RUBRIC]);

    // `hard_gate` is a yes/no disqualifier, not a three-way choice.
    expect(body.questions.hard_gate.type).toBe('noul');
    expect(body.questions.hard_gate.instructions.toLowerCase()).toContain(
      'reason to reject',
    );
    expect(body.questions.hard_gate.criteria).toBeUndefined();
  });

  it('falls back to the env key when the user has no saved key', async () => {
    settings.getJevKeyPlain.mockRejectedValue(new Error('missing'));
    config.get = (k: string) => (k === 'JEV_API_KEY' ? 'env-key' : undefined);
    fetchMock.mockResolvedValue(okResponse(documentedSendResponse));

    await client.triage({ title: 'X' }, {}, 'u1');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer env-key');
  });

  it('throws when neither a user key nor an env key is configured', async () => {
    settings.getJevKeyPlain.mockRejectedValue(new Error('missing'));

    await expect(client.triage({ title: 'X' }, {}, 'u1')).rejects.toThrow(
      'JEV_API_KEY not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on an API error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });

    await expect(client.triage({ title: 'X' }, {}, 'u1')).rejects.toThrow('Jev API error 401');
  });

  it('rejects instead of resolving an empty answer when the request hangs', async () => {
    jest.useFakeTimers();
    let seen: any;
    fetchMock.mockImplementation((_url: string, init: any) => {
      seen = init;
      // Never settles, like an unresponsive vendor.
      return new Promise(() => undefined);
    });

    const promise = client.triage({ title: 'X' }, {}, 'u1');
    const assertion = expect(promise).rejects.toThrow(
      `Jev API request timed out after ${JEV_REQUEST_TIMEOUT_MS}ms`,
    );

    // Let resolveApiKey settle so the request (and its timer) is registered.
    for (let i = 0; i < 10 && fetchMock.mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(JEV_REQUEST_TIMEOUT_MS + 1);
    await assertion;

    // The in-flight request is actually cancelled, not just abandoned.
    expect(seen.signal).toBeInstanceOf(AbortSignal);
    expect(seen.signal.aborted).toBe(true);
  });

  it('passes an abort signal and does not leave a timer behind on success', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(okResponse(documentedSendResponse));

    const r = await client.triage({ title: 'X' }, {}, 'u1');

    expect(r.fitScore).toBeCloseTo(3.1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    // The 5s timeout must not be pending once the call has resolved.
    expect(jest.getTimerCount()).toBe(0);
  });

  it('treats a malformed or empty response as REVIEW inputs, never SEND', async () => {
    fetchMock.mockResolvedValue(okResponse({ model: 'jev-latest' }));

    const r = await client.triage({ title: 'X' }, {}, 'u1');

    expect(Number.isFinite(r.fitScore)).toBe(true);
    expect(Number.isFinite(r.hardGateProbability)).toBe(true);
    expect(decideTriage(r.fitScore, r.hardGateProbability)).toBe('REVIEW');
  });

  it('ignores a legacy questions.* payload that has no answers', async () => {
    // This is the exact shape the old code read; it must not be mistaken for a verdict.
    fetchMock.mockResolvedValue(
      okResponse({ questions: { fit: { score: 0.9 }, hard_gate: { choice: 'SEND' } } }),
    );

    const r = await client.triage({ title: 'X' }, {}, 'u1');

    expect(decideTriage(r.fitScore, r.hardGateProbability)).toBe('REVIEW');
  });

  it('ignores non-numeric answer fields instead of coercing them', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        answers: {
          fit: { type: 'score', score: '3.1', confidence: null },
          hard_gate: { type: 'noul', noul: '0.05' },
        },
      }),
    );

    const r = await client.triage({ title: 'X' }, {}, 'u1');

    expect(r.fitScore).toBe(0);
    expect(r.hardGateProbability).toBe(1);
    expect(decideTriage(r.fitScore, r.hardGateProbability)).toBe('REVIEW');
  });
});
