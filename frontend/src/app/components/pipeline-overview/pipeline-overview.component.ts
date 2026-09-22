import { Component, OnInit } from '@angular/core';
import { KeyValuePipe, TitleCasePipe } from '@angular/common';
import { JobHuntService } from '../../services/job-hunt.service';
import { PipelineStats } from '../../models/application.model';

type BucketKey = keyof Omit<PipelineStats, 'rejected' | 'avgDaysInStage'>;
const CANONICAL_KEYS: BucketKey[] = [
  'saved',
  'applied',
  'screened',
  'interview',
  'offer',
];

@Component({
  selector: 'app-pipeline-overview',
  imports: [TitleCasePipe],
  templateUrl: './pipeline-overview.component.html',
  styleUrls: ['./pipeline-overview.component.css'],
})
export class PipelineOverviewComponent implements OnInit {
  stats: PipelineStats | null = null;
  readonly keys = CANONICAL_KEYS;

  constructor(private readonly jobHuntService: JobHuntService) {}

  ngOnInit(): void {
    this.jobHuntService.pipelineStats$.subscribe((s) => (this.stats = s));
    this.jobHuntService.getPipelineStats();
  }
}