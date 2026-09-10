export const STAGES = {
  APPLIED: 'applied',
  SCREENED: 'screened',
  INTERVIEW: 'interview',
  OFFER: 'offer',
  REJECTED: 'rejected',
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

export const SOURCES = {
  LINKEDIN: 'linkedin',
  INDEED: 'indeed',
  REFERRAL: 'referral',
  OTHER: 'other',
} as const;

export type Source = (typeof SOURCES)[keyof typeof SOURCES];

/** Active forward-order pipeline (rejected is terminal and NOT a stage in this list). */
export const ACTIVE_STAGE_ORDER: readonly Stage[] = [
  STAGES.APPLIED,
  STAGES.SCREENED,
  STAGES.INTERVIEW,
  STAGES.OFFER,
] as const;

export const STAGE_ORDER: readonly Stage[] = [...ACTIVE_STAGE_ORDER, STAGES.REJECTED] as const;

export const ALL_STAGES: readonly Stage[] = Object.values(STAGES);
export const ALL_SOURCES: readonly Source[] = Object.values(SOURCES);