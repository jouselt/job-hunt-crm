import { Component, Input } from '@angular/core';
import { Application } from '../../models/application.model';

@Component({
  selector: 'app-stage-badge',
  imports: [],
  template: `<span class="badge badge-{{ application.stage }}">{{ application.stage }}</span>`,
  styles: `
    .badge { padding: 2px 8px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 400; text-transform: capitalize; background: rgba(255,255,255,0.05); color: var(--color-fog); }
    .badge-saved { color: var(--color-ash); background: rgba(255,255,255,0.06); }
    .badge-applied { color: var(--color-signal-teal); background: rgba(2,184,204,0.12); }
    .badge-screened { color: var(--color-iris-violet); background: rgba(99,102,241,0.12); }
    .badge-interview { color: var(--color-lavender); background: rgba(139,92,246,0.12); }
    .badge-offer { color: var(--color-pulse-green); background: rgba(39,166,68,0.14); }
    .badge-rejected { color: var(--color-coral-red); background: rgba(235,87,87,0.10); text-decoration: line-through; }
  `,
})
export class StageBadgeComponent {
  @Input({ required: true }) application!: Application;
}