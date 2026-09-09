# Job Hunt CRM — Implementation Tasks

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2500 – 3500 (backend ~1200, frontend ~1500, seed/README/deploy ~400) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Backend) → PR 2 (Frontend) → PR 3 (Seed/README/Deploy/Demo) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

---

## Chain plan (autonomous work units)

- **PR 1 — Backend foundation (tasks 1–6):** NestJS init/auth/DAL, Application model + migration, CRUD, analytics, cron. Verifiable via Jest e2e + unit; no frontend dependency. Rollback: revert backend dir only.
- **PR 2 — Frontend standalone (tasks 7–11):** Angular init, `JobHuntService`, 4 components, wiring/routing. Verifiable via Jasmine (Karma) + manual `ng serve` against seeded/mock API. Rollback: revert frontend dir only.
- **PR 3 — Seed/README/Deploy/Demo (tasks 12–15):** seed dataset, README, Vercel deploy, end-to-end checklist. Rollback: revert docs/deploy config.

---

## PR 1 — Backend

### Task 1: NestJS init + TypeORM + PostgreSQL config + JWT auth
- Scaffold via `nest new backend` (or `npx @nestjs/cli@10 new backend`) at `backend/`.
- Add deps: `@nestjs/typeorm typeorm pg`, `@nestjs/jwt @nestjs/passport passport passport-jwt`, `class-validator class-transformer`, `@nestjs/config`, `node-cron`, `@sendgrid/mail`.
- Implement `backend/src/auth/` — `auth.module.ts`, `jwt.strategy.ts` (`JwtStrategy.validate()` → `{ userId }`), `JwtAuthGuard` re-export.
- Configure `backend/src/app.module.ts`: `ConfigModule.forRoot({isGlobal:true})`, `TypeOrmModule.forRootAsync` reading `DATABASE_URL` (or `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME`), `JwtModule.register` reading `JWT_SECRET`.
- Add `backend/.env.example` with `DATABASE_URL`, `JWT_SECRET`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`.
- **Verify:** `npm run start:dev` boots, connects to Postgres, `/health` returns 200 (add `backend/src/health/`).

### Task 2: Application entity + migration
- Create `backend/src/applications/application.entity.ts`: `id` uuid PK, `user_id` uuid, `company` text, `role` text, `source` enum (`linkedin | indeed | referral | other`), `stage` enum (`applied | screened | interview | offer | rejected`), `applied_date` date (default current), `follow_up_date` date nullable, `notes` text, `created_at`/`updated_at` timestamps.
- Add SQL CHECK on `source` and `stage`; indexes on `(user_id, stage)` and `(user_id, follow_up_date)`.
- Add RLS migration `0001-init` enabling RLS + policy `USING (user_id = current_setting('app.current_user_id')::uuid)`; grant to service role.
- Register entity in `TypeOrmModule.forFeature([Application])` within `ApplicationsModule` and migrate.
- **Verify:** `npm run migration:run` creates table/indexes/policy; `SELECT * FROM applications LIMIT 1` works.

### Task 3: Applications CRUD (controller + service + DTOs)
- `backend/src/applications/dto/create-application.dto.ts`: required `company`, `role`; `@IsEnum(Source)` source, `@IsEnum(Stage)` stage (optional, default applied); `applied_date`, `follow_up_date`, `notes` optional.
- `backend/src/applications/dto/update-stage.dto.ts`: `@IsEnum(Stage)` stage; reject non-canonical values (interviewing/on-hold/offers).
- `backend/src/applications/applications.service.ts`: `create(userId, dto)` (defaults stage=applied, applied_date=today; rejects missing company/role/invalid source), `findOwned(userId)`, `findOwnedById(userId, id)` (404 hides non-owned), `promoteStage(userId, id, stage)` enforcing forward order applied→screened→interview→offer, no skip/backward; sets `follow_up_date` = preserve-explicit-future | else +7days (rejected→null); `computeFollowUp`.
- Global `ValidationPipe` in `main.ts`.
- `applications.controller.ts`: `GET /applications`, `POST /applications`, `PATCH /applications/:id/stage` — all behind `JwtAuthGuard`.
- Export `ApplicationsService` from module for analytics/reminders reuse.
- **Verify:** Jest unit tests for `promoteStage` (forward only), `computeFollowUp` (rejected→null, preserve future, else +7), DTO validation rejects `interviewing`; e2e isolation test (user A cannot read/update user B's app → 404).

### Task 4: `getPipelineStats()` + `GET /analytics/pipeline`
- `backend/src/analytics/analytics.service.ts`: `getPipelineStats(userId)` returns canonical keys `applied/screened/interview/offer` counts + percentages (denominator = active total excluding rejected; sums to 100%), separate `rejected` count, and top-level `avgDaysInStage` = avg(today − applied_date) over active apps, 1-decimal. User-scoped (`where: { user_id: userId }`).
- `GET /analytics/pipeline` behind `JwtAuthGuard`, imports `ApplicationsModule`.
- **Verify:** Jest test: canonical keys present, active % sums to 100%, rejected excluded from active %, `avgDaysInStage` numeric.

### Task 5: node-cron daily 9am + SendGrid single-summary
- `backend/src/follow-ups/follow-ups.service.ts`: `findDue(userId)` where `follow_up_date <= today AND follow_up_date IS NOT NULL` (null never due).
- `backend/src/follow-ups/follow-ups.controller.ts`: `GET /follow-ups` (user-scoped due list: company, stage, follow_up_date).
- Cron `0 9 * * *` iterating notifyable users → one SendGrid summary email per user ("You have X applications due for follow-up today"); zero-due → zero email.
- **Verify:** Jest — `findDue` excludes null follow_up_date; cron test: single summary per user, zero-due skips SendGrid (mock).

---

## PR 2 — Frontend

### Task 6: Angular 15 standalone init + HttpClient + `JobHuntService`
- `ng new frontend --standalone --routing` at `frontend/`.
- Configure `provideHttpClient(withInterceptorsFromDi())` + base API URL via `environment.ts` (`API_URL`).
- `frontend/src/app/services/job-hunt.service.ts`: named observables `applications$` and `pipelineStats$` (single subject per domain, no duplicates); methods `loadApplications`, `createApplication`, `promoteStage(id, stage)`, `getPipelineStats`, `getDueFollowUps`.
- **Verify:** Jasmine unit test asserting exactly one `applications$` / `pipelineStats$` subject; `loadApplications` emits to `applications$`.

### Task 7: AppliedListComponent
- `frontend/src/app/components/applied-list/applied-list.component.ts` (standalone): table of `applications$`; color-coded stage badge; due-soon highlight (due soon = red) when `follow_up_date <= today+2`; "promote stage" button per row → `promoteStage`.
- **Verify:** Jasmine — renders rows from stream; due-soon row has red highlight; promote button calls service.

### Task 8: AddApplicationComponent
- `frontend/src/app/components/add-application/add-application.component.ts`: reactive form — company/role (required), source dropdown (linkedin|indeed|referral|other), stage picker, date pickers (applied/follow-up), notes textarea; validation mirrors DTO; submit → `createApplication` → navigate back to list.
- **Verify:** Jasmine — invalid (missing company/role, invalid source) blocks submit; valid submit calls `createApplication`.

### Task 9: KanbanBoardComponent
- `frontend/src/app/components/kanban-board/kanban-board.component.ts`: 4 columns (Applied → Screened → Interview → Offer); rejected never a column/card; drag-and-drop forward promotion ONLY (`promoteStage`) — skip/backward rejected.
- **Verify:** Jasmine — 4 columns rendered in order; rejected app not rendered; drop to non-next stage does not call promote.

### Task 10: PipelineOverviewComponent
- `frontend/src/app/components/pipeline-overview/pipeline-overview.component.ts`: bar chart (Chart.js/ng2-charts) of canonical keys `applied/screened/interview/offer` + separate `rejected` + top-level `avgDaysInStage`; numbers from `pipelineStats$`.
- **Verify:** Jasmine — renders canonical keys only (no `interviewing`/`offers`), shows rejected separately.

### Task 11: Module wiring + routing
- Wire all standalone components into routing (`app.routes.ts`): list, add, kanban, overview; navbar links.
- **Verify:** `ng serve` — navigate between routes; components render without console errors.

---

## PR 3 — Seed / README / Deploy / Demo

### Task 12: Seed test dataset
- `backend/src/seed/` (script `npm run seed`): insert 3 applications for a test user at distinct stages (e.g. applied, interview, offer) with follow-up dates.
- **Verify:** run seed → `GET /applications` returns 3; `GET /analytics/pipeline` counts match; promotion updates DB.

### Task 13: README
- `README.md`: step-by-step deploy (Angular + NestJS + PostgreSQL/Supabase), recruiter flow ("Ask me about my search and I'll show you my pipeline"), required env vars (`DATABASE_URL`, `JWT_SECRET`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `NEXT_PUBLIC_API_URL` → `API_URL`), local run commands, test commands.

### Task 14: Deploy NestJS API + Angular to Vercel
- Deploy NestJS API to Vercel (serverless) or Render; set env vars. Deploy Angular to Vercel; set `API_URL` to live API.
- `vercel.json` for both if applicable.
- **Verify:** live URL loads; add/promote/view pipeline against live API.

### Task 15: End-to-end demo checklist
- `(1) ng serve` + `nest start`, `(2)` open browser, `(3)` add 3 sample apps distinct stages, `(4)` promote one via Kanban, `(5)` view pipeline overview + next follow-ups, `(6)` recruiter scenario: candidate opens CRM → shows organized pipeline + next follow-up.