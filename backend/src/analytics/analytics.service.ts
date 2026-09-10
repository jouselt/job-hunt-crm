import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application } from '../applications/application.entity';
import { STAGES } from '../applications/stage.constants';

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

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Application)
    private readonly repo: Repository<Application>,
  ) {}

  async getPipelineStats(userId: string): Promise<PipelineStats> {
    const applied = await this.repo.count({
      where: { user_id: userId, stage: STAGES.APPLIED },
    });
    const screened = await this.repo.count({
      where: { user_id: userId, stage: STAGES.SCREENED },
    });
    const interview = await this.repo.count({
      where: { user_id: userId, stage: STAGES.INTERVIEW },
    });
    const offer = await this.repo.count({
      where: { user_id: userId, stage: STAGES.OFFER },
    });
    const rejected = await this.repo.count({
      where: { user_id: userId, stage: STAGES.REJECTED },
    });

    const activeTotal = applied + screened + interview + offer;

    const pct = (count: number) =>
      activeTotal === 0 ? 0 : Math.round((count / activeTotal) * 1000) / 10;

    const apps = await this.repo.find({
      where: { user_id: userId },
      select: ['applied_date'],
    });

    let avgDaysInStage = 0;
    if (apps.length > 0) {
      const now = new Date();
      const totalDays = apps.reduce((sum, a) => {
        const applied = new Date(a.applied_date + 'T00:00:00Z');
        return sum + Math.floor((now.getTime() - applied.getTime()) / 86400000);
      }, 0);
      avgDaysInStage = Math.round((totalDays / apps.length) * 10) / 10;
    }

    return {
      applied: { count: applied, pct: pct(applied) },
      screened: { count: screened, pct: pct(screened) },
      interview: { count: interview, pct: pct(interview) },
      offer: { count: offer, pct: pct(offer) },
      rejected: { count: rejected },
      avgDaysInStage,
    };
  }
}
