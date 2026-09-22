export type Stage = 'saved' | 'applied' | 'screened' | 'interview' | 'offer' | 'rejected';
export type Source = 'linkedin' | 'indeed' | 'referral' | 'other';

export interface Application {
  id: string;
  user_id: string;
  company: string;
  role: string;
  source: Source;
  stage: Stage;
  /** Nula mientras la fila esta guardada: todavia no postulaste, no hay fecha. */
  applied_date: string | null;
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageBucket {
  count: number;
  pct: number;
}

export interface PipelineStats {
  saved: StageBucket;
  applied: StageBucket;
  screened: StageBucket;
  interview: StageBucket;
  offer: StageBucket;
  rejected: { count: number };
  avgDaysInStage: number;
}