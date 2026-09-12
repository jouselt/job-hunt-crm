import { Component, OnInit } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { JobHuntService } from '../../services/job-hunt.service';
import { Application } from '../../models/application.model';
import { StageBadgeComponent } from '../stage-badge/stage-badge.component';
import { nextStage } from '../../utils/stage.transitions';

@Component({
  selector: 'app-applied-list',
  imports: [DatePipe, TitleCasePipe, StageBadgeComponent],
  templateUrl: './applied-list.component.html',
  styleUrls: ['./applied-list.component.css'],
})
export class AppliedListComponent implements OnInit {
  applications: Application[] = [];

  constructor(private readonly jobHuntService: JobHuntService) {}

  ngOnInit(): void {
    this.jobHuntService.applications$.subscribe(
      (apps) => (this.applications = apps),
    );
    this.jobHuntService.loadApplications();
  }

  isDueSoon(app: Application): boolean {
    if (!app.follow_up_date) return false;
    const today = new Date();
    const followUp = new Date(app.follow_up_date + 'T00:00:00Z');
    const limit = new Date();
    limit.setDate(today.getDate() + 2);
    return followUp <= limit;
  }

  promote(app: Application): void {
    const target = nextStage(app.stage);
    if (!target) return;
    this.jobHuntService.promoteStage(app.id, target).subscribe();
  }

  reject(app: Application): void {
    this.jobHuntService.promoteStage(app.id, 'rejected').subscribe();
  }
}