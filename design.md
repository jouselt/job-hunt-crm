# Job Hunt CRM — Design (Angular 22 + NestJS 10 + PostgreSQL)

> This document owns **HOW**, reconciling the WHAT pinned in `spec.md`. It is the
> source-so-far; the mirror lives at `design.md` and the Engram topic key
> `sdd/job-hunt-crm/design`.
>
> Canonical contracts honored here (see spec.md):
> - Stage enum: `applied | screened | interview | offer | rejected` (rejected
>   terminal, not a Kanban column).
> - Source enum: `linkedin | indeed | referral | other`.
> - Analytics keys: `applied`, `screened`, `interview`, `offer`, top-level
>   `avgDaysInStage`, `rejected` reported separately.

---

## 1. Decisions At A Glance

| Concern              | Decision                                                               |
|----------------------|------------------------------------------------------------------------|
| ORM                  | **TypeORM** (`@nestjs/typeorm` + `typeorm`) — single, consistent DAL.  |
| Auth                 | JWT via `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`. **CURRENT STATE: credential-less** — `POST /auth/login` mints a token from any `userId`/`email` in the body with no password check (security hole). **Target:** real credential auth per `spec.md` Domain 0 (User entity, register, login verifies password). |
| Isolation mechanism  | Query-level `where: { user_id: userId }` in the service (application-  |
|                      | enforced) **plus** a DB-level RLS policy as defense-in-depth (below).   |
| Cron                 | `node-cron` daily `0 9 * * *` + SendGrid single summary per user.      |
| Migrations           | TypeORM migrations (`typeorm migration:generate`) tracked in repo.     |
| API layer            | REST: `POST /applications`, `GET /applications`, `PATCH /applications/:id/stage`, `GET /analytics/pipeline`, `GET /follow-ups`. |

---

## 2. One ORM: TypeORM

We standardize on **TypeORM**, removing all Prisma/Mongoose sketches from prior
revisions. Motivation:

- NestJS first-class integration via `@nestjs/typeorm` and `@InjectRepository`.
- Decorator-based entities map cleanly onto the PostgreSQL schema already
  specified.
- TypeORM Migrations provide a transparent, diff-able path for schema evolution
  (matches the "self-hosted later" escape hatch).

The previous design's `Model<Application>` + `create({ data })`,
`findByIdAndUpdate`, and `$push` were Mongoose idioms; they are dropped. All
data access goes through a `Repository<Application>`.

---

## 3. Database Schema

```sql
-- TypeORM migration will generate IF NOT EXISTS-safe DDL; this is the target.
CREATE TABLE applications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL,          -- from JWT `sub`
  company        TEXT        NOT NULL,
  role           TEXT        NOT NULL,
  source         TEXT        NOT NULL CHECK (source IN ('linkedin','indeed','referral','other')),
  stage          TEXT        NOT NULL CHECK (stage IN ('applied','screened','interview','offer','rejected'))
                   DEFAULT 'applied',
  applied_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  follow_up_date DATE,                          -- nullable; NOT considered due
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applications_user_stage ON applications (user_id, stage);
CREATE INDEX idx_applications_user_followup ON applications (user_id, follow_up_date);
```

### TypeORM entity

```typescript
export enum Stage {
  Applied = 'applied',
  Screened = 'screened',
  Interview = 'interview',
  Offer = 'offer',
  Rejected = 'rejected',
}

export enum Source {
  Linkedin = 'linkedin',
  Indeed = 'indeed',
  Referral = 'referral',
  Other = 'other',
}

@Entity('applications')
export class Application {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column('uuid') user_id: string;

  @Column() company: string;

  @Column() role: string;

  @Column({ type: 'enum', enum: Source }) source: Source;

  @Column({ type: 'enum', enum: Stage, default: Stage.Applied }) stage: Stage;

  @Column({ type: 'date' }) applied_date: string; // ISO date 'YYYY-MM-DD'

  @Column({ type: 'date', nullable: true }) follow_up_date: string | null;

  @Column({ type: 'text', nullable: true }) notes: string | null;

  @CreateDateColumn() created_at: Date;

  @UpdateDateColumn() updated_at: Date;
}
```

---

## 4. Auth & Per-User Isolation

> **STATUS — BROKEN, DO NOT TRUST.** The auth described below as "the design"
> is NOT what the code does. Current `AuthController.login` accepts
> `{ userId, email }` from the request body and calls `AuthService.generateToken`
> (a bare `jwt.sign({ sub: userId, email })`) with **no password check**. There
> is no `User` entity, no registration, and no password storage anywhere in
> `backend/src`. Any caller can mint a valid token for any `userId` and read or
> write that user's data. This is a security hole, not a design.
>
> The **target** design is `spec.md` Domain 0: a `User` entity (email unique,
> bcrypt-hashed password), `POST /auth/register`, and `POST /auth/login` that
> verifies the password and issues a JWT whose `sub` is the verified user id.
> Until that lands, the only thing protecting the instance is network isolation
> (Tailscale).

