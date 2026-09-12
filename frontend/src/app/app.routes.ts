import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'list', pathMatch: 'full' },
  {
    path: 'list',
    loadComponent: () =>
      import('./components/applied-list/applied-list.component').then(
        (m) => m.AppliedListComponent,
      ),
  },
  {
    path: 'add',
    loadComponent: () =>
      import('./components/add-application/add-application.component').then(
        (m) => m.AddApplicationComponent,
      ),
  },
  {
    path: 'kanban',
    loadComponent: () =>
      import('./components/kanban-board/kanban-board.component').then(
        (m) => m.KanbanBoardComponent,
      ),
  },
  {
    path: 'overview',
    loadComponent: () =>
      import('./components/pipeline-overview/pipeline-overview.component').then(
        (m) => m.PipelineOverviewComponent,
      ),
  },
  { path: '**', redirectTo: 'list' },
];