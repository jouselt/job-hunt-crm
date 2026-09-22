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
  saved: StageBucket;
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
    const saved = await this.repo.count({
      where: { user_id: userId, stage: STAGES.SAVED },
    });
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

    // Guardar un aviso es estar en el pipeline, no estar muerto: entra en el total
    // activo, y asi las barras de la vista suman 100.
    const activeTotal = saved + applied + screened + interview + offer;

    const pct = (count: number) =>
      activeTotal === 0 ? 0 : Math.round((count / activeTotal) * 1000) / 10;

    const apps = await this.repo.find({
      where: { user_id: userId },
      select: ['applied_date'],
    });

    let avgDaysInStage = 0;
    // `applied_date` es nula mientras la fila esta guardada. Guardar un aviso no es
    // postular, asi que no entra en el promedio: contarla con una fecha inventada
    // mediria algo que no paso, y `null + 'T00:00:00Z'` da Invalid Date y un NaN.
    const appliedDates = apps
      .map((a) => a.applied_date)
      .filter((d): d is string => typeof d === 'string' && d.length > 0);

    if (appliedDates.length > 0) {
      const now = new Date();
      const totalDays = appliedDates.reduce((sum, d) => {
        const applied = new Date(`${d}T00:00:00Z`);
        return sum + Math.floor((now.getTime() - applied.getTime()) / 86400000);
      }, 0);
      avgDaysInStage = Math.round((totalDays / appliedDates.length) * 10) / 10;
    }

    return {
      saved: { count: saved, pct: pct(saved) },
      applied: { count: applied, pct: pct(applied) },
      screened: { count: screened, pct: pct(screened) },
      interview: { count: interview, pct: pct(interview) },
      offer: { count: offer, pct: pct(offer) },
      rejected: { count: rejected },
      avgDaysInStage,
    };
  }
}
