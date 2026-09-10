import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobHuntService } from '../../services/job-hunt.service';
import { Application, Stage } from '../../models/application.model';
import { StageBadgeComponent } from '../stage-badge/stage-badge.component';

interface Column {
  stage: Stage;
  title: string;
  applications: Application[];
}

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [CommonModule, StageBadgeComponent],
  template: `
    <div class="kanban">
      <div class="column" *ngFor="let col of columns">
        <div class="column-header">
          <h3>{{ col.title }}</h3>
          <span class="count">{{ col.applications.length }}</span>
        </div>
        <div class="cards">
          <div class="card" *ngFor="let app of col.applications">
            <app-stage-badge [application]="app"></app-stage-badge>
            <div class="card-body">
              <div class="card-company">{{ app.company }}</div>
              <div class="card-role">{{ app.role }}</div>
              <div class="card-source">via {{ app.source | titlecase }}</div>
            </div>
            <div class="card-actions">
              <button class="btn-next" (click)="promote(app)" [disabled]="app.stage === 'offer'">
                Next
              </button>
              <button class="btn-reject" (click)="reject(app)">
                Reject
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kanban { display: flex; gap: 16px; overflow-x: auto; padding: 20px; background: #f5f5f5; min-height: 70vh; }
    .column { flex: 0 0 280px; background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; flex-direction: column; }
    .column-header { padding: 12px 16px; background: #fafafa; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    .column-header h3 { margin: 0; font-size: 1em; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
    .count { background: #ddd; color: #666; border-radius: 10px; padding: 2px 8px; font-size: 0.85em; }
    .cards { flex: 1; padding: 12px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
    .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .card-body { margin: 8px 0; }
    .card-company { font-weight: 600; font-size: 1.05em; margin-bottom: 2px; }
    .card-role { color: #666; font-size: 0.95em; }
    .card-source { color: #999; font-size: 0.85em; margin-top: 4px; }
    .card-actions { display: flex; gap: 8px; margin-top: 8px; }
    .btn-next { flex: 1; background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em; }
    .btn-next:disabled { background: #ccc; cursor: not-allowed; }
    .btn-next:hover:not(:disabled) { background: #0056b3; }
    .btn-reject { background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em; }
    .btn-reject:hover { background: #c82333; }
  `],
})
export class KanbanBoardComponent implements OnInit {
  applications: Application[] = [];
  columns: Column[] = [
    { stage: 'applied', title: 'Applied', applications: [] },
    { stage: 'screened', title: 'Screened', applications: [] },
    { stage: 'interview', title: 'Interview', applications: [] },
    { stage: 'offer', title: 'Offer', applications: [] },
  ];

  constructor(private jobHuntService: JobHuntService) {}

  ngOnInit() {
    this.jobHuntService.applications$.subscribe(apps => {
      this.applications = apps.filter(a => a.stage !== 'rejected');
      this.columns.forEach(col => {
        col.applications = apps.filter(a => a.stage === col.stage);
      });
    });
  }

  promote(app: Application) {
    const nextStage = this.getNextStage(app.stage);
    if (!nextStage) return;
    // this.jobHuntService.promoteStage(app.id, nextStage, this.token);
    console.log(`Promote ${app.id} from ${app.stage} to ${nextStage}`);
  }

  reject(app: Application) {
    // this.jobHuntService.promoteStage(app.id, 'rejected', this.token);
    console.log(`Reject ${app.id}`);
  }

  private getNextStage(current: Stage): Stage | null {
    const order: Stage[] = ['applied', 'screened', 'interview', 'offer'];
    const idx = order.indexOf(current);
    return idx < order.length - 1 ? order[idx + 1] : null;
  }
}
