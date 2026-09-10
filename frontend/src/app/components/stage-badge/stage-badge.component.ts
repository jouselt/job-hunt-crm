import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Application } from '../../models/application.model';

@Component({
  selector: 'app-stage-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="badge" [class]="'badge-' + application.stage">
      {{ displayStage }}
    </span>
  `,
  styles: [`
    .badge { padding: 4px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 600; text-transform: capitalize; }
    .badge-applied { background: #e3f2fd; color: #1565c0; }
    .badge-screened { background: #e8f5e9; color: #2e7d32; }
    .badge-interview { background: #fff3e0; color: #e65100; }
    .badge-offer { background: #fce4ec; color: #c2185b; }
    .badge-rejected { background: #f5f5f5; color: #757575; text-decoration: line-through; }
  `],
})
export class StageBadgeComponent {
  @Input() application!: Application;

  get displayStage(): string {
    return this.application.stage;
  }
}
