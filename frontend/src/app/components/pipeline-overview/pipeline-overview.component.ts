import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JobHuntService } from '../../services/job-hunt.service';
import { Application, PipelineStats } from '../../models/application.model';
import { StageBadgeComponent } from '../stage-badge/stage-badge.component';

@Component({
  selector: 'app-pipeline-overview',
  standalone: true,
  imports: [CommonModule, StageBadgeComponent],
  template: `
    <div class="overview">
      <div class="stats-card" *ngIf="stats">
        <h3>Pipeline Overview</h3>
        <div class="stat-row" *ngFor="let stage of stages">
          <div class="stat-label">{{ stage | titlecase }}</div>
          <div class="stat-bar-container">
            <div class="stat-bar" [style.width.%]="stats[stage].pct"></div>
          </div>
          <div class="stat-value">{{ stats[stage].count }} ({{ stats[stage].pct }}%)</div>
        </div>
        <div class="stat-row rejected">
          <div class="stat-label">Rejected</div>
          <div class="stat-value">{{ stats.rejected.count }}</div>
        </div>
        <div class="avg-days">
          <strong>Avg days in stage:</strong> {{ stats.avgDaysInStage }} days
        </div>
      </div>
      <div class="loading" *ngIf="!stats">Loading...</div>
    </div>
  `,
  styles: [`
    .overview { max-width: 600px; margin: 20px auto; }
    .stats-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .stats-card h3 { margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    .stat-row { display: flex; align-items: center; margin-bottom: 12px; }
    .stat-label { width: 100px; font-weight: 600; }
    .stat-bar-container { flex: 1; background: #eee; height: 20px; border-radius: 4px; overflow: hidden; margin: 0 10px; }
    .stat-bar { height: 100%; background: #4caf50; transition: width 0.3s ease; }
    .stat-row.rejected .stat-bar { background: #9e9e9e; }
    .stat-value { width: 80px; text-align: right; font-size: 0.9em; color: #666; }
    .avg-days { margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee; color: #666; }
    .loading { text-align: center; color: #999; padding: 20px; }
  `],
})
export class PipelineOverviewComponent implements OnInit {
  stats: PipelineStats | null = null;
  stages: Array<keyof Pick<PipelineStats, 'applied' | 'screened' | 'interview' | 'offer'>> = ['applied', 'screened', 'interview', 'offer'];

  constructor(private jobHuntService: JobHuntService) {}

  ngOnInit() {
    // In a real app, this would be called with a token
    // For now, subscribe to the service's pipelineStats$
    this.jobHuntService.pipelineStats$.subscribe(stats => this.stats = stats);
    // Trigger load if token available
    // this.jobHuntService.getPipelineStats(token);
  }
}
