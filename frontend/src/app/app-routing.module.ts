import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppliedListComponent } from './components/applied-list/applied-list.component';
import { AddApplicationComponent } from './components/add-application/add-application.component';
import { KanbanBoardComponent } from './components/kanban-board/kanban-board.component';
import { PipelineOverviewComponent } from './components/pipeline-overview/pipeline-overview.component';

const routes: Routes = [
  { path: '', redirectTo: 'list', pathMatch: 'full' },
  { path: 'list', component: AppliedListComponent },
  { path: 'add', component: AddApplicationComponent },
  { path: 'kanban', component: KanbanBoardComponent },
  { path: 'overview', component: PipelineOverviewComponent },
  { path: '**', redirectTo: 'list' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
