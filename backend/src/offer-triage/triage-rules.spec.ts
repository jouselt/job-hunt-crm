import {
  decideTriage,
  FIT_MIN_GOOD,
  HARD_GATE_MAX_DISQUALIFIER_PROBABILITY,
} from './triage-rules';

describe('decideTriage', () => {
  it('pins the threshold constants the rule is documented with', () => {
    expect(FIT_MIN_GOOD).toBe(2.0);
    expect(HARD_GATE_MAX_DISQUALIFIER_PROBABILITY).toBe(0.2);
  });

  it('SENDs when the fit score is exactly at the threshold and the disqualifier probability is below the cap', () => {
    expect(decideTriage(2.0, 0.19)).toBe('SEND');
    expect(decideTriage(2.0, 0)).toBe('SEND');
    expect(decideTriage(3.4, 0.199)).toBe('SEND');
  });

  it('REVIEWs when the fit score is below "good"', () => {
    expect(decideTriage(1.99, 0.19)).toBe('REVIEW');
    expect(decideTriage(1.99, 0)).toBe('REVIEW');
    expect(decideTriage(0, 0)).toBe('REVIEW');
  });

  it('REVIEWs when the disqualifier probability is exactly at the cap', () => {
    expect(decideTriage(2.0, 0.2)).toBe('REVIEW');
    expect(decideTriage(3.0, 0.2)).toBe('REVIEW');
    expect(decideTriage(3.0, 0.9)).toBe('REVIEW');
  });

  it('never SENDs on a non-finite input', () => {
    expect(decideTriage(NaN, 0)).toBe('REVIEW');
    expect(decideTriage(3.0, NaN)).toBe('REVIEW');
    expect(decideTriage(Infinity, 0.1)).toBe('REVIEW');
    expect(decideTriage(3.0, Infinity)).toBe('REVIEW');
    expect(decideTriage(-Infinity, -Infinity)).toBe('REVIEW');
    expect(decideTriage(NaN, NaN)).toBe('REVIEW');
    expect(decideTriage(undefined as unknown as number, 0.1)).toBe('REVIEW');
    expect(decideTriage(3.0, undefined as unknown as number)).toBe('REVIEW');
  });

  it('is deterministic: the same inputs always produce the same verdict', () => {
    const first = decideTriage(2.5, 0.1);
    const second = decideTriage(2.5, 0.1);
    expect(first).toBe('SEND');
    expect(second).toBe(first);
  });
});