**Isolation guarantee (must hold, cannot be bypassed):** every read/write in
`ApplicationsService` is filtered by `user_id = <authenticated userId>`, and a
PostgreSQL RLS policy adds a second, DB-enforced layer. Two layers:

1. **Application layer (primary):** `ApplicationsService` always scopes queries
   with `where: { user_id: userId }` (from `request.user`). `update`/`remove`
   match on `{ id, user_id }` so a non-owner affecting another's row is
   impossible (returns not found).
2. **Database layer (defense-in-depth):** an RLS policy sets
   `current_user_id` from the JWT claim and restricts rows to
   `user_id = current_user_id`. Because the field is `user_id` (not `id`), the
   correct policy is:

```sql
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY applications_user_isolation ON applications
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);
-- app.current_user_id is SET LOCALLY from the validated JWT `sub` per connection.
```

This replaces the incorrect prior sketch `FOR USER USING(id) = auth.uid()`
(which referenced a nonexistent `id` column/`auth.uid()` function from a
Supabase-specific assumption). Either the RLS policy or the service-layer filter
alone must hold; we ship both so a bug in one never leaks data.

**Gap:** today `request.user.userId` comes from the token `sub` (client-asserted
`userId`), not a verified identity. Once Domain 0 lands, `sub` will be the
verified user's id and the isolation is real rather than self-asserted.

---

## 5. NestJS Module Structure

```
src/
  app.module.ts
  auth/
    auth.module.ts
    auth.controller.ts
    jwt.strategy.ts          // passport-jwt → { userId }
    jwt-auth.guard.ts
    auth.service.ts
  applications/
    applications.module.ts
    applications.controller.ts
    application.entity.ts
    applications.service.ts
    dto/
      create-application.dto.ts
      update-stage.dto.ts
    applications.presenter.ts   // entity → API shape (timestamps, nulls)
  analytics/
    analytics.module.ts
    analytics.controller.ts
    analytics.service.ts
    dto/pipeline-stats.dto.ts
  follow-ups/
    follow-ups.module.ts
    follow-ups.controller.ts
    follow-ups.service.ts
    reminders.cron.ts         // node-cron 0 9 * * *
  health/
    health.controller.ts
  migrations/
    0001-init.ts
```

`ApplicationsModule` imports `TypeOrmModule.forFeature([Application])`.
`AnalyticsModule` and `FollowUpsModule` import `ApplicationsModule` (exported
service) so analytics and reminders reuse a single DAL.

---

## 6. Service & Controller Contracts

### `ApplicationsService`

```typescript
@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly repo: Repository<Application>,
  ) {}

  async create(dto: CreateApplicationDto, userId: string): Promise<Application> {
    const app = this.repo.create({
      ...dto,
      user_id: userId,
      stage: dto.stage ?? Stage.Applied,          // default applied
      applied_date: dto.applied_date ?? new Date().toISOString().slice(0, 10),
    });
    return this.repo.save(app);
  }

  findAll(userId: string): Promise<Application[]> {
    return this.repo.find({ where: { user_id: userId }, order: { applied_date: 'DESC' } });
  }

  async findOwned(id: string, userId: string): Promise<Application> {
    const app = await this.repo.findOne({ where: { id, user_id: userId } });
    if (!app) throw new NotFoundException();      // 404, hides non-owned rows
    return app;
  }

  async updateStage(id: string, dto: UpdateStageDto, userId: string): Promise<Application> {
    const app = await this.findOwned(id, userId);
    const next = promoteStage(app.stage, dto.stage); // validates forward/reject order
    app.stage = next;
    app.follow_up_date = computeFollowUp(next, app.follow_up_date); // see §7
    return this.repo.save(app);
  }

  findDue(userId: string): Promise<Application[]> {
    return this.repo.find({
      where: {
        user_id: userId,
        follow_up_date: Raw(alias => `${alias} <= CURRENT_DATE`), // null never matches
      },
    });
  }
}
```

**Stage promotion rule** (`promoteStage`): active forward order is
`applied → screened → interview → offer`. Backward or skipping moves are rejected
(`BadRequestException`). `rejected` is reachable from any active stage
(`... → rejected`), and from `rejected` there is no forward move.

```typescript
const ORDER: Record<Stage, number> = {
  [Stage.Applied]: 0, [Stage.Screened]: 1, [Stage.Interview]: 2, [Stage.Offer]: 3,
};

function promoteStage(current: Stage, target: Stage): Stage {
  if (target === Stage.Rejected) return Stage.Rejected; // terminal, from any active stage
  if (current === Stage.Rejected) throw new BadRequestException('rejected is terminal');
  if (ORDER[target] === ORDER[current] + 1) return target;        // forward only, no skip
  throw new BadRequestException(`cannot move ${current} -> ${target}`);
}
```

