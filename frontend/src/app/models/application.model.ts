export type Stage = 'applied' | 'screened' | 'interview' | 'offer' | 'rejected';
export type Source = 'linkedin' | 'indeed' | 'referral' | 'other';

export interface Application {
  id: string;
  user_id: string;
  company: string;
  role: string;
  source: Source;
  stage: Stage;
  applied_date: string;
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
  applied: StageBucket;
  screened: StageBucket;
  interview: StageBucket;
  offer: StageBucket;
  rejected: { count: number };
  avgDaysInStage: number;
}
