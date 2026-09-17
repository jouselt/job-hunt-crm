import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';

export type TriageGate = 'SEND' | 'SKIP' | 'NONE';

export interface JevTriageResult {
  fit: number;
  fitConfidence: number;
  gate: TriageGate;
  gateConfidence: number;
  raw: any;
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
      if (!env) throw new Error('JEV_API_KEY not configured (user settings or env)');
      return env;
    }
  }

  async triage(offer: any, profile: any, userId: string): Promise<JevTriageResult> {
    const apiKey = await this.resolveApiKey(userId);
    const body = {
      state: { offer, profile },
      model: 'jev-latest',
      questions: {
        fit: {
          type: 'score',
          instructions:
            'Score how well this job offer matches the candidate profile, from 0 (no match) to 1 (strong match).',
          criteria: { min: 0, max: 1 },
        },
        hard_gate: {
          type: 'choice',
          instructions:
            'Decide whether the candidate should SEND their CV for this offer, SKIP it, or NONE if the offer lacks enough information to decide.',
          criteria: {
            SEND: 'clear match, worth applying',
            SKIP: 'clear mismatch or irrelevant',
            NONE: 'insufficient information',
          },
        },
      },
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Jev API error ${res.status}: ${text}`);
      throw new Error(`Jev API error ${res.status}`);
    }

    const data = await res.json();
    const fitQ = data?.questions?.fit;
    const gateQ = data?.questions?.hard_gate;
    const gate: TriageGate = (['SEND', 'SKIP', 'NONE'].includes(gateQ?.choice)
      ? gateQ.choice
      : 'NONE') as TriageGate;

    return {
      fit: typeof fitQ?.score === 'number' ? fitQ.score : 0,
      fitConfidence: typeof fitQ?.confidence === 'number' ? fitQ.confidence : 0,
      gate,
      gateConfidence: typeof gateQ?.confidence === 'number' ? gateQ.confidence : 0,
      raw: data,
    };
  }
}
