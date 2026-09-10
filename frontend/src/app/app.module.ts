import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AppliedListComponent } from './components/applied-list/applied-list.component';
import { AddApplicationComponent } from './components/add-application/add-application.component';
import { KanbanBoardComponent } from './components/kanban-board/kanban-board.component';
import { PipelineOverviewComponent } from './components/pipeline-overview/pipeline-overview.component';
import { StageBadgeComponent } from './components/stage-badge/stage-badge.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    ReactiveFormsModule,
    FormsModule,
    AppliedListComponent,
    AddApplicationComponent,
    KanbanBoardComponent,
    PipelineOverviewComponent,
    StageBadgeComponent,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