### `ApplicationsController`

```
POST   /applications              body CreateApplicationDto        → 201 Application
GET    /applications              (user-scoped)                    → 200 Application[]
PATCH  /applications/:id/stage    body { stage }                   → 200 Application
```

All routes are behind `JwtAuthGuard`.

### DTO validation (`class-validator` + `ValidationPipe`)

```typescript
export class CreateApplicationDto {
  @IsString() @IsNotEmpty() company: string;
  @IsString() @IsNotEmpty() role: string;
  @IsEnum(Source) source: Source;
  @IsOptional() @IsEnum(Stage) stage?: Stage;          // defaults to Applied
  @IsOptional() @IsDateString() applied_date?: string;
  @IsOptional() @IsDateString() follow_up_date?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateStageDto {
  @IsEnum(Stage) stage: Stage;
}
```

Invalid `source`/`stage` values (including legacy `interviewing`, `on-hold`)
are rejected by `@IsEnum`/`ValidationPipe` before any DB write.

---

## 7. Follow-up Scheduling Logic

`computeFollowUp(stage, existingFollowUp)`:

- If `stage === Stage.Rejected`, return `null` (rejected apps are out of the
  pipeline and not due).
- If `existingFollowUp` is set **and in the future**, preserve it (do not
  silently overwrite an explicit user choice).
- Otherwise (null or past), return `today + 7 days`.

A due application is resolved either by promotion (sets a fresh +7d date) or by
the user explicitly setting a future `follow_up_date`; both remove it from the
`findDue` set.

---

## 8. Analytics (`AnalyticsService`)

```typescript
export interface StageBucket { count: number; pct: number; }

export interface PipelineStatsDto {
  applied: StageBucket;
  screened: StageBucket;
  interview: StageBucket;
  offer: StageBucket;
  rejected: { count: number };   // reported separately, excluded from denominator
  avgDaysInStage: number;        // top-level, days (applied_date → today)
}
```

- Counts: `repo.count({ where: { user_id, stage } })` for each canonical stage.
  Percentages compute over **active total** = `applied+screened+interview+offer`
  (excludes `rejected`), so active percentages sum to 100% (round to 1 decimal).
- `avgDaysInStage`: average of `(today - applied_date)` across all the user's
  applications using `applied_date` (labeled clearly; stage-entry timestamps are
  an optional future refinement). Reported as one numeric value, days, rounded
  to 1 decimal.
- Canonical keys only: `applied`, `screened`, `interview`, `offer`,
  `avgDaysInStage`, `rejected`. Legacy `interviewing`/`offers` keys are gone.

```
GET /analytics/pipeline   → 200 PipelineStatsDto  (user-scoped)
```

---

## 9. Follow-up Reminders (cron)

`RemindersCron` (in `FollowUpsModule`) runs `node-cron` `0 9 * * *` (daily
9:00 AM server time):

1. For each user with due applications, fetch due apps via
   `ApplicationsService.findDue(userId)` grouped per user.
