/**
 * Ask TypeSafe whether a key actually authenticates, BEFORE storing it.
 *
 * Storing an unverified key is what made a bad paste invisible: the write
 * succeeded, the UI said "Key saved.", and the failure only appeared later as a
 * 401 during a triage run, where it looks like a triage bug rather than a
 * configuration mistake.
 *
 * Lives outside SettingsService on purpose: JevClient already depends on
 * SettingsService, so putting the probe there would create a cycle.
 */

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_KEY_PROBE_TIMEOUT_MS = 8000;

export interface JevKeyProbeResult {
  /** TypeSafe answered 200 for this key. */
  verified: boolean;
  /** TypeSafe explicitly rejected the key (401). A rejected key must not be stored. */
  rejected: boolean;
  /** HTTP status, or null when the request never completed. */
  status: number | null;
  /** Human-readable outcome, safe to show in the UI. Never contains the key. */
  message: string;
}

export async function probeJevKey(
  apiKey: string,
  timeoutMs = JEV_KEY_PROBE_TIMEOUT_MS,
): Promise<JevKeyProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        state: 'Connectivity check.',
        model: 'jev-latest',
        questions: { reachable: { type: 'noul', instructions: 'Is this a connectivity check?' } },
      }),
      signal: controller.signal,
    });

    if (res.status === 200) {
      return { verified: true, rejected: false, status: 200, message: 'Key accepted by TypeSafe.' };
    }
    if (res.status === 401) {
      return {
        verified: false,
        rejected: true,
        status: 401,
        message:
          'TypeSafe rejected this key (401). Check that you pasted the API key itself and not something else.',
      };
    }
    // 429, 5xx and anything else: we cannot confirm the key, but we must not
    // refuse a possibly-valid key because the vendor is having a bad day.
    return {
      verified: false,
      rejected: false,
      status: res.status,
      message: `TypeSafe answered ${res.status}. The key was stored but could not be verified.`,
    };
  } catch {
    return {
      verified: false,
      rejected: false,
      status: null,
      message: 'Could not reach TypeSafe to verify the key. The key was stored anyway.',
    };
  } finally {
    clearTimeout(timer);
  }
}
