import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { JobHuntService } from '../../services/job-hunt.service';

interface ReviewOffer {
  id: string;
  title: string;
  company: string;
  url?: string | null;
  location?: string | null;
  decision?: string | null;
  fitScore?: number | null;
  jevConfidence?: number | null;
  description?: string | null;
}

@Component({
  selector: 'app-triage',
  imports: [DecimalPipe, SlicePipe],
  templateUrl: './triage.component.html',
  styleUrls: ['./triage.component.css'],
})
export class TriageComponent implements OnInit {
  private readonly jobHunt = inject(JobHuntService);
  offers: ReviewOffer[] = [];
  busyId: string | null = null;
  error: string | null = null;

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.error = null;
    this.jobHunt.getReviewOffers().subscribe({
      next: (list) => (this.offers = list),
      error: () => (this.error = 'Could not load review offers'),
    });
  }

  send(id: string): void {
    this.busyId = id;
    this.jobHunt.sendOffer(id).subscribe({
      next: () => {
        this.busyId = null;
        this.refresh();
      },
      error: () => {
        this.busyId = null;
        this.error = 'Failed to send';
      },
    });
  }

  skip(id: string): void {
    this.busyId = id;
    this.jobHunt.skipOffer(id).subscribe({
      next: () => {
        this.busyId = null;
        this.refresh();
      },
      error: () => {
        this.busyId = null;
        this.error = 'Failed to skip';
      },
    });
  }
}
