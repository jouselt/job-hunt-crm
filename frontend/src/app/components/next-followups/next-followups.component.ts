import { Component, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { JobHuntService } from '../../services/job-hunt.service';
import { Application } from '../../models/application.model';
import { StageBadgeComponent } from '../stage-badge/stage-badge.component';

@Component({
  selector: 'app-next-followups',
  imports: [DatePipe, StageBadgeComponent],
  templateUrl: './next-followups.component.html',
  styleUrls: ['./next-followups.component.css'],
})
export class NextFollowUpsComponent implements OnInit {
  private readonly jobHunt = inject(JobHuntService);
  apps: Application[] = [];

  ngOnInit(): void {
    this.jobHunt.getDueFollowUps().subscribe((apps) => (this.apps = apps));
  }
}
