import { Component, OnInit } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { JobHuntService } from '../../services/job-hunt.service';
import { Application, Stage } from '../../models/application.model';
import { StageBadgeComponent } from '../stage-badge/stage-badge.component';
import { KANBAN_COLUMNS, nextStage } from '../../utils/stage.transitions';

interface Column {
  stage: Stage;
  title: string;
  applications: Application[];
}

@Component({
  selector: 'app-kanban-board',
  imports: [TitleCasePipe, StageBadgeComponent],
  templateUrl: './kanban-board.component.html',
  styleUrls: ['./kanban-board.component.css'],
})
export class KanbanBoardComponent implements OnInit {
  columns: Column[] = KANBAN_COLUMNS.map((stage) => ({
    stage,
    title: stage,
    applications: [],
  }));

  private draggingId: string | null = null;

  constructor(private readonly jobHuntService: JobHuntService) {}

  ngOnInit(): void {
    this.jobHuntService.applications$.subscribe((apps) => this.assign(apps));
    this.jobHuntService.loadApplications();
  }

  private assign(apps: Application[]): void {
    this.columns.forEach(
      (col) =>
        (col.applications = apps.filter((a) => a.stage === col.stage)),
    );
  }

  onDragStart(id: string): void {
    this.draggingId = id;
  }

  canDrop(col: Column): boolean {
    if (!this.draggingId) return false;
    const dragging = this.findDragging();
    if (!dragging) return false;
    return nextStage(dragging.stage) === col.stage;
  }

  onDrop(col: Column): void {
    if (!this.canDrop(col)) return;
    const dragging = this.findDragging();
    this.draggingId = null;
    if (!dragging) return;
    this.jobHuntService.promoteStage(dragging.id, col.stage).subscribe();
  }

  promote(app: Application): void {
    const target = nextStage(app.stage);
    if (!target) return;
    this.jobHuntService.promoteStage(app.id, target).subscribe();
  }

  reject(app: Application): void {
    this.jobHuntService.promoteStage(app.id, 'rejected').subscribe();
  }

  private findDragging(): Application | undefined {
    for (const col of this.columns) {
      const found = col.applications.find((a) => a.id === this.draggingId);
      if (found) return found;
    }
    return undefined;
  }
}