2. Send **one** summary email per user via SendGrid (e.g. "You have N
   applications due for follow-up today"), not one email per application.
3. Skip users with no due applications.

```ts
@Cron('0 9 * * *')
async sendDailyReminders() {
  const users = await this.dueAggregator.userIdsWithDue();  // distinct user_id where due
  for (const userId of users) {
    const due = await this.applications.findDue(userId);
    if (due.length === 0) continue;                            // nothing due → no email
    await this.sendgrid.sendSummary(userId, due);              // single summary per user
  }
}
```

The `GET /follow-ups` endpoint also exposes the user-scoped "Next follow-ups"
list for UI display (company, stage, follow-up date).

---

## 10. Frontend Behavior Contracts (Angular 22 standalone)

The spec owns the WHAT; the Angular side is expressed here at the **behavior
contract** level, not as a broken code sketch. The prior `JobHuntService` sketch
(duplicate `behaviorSubject` field, stray `$ = this.behaviorSubject.asObservable()`
mixing two subjects) is removed.

**Service responsibilities (`JobHuntService`):**

| Method               | Contract                                                            |
|----------------------|---------------------------------------------------------------------|
| `loadApplications()` | `GET /applications` → emits the user's applications.                 |
| `createApplication(dto)` | `POST /applications` → returns created record; refreshes list.   |
| `promoteStage(id, stage)` | `PATCH /applications/:id/stage` with forward/reject target.      |
| `getPipelineStats()` | `GET /analytics/pipeline` → `PipelineStatsDto`.                      |
| `getDueFollowUps()`  | `GET /follow-ups` → due applications for the "Next follow-ups" list. |

**State exposure:** the service exposes *two* named streams (single sources of
truth, no duplicate subjects):

- `applications$: Observable<Application[]>` — current user's records.
- `pipelineStats$: Observable<PipelineStatsDto> | null` — latest analytics.

Each mutation (`createApplication`, `promoteStage`) emits onto `applications$`;
`getPipelineStats()` emits onto `pipelineStats$`. Implementations may use
`BehaviorSubject`/`Subject` internally, but the contract is: **named observables,
one per domain state, no duplicate/shadowed fields.**

**Component/columns mapping:**

- **Applied List** — table of `applications$` (company, stage badge,
  follow-up date, promote button). Promote button offers only the forward next
  stage, plus a separate "Reject" action.
- **Add/Edit form** — company, role, source dropdown (`linkedin | indeed |
  referral | other`), notes, optional applied/follow-up date. Syntactic-validates
  required fields client-side; server is authoritative.
- **Kanban board** — **4 columns**: Applied → Screened → Interview → Offer.
  Drag-and-drop moves a card forward one column (or to Reject). `rejected`
  applications never appear as a column/card.
- **Pipeline Overview** — renders `applied`, `screened`, `interview`, `offer`
  (count + %), a separate rejected count, and `avgDaysInStage`.
- **Next follow-ups** — due list from `getDueFollowUps()` (recruiter-signal view).

---

## 11. Migration Approach

- TypeORM migrations generated with `typeorm migration:generate`; run via
  `typeorm migration:run` on deploy (`npm run migration:run`).
- Migration `0001-init` creates the `applications` table (name change-free), the
  two indexes, and enables the RLS policy from §4.
- Schema evolution is append-only through new migrations; entities and
  migrations are kept in the repo together.

---

## 12. Test Strategy

| Layer          | Framework          | Coverage focus                                                        |
|----------------|--------------------|-----------------------------------------------------------------------|
| Unit — service | Jest               | `promoteStage` forward/reject validation, `computeFollowUp` (7-day / preserve), `findDue` null-exclusion. |
| Unit — DTO     | Jest + class-validator | Rejects invalid `source`/`stage` (`interviewing`, `on-hold`), missing company/role. |
| e2e — API      | `@nestjs/testing` + supertest (test Postgres or SQLite mirror) | CRUD isolation (user A cannot read/update B), analytics canonical keys + 100% active sum, rejected exclusion. |
| Angular        | Jasmine/Karma      | `JobHuntService` emits correct streams; Kanban shows 4 columns; rejected excluded; form validation. |
| Cron           | Jest (mock SendGrid) | Single summary per user; zero due → zero emails.                       |

Key acceptance verifications:
- Per-user isolation holds at both service layer and RLS (test non-owner 404).
- Analytics returns canonical keys and rejects are excluded from the 100% denominator.
- 4-column Kanban; `rejected` never promoted/placed as a forward column.
- Promotion sets follow-up +7d if unset, preserves explicit future follow-up.

---

## 13. Trade-offs

- **TypeORM over Prisma/Optional Mongoose**: single dialect-agnostic repository
  API with NestJS-native DI and migration support; avoids the mixed-ORM sketch of
  earlier revisions.
- **Query-layer + RLS isolation over RLS-only**: RLS alone depends on connection
  `current_setting` plumbing; the service-layer `where: { user_id }` is the
  guaranteed backstop, RLS is defense-in-depth. Both ship.
- **`avgDaysInStage` via `applied_date` only (MVP)**: avoids tracking stage-entry
  timestamps now; labeled clearly, refined later if needed.
- **JWT (`@nestjs/jwt`/passport) over Supabase-only auth**: keeps auth portable
  between self-hosted Postgres and Supabase.

---

## 14. Acceptance Criteria (design-verifiable)

- [ ] Single ORM (TypeORM) used throughout; no Mongoose/Prisma idioms remain.
- [ ] Stage enum is exactly `applied|screened|interview|offer|rejected`; rejected is terminal, excluded from the 4-column board.
- [ ] Source enum is exactly `linkedin|indeed|referral|other` (SQL CHECK + DTO `@IsEnum`).
- [ ] Analytics response uses `applied`, `screened`, `interview`, `offer`, `avgDaysInStage` (+ separate `rejected`); legacy keys removed.
- [ ] Per-user isolation holds (service filter + RLS on `user_id`, not `id`); non-owner read/update fails.
- [ ] `node-cron` daily 9am sends a single SendGrid summary per user; no email when none due.
- [ ] Follow-up promotion sets +7d if unset; preserves explicit future follow-up.
- [ ] Angular service exposes named observables (no duplicate/shadowed subjects).