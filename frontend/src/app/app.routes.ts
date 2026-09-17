import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'list', pathMatch: 'full' },
  {
    path: 'list',
    loadComponent: () =>
      import('./components/applied-list/applied-list.component').then(
        (m) => m.AppliedListComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'add',
    loadComponent: () =>
      import('./components/add-application/add-application.component').then(
        (m) => m.AddApplicationComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'kanban',
    loadComponent: () =>
      import('./components/kanban-board/kanban-board.component').then(
        (m) => m.KanbanBoardComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'overview',
    loadComponent: () =>
      import('./components/pipeline-overview/pipeline-overview.component').then(
        (m) => m.PipelineOverviewComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'follow-ups',
    loadComponent: () =>
      import('./components/next-followups/next-followups.component').then(
        (m) => m.NextFollowUpsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'triage',
    loadComponent: () =>
      import('./components/triage/triage.component').then((m) => m.TriageComponent),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./components/settings/settings.component').then((m) => m.SettingsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./components/login/login.component').then(
        (m) => m.LoginComponent,
      ),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./components/register/register.component').then(
        (m) => m.RegisterComponent,
      ),
  },
  { path: '**', redirectTo: 'list' },
];
