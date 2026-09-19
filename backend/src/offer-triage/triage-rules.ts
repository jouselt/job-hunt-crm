/**
 * Deterministic triage rules.
 *
 * The point of this feature is that the decision to send a CV is auditable:
 * the same Jev answers must always produce the same verdict, and the numbers
 * behind that verdict must live in exactly one place. This module holds both,
 * and it is deliberately pure (no I/O, no NestJS, no clock) so the boundaries
 * can be unit-tested without mocking the network.
 *
 * Jev is asked two questions (see jev-client.ts):
 *
 *   - `fit`       (type "score") -> a probability-weighted score on the rubric
 *                    ["poor", "fair", "good", "strong"], i.e. 0..3.
 *   - `hard_gate` (type "noul")  -> the probability that the answer is YES.
 *
 * `hard_gate` is phrased as a DISQUALIFIER ("is there a clear reason to reject
 * this offer?"), so its `noul` value is the probability of a BLOCKER, not the
 * probability of sending. A LOW value therefore means "no reason to reject"
 * and is the safe-to-send signal; a HIGH value means "stay away". The accepted
 * proposal implies this reading when it says "hard_gate prob < 0.2 -> SEND"
 * without spelling it out; the interpretation is made explicit here and in the
 * question wording itself.
 */

/** Minimum `fit` score: at least "good" on the poor/fair/good/strong rubric. */
export const FIT_MIN_GOOD = 2.0;

/**
 * Maximum tolerated probability that a disqualifier exists. At 0.2 or above
 * the offer is handed to a human instead of being auto-sent.
 */
export const HARD_GATE_MAX_DISQUALIFIER_PROBABILITY = 0.2;

export type TriageDecision = 'SEND' | 'REVIEW';

/**
 * The threshold rule, verbatim from the accepted proposal:
 *
 *   SEND   iff fitScore >= FIT_MIN_GOOD
 *              AND hardGateProbability < HARD_GATE_MAX_DISQUALIFIER_PROBABILITY
 *   REVIEW otherwise
 *
 * A non-finite input (NaN/Infinity, e.g. a missing or malformed Jev answer)
 * can never produce SEND: bad data falls back to a human.
 */
export function decideTriage(
  fitScore: number,
  hardGateProbability: number,
): TriageDecision {
  if (!Number.isFinite(fitScore) || !Number.isFinite(hardGateProbability)) {
    return 'REVIEW';
  }
  const fitIsGoodEnough = fitScore >= FIT_MIN_GOOD;
  const noDisqualifier =
    hardGateProbability < HARD_GATE_MAX_DISQUALIFIER_PROBABILITY;
  return fitIsGoodEnough && noDisqualifier ? 'SEND' : 'REVIEW';
}
