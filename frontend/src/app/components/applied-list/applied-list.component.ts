import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobHuntService } from '../../services/job-hunt.service';
import { Application } from '../../models/application.model';
import { StageBadgeComponent } from '../stage-badge/stage-badge.component';

@Component({
  selector: 'app-applied-list',
  standalone: true,
  imports: [CommonModule, StageBadgeComponent],
  template: `
    <div class="list-container">
      <h2>My Applications</h2>
      <table class="app-table" *ngIf="applications.length">
        <thead>
          <tr>
            <th>Company</th>
            <th>Role</th>
            <th>Source</th>
            <th>Stage</th>
            <th>Follow-up</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let app of applications" [class.due-soon]="isDueSoon(app)">
            <td>{{ app.company }}</td>
            <td>{{ app.role }}</td>
            <td>{{ app.source | titlecase }}</td>
            <td><app-stage-badge [application]="app"></app-stage-badge></td>
            <td>{{ app.follow_up_date | date:'mediumDate' }}</td>
            <td class="actions">
              <button class="btn-promote" (click)="onPromote(app)">Promote</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="empty" *ngIf="!applications.length">No applications yet. Add one!</div>
    </div>
  `,
  styles: [`
    .list-container { max-width: 900px; margin: 20px auto; }
    .app-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .app-table th { background: #f5f5f5; padding: 12px; text-align: left; font-weight: 600; }
    .app-table td { padding: 12px; border-bottom: 1px solid #eee; }
    .app-table tr:last-child td { border-bottom: none; }
    .app-table tr:hover { background: #fafafa; }
    .due-soon { background: #fff5f5; }
    .due-soon td:first-child { border-left: 4px solid #dc3545; }
    .actions { text-align: right; }
    .btn-promote { background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; }
    .btn-promote:hover { background: #218838; }
    .btn-promote:disabled { background: #ccc; cursor: not-allowed; }
    .empty { text-align: center; color: #999; padding: 40px; }
  `],
})
export class AppliedListComponent implements OnInit {
  applications: Application[] = [];

  constructor(private jobHuntService: JobHuntService) {}

  ngOnInit() {
    this.jobHuntService.applications$.subscribe(apps => this.applications = apps);
  }

  isDueSoon(app: Application): boolean {
    if (!app.follow_up_date) return false;
    const today = new Date();
    const followUp = new Date(app.follow_up_date + 'T00:00:00Z');
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(today.getDate() + 2);
    return followUp <= twoDaysFromNow;
  }

  onPromote(app: Application) {
    console.log(`Promote ${app.id} to next stage`);
  }
}
