import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';

/**
 * Ordered rubric sent with the `fit` question. The API requires an ARRAY of at
 * least two level descriptions for `type: "score"` (a `{min,max}` object is
 * rejected with 422). The returned `score` is probability-weighted across these
 * levels, so with four levels it ranges 0..3: >= 2.0 means "good" or better.
 */
export const FIT_RUBRIC = ['poor', 'fair', 'good', 'strong'] as const;

/**
 * Hard limit for a single Jev request. `OfferTriageService` processes offers
 * serially in a for-loop, so one hung request would stall the entire cron run;
 * the original design specified 5 seconds.
 */
export const JEV_REQUEST_TIMEOUT_MS = 5000;

/**
 * `hard_gate` is phrased as a DISQUALIFIER on purpose: with `type: "noul"` the
 * answer is the probability that the answer is YES, so asking "is there a
 * reason to reject?" turns that probability into "likelihood of a blocker".
 * The triage rule then treats a LOW probability as "no blocker -> safe to
 * send". Phrasing it the other way round ("should we send?") would invert the
 * meaning and require the opposite threshold comparison.
 */
export const HARD_GATE_INSTRUCTIONS =
  'Is there a clear reason to reject this offer for this candidate (wrong target role, seniority mismatch, or a missing must-have skill)?';

/** Parsed Jev answers, ready for `decideTriage`. */
export interface JevTriageResult {
  /** Probability-weighted `fit` score on FIT_RUBRIC: 0..3. */
  fitScore: number;
  /** Model confidence in the `fit` score. */
  fitConfidence: number;
  /** Probability that the disqualifier question answered YES: 0..1. */
  hardGateProbability: number;
  /** Raw response body, kept for audit/debugging. */
  raw: any;
}

/**
 * Coerce a value from the (untrusted) API response into a finite number.
 * Anything else falls back to `fallback` so a missing or malformed answer can
 * never be mistaken for a real measurement.
 */
function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

@Injectable()
export class JevClient {
  private readonly logger = new Logger(JevClient.name);
  private readonly endpoint = 'https://api.typesafe.ai/v1/systemone';

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async resolveApiKey(userId: string): Promise<string> {
    try {
      return await this.settings.getJevKeyPlain(userId);
    } catch {
      const env = this.config.get<string>('JEV_API_KEY');
      if (!env)
        throw new Error('JEV_API_KEY not configured (user settings or env)');
      return env;
    }
  }

  async triage(
    offer: any,
    profile: any,
    userId: string,
  ): Promise<JevTriageResult> {
    const apiKey = await this.resolveApiKey(userId);
    const body = {
      state: { offer, profile },
      model: 'jev-latest',
      questions: {
        fit: {
          type: 'score',
          instructions:
            'Score how well this job offer matches the candidate profile, from "poor" (no match) to "strong" (excellent match).',
          criteria: [...FIT_RUBRIC],
        },
        hard_gate: {
          type: 'noul',
          instructions: HARD_GATE_INSTRUCTIONS,
        },
      },
    };

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        // Cancel the in-flight request AND reject the race below, so a hung
        // vendor surfaces as an error instead of resolving as an empty answer.
        controller.abort();
        reject(
          new Error(
            `Jev API request timed out after ${JEV_REQUEST_TIMEOUT_MS}ms`,
          ),
        );
      }, JEV_REQUEST_TIMEOUT_MS);
    });

    let res: Response;
    try {
      res = await Promise.race([
        fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Jev API error ${res.status}: ${text}`);
      throw new Error(`Jev API error ${res.status}`);
    }

    const data = await res.json();

    // Answers come back under `answers`; `questions` is only what we send.
    const answers = data?.answers ?? {};
    const fitAnswer = answers.fit;
    const gateAnswer = answers.hard_gate;

    return {
      fitScore: toFiniteNumber(fitAnswer?.score, 0),
      fitConfidence: toFiniteNumber(fitAnswer?.confidence, 0),
      // A missing `noul` means we cannot rule out a disqualifier: default to 1
      // so the offer goes to REVIEW instead of being auto-sent on bad data.
      hardGateProbability: toFiniteNumber(gateAnswer?.noul, 1),
      raw: data,
    };
  }
}
