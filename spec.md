# Job Hunt CRM — Specification

## Purpose

This specification defines WHAT must be true after the Job Hunt CRM change is
complete. The system is a job application tracking web app (Angular 15 +
NestJS 10 + PostgreSQL) that lets a candidate log applications, track stage
lifecycle, schedule follow-ups, and view pipeline analytics — producing a
professional "recruiter signal" (show stage + next follow-up date on demand).

This document pins canonical data semantics (required fields, valid stage and
source values, isolation guarantees, analytics contracts). It intentionally
does **not** dictate implementation details: ORM choice, service internals,
database dialect, or cron / email library specifics are design/task concerns.

### Canonical decisions (reconciling proposal/design/tasks)

The following authoritative contracts are SET here and MUST be used by design
and tasks going forward:

1. **Data access layer**: PostgreSQL + NestJS. The ORM is an implementation
   decision (TypeORM or Prisma are both acceptable); the spec fixes only the
   behavior and data semantics below. The design.md Mongoose-style snippets
   (`.create({ data })`, `findByIdAndUpdate`, `$push`) are treated as informal
   sketches, not contracts.
2. **Stage enum** (canonical): `applied | screened | interview | offer |
   rejected`. `rejected` is a valid terminal state reachable from any active
   stage, but it is NOT a Kanban column (the pipeline board shows the 4 active
   stages only).
3. **Source enum** (canonical): `linkedin | indeed | referral | other`.
4. **Stage naming in analytics**: the analytics contract uses the canonical
   stage names below. The legacy names `interviewing` and `offers` seen in
   design sketches are replaced by `interview` and `offer` respectively.

---

## Domain 1: Applications CRUD

### Purpose

Candidates can create, read, and update their own job application records, and
records are strictly isolated per authenticated user.

### Requirements

#### Requirement: Application record shape

The system MUST represent each job application with the following fields:

| Field            | Type     | Required | Notes                                              |
|------------------|----------|----------|----------------------------------------------------|
| `id`             | string   | yes      | Unique identifier (system-generated)               |
| `user_id`        | string   | yes      | Owning user; set from authenticated identity       |
| `company`        | string   | yes      | Company / employer name                             |
| `role`           | string   | yes      | Job title / role                                    |
| `source`         | enum     | yes      | One of `linkedin`, `indeed`, `referral`, `other`    |
| `stage`          | enum     | yes      | One of `applied`, `screened`, `interview`, `offer`, `rejected` |
| `applied_date`   | date     | yes      | Date the application was submitted                  |
| `follow_up_date` | date     | no       | Next follow-up date (nullable)                      |
| `notes`          | string   | no       | Free-form notes                                     |
| `created_at`     | datetime | yes      | System-managed creation timestamp                   |
| `updated_at`     | datetime | yes      | System-managed last-modified timestamp              |

Additional fields MAY be introduced by design/tasks, but the above MUST be
present and MUST behave as described.

#### Scenario: Create a new application

- GIVEN an authenticated user
- WHEN they submit a new application with `company`, `role`, and `source`
- THEN the system stores the record with `stage` defaulting to `applied`,
  `applied_date` defaulting to the current date, and `user_id` set to the
  authenticated user.

#### Scenario: Create with missing required fields

- GIVEN an authenticated user
- WHEN they submit an application missing `company` or `role` (or with an
  invalid `source` value)
- THEN the request is rejected with a validation error and no record is stored.

#### Scenario: Default stage on creation

- GIVEN a new application is created without an explicit `stage`
- THEN the stored record's `stage` is `applied`.

#### Scenario: List own applications

- GIVEN an authenticated user
- WHEN they request their applications
- THEN the response contains all and only that user's application records.

#### Requirement: Per-user isolation (Row-Level Security)

The system MUST guarantee that a user can read and modify only their own
application records, regardless of how the backend is implemented. The exact
mechanism (PostgreSQL RLS policy `user_id = auth.uid()` or an equivalent
query-level filter in the service layer) is an implementation detail, but the
isolation guarantee MUST hold at the data layer so it cannot be bypassed by API
or UI bugs.

#### Scenario: Cannot read another user's data

- GIVEN user A has applications and user B is authenticated
- WHEN user B lists applications
- THEN none of user A's records are returned.

#### Scenario: Cannot update another user's data

- GIVEN user A owns application X and user B is authenticated
- WHEN user B attempts to update application X
- THEN the operation fails (not found or forbidden) and X is unchanged.

#### Requirement: Update stage

The system MUST allow the owning user to change an application's `stage`,
from a permitted current stage to a permitted target stage, per the stage
lifecycle rules in Domain 2.

#### Scenario: Promote stage

- GIVEN an application owned by the authenticated user with stage `applied`
- WHEN the user changes its stage to `screened`
- THEN the stored record's `stage` is updated to `screened` and `updated_at`
  is refreshed.

#### Scenario: Update stage of non-owned application

- GIVEN an application owned by another user
- WHEN the authenticated user attempts to change its stage
- THEN the operation fails and no change is persisted.

---

## Domain 2: Stage Lifecycle & Promotion

### Purpose

Applications move through a defined pipeline, and every promotion follows a
consistent rule for follow-up scheduling.

### Requirements

#### Requirement: Canonical stage set

The system MUST use exactly these stage values: `applied`, `screened`,
`interview`, `offer`, `rejected`. The active pipeline (forward movement) is:
`applied → screened → interview → offer`. `rejected` is a terminal state that
MAY be entered from any active stage and is NOT part of the forward pipeline.

#### Scenario: Allowed promotion

- GIVEN an application in stage `screened`
- WHEN the user promotes it
- THEN its stage becomes `interview`.

#### Scenario: Reject from any active stage

- GIVEN an application in stage `interview`
- WHEN the user marks it as `rejected`
- THEN its stage becomes `rejected` and it exits the active pipeline.

#### Scenario: Invalid stage value rejected

- GIVEN an attempt to set a stage value outside the canonical set (e.g.
  `interviewing`, `on-hold`)
- THEN the operation is rejected with a validation error.

#### Requirement: Promotion follows forward order

Active-stage promotions MUST follow the forward order `applied → screened →
interview → offer`. The system SHOULD prevent backward or skipping promotions
(e.g. `applied → offer` directly, or `interview → screened`) unless design
explicitly permits free movement. The Kanban/button UI MUST present forward
promotion only.

#### Scenario: Promotion out of order is not offered/allowed

- GIVEN an application in stage `applied`
- WHEN interacting with the pipeline UI
- THEN the only offered forward move is to `screened` (skipping to
  `interview` or `offer` is not offered and is rejected if attempted).

#### Requirement: Follow-up scheduling on promotion

When an application's stage is promoted, the system MUST set `follow_up_date`
to 7 days after the promotion date IF a follow-up date is not already set or
the existing follow-up date would otherwise leave the stage with no follow-up.
The system SHOULD NOT silently overwrite an explicit user-chosen follow-up
date unless the promotion explicitly triggers a refresh.

#### Scenario: Promotion sets follow-up to 7 days out

- GIVEN an application in stage `applied` with no `follow_up_date`
- WHEN it is promoted to `screened`
- THEN `follow_up_date` becomes the promotion date + 7 days.

#### Scenario: Promotion preserves explicit follow-up

- GIVEN an application with a user-set `follow_up_date` in the future
- WHEN it is promoted
- THEN the follow-up date is preserved (not overwritten).

#### Requirement: Stage display in pipeline board

The pipeline UI (Kanban) MUST present the four active stages (`applied`,
`screened`, `interview`, `offer`) as columns. Applications in state `rejected`
MUST NOT appear in the pipeline board as a forward column.

#### Scenario: Rejected applications excluded from board

- GIVEN one application in stage `rejected` and others in active stages
- WHEN the pipeline board renders
- THEN it shows the 4 active columns and the rejected application is not
  placed in any of those columns.

---

## Domain 3: Follow-up Reminders

### Purpose

The system detects applications due for follow-up and notifies the user on a
daily cadence.

### Requirements

#### Requirement: Due follow-up detection

The system MUST identify every application whose `follow_up_date` is less than
or equal to the current date (i.e., due today or overdue). Applications with a
null `follow_up_date` MUST NOT be considered due.

#### Scenario: Due today detected

- GIVEN an application with `follow_up_date` equal to today
- THEN it is included in the due follow-ups list.

#### Scenario: Overdue detected

- GIVEN an application with `follow_up_date` in the past
- THEN it is included in the due follow-ups list.

#### Scenario: Future not due

- GIVEN an application with `follow_up_date` in the future
- THEN it is not included in the due follow-ups list.

#### Scenario: Null follow-up ignored

- GIVEN an application with no `follow_up_date`
- THEN it is not included in the due follow-ups list.

#### Requirement: "Next follow-ups" list

The system MUST expose, via the UI, a "Next follow-ups" list showing the
applications due today (and, when applicable, later this week) with their
company, stage, and follow-up date. The list MUST be restricted to the
authenticated user's own applications.

#### Scenario: Next follow-ups shows only my due apps

- GIVEN user A has two due applications and user B has one due application
- WHEN user A views the "Next follow-ups" list
- THEN it shows A's two due applications and none of B's.

#### Requirement: Daily reminder notification

The system MUST run a daily reminder check (at 9:00 AM local/server time) that
finds all applications due on that day and sends the user an email/SMS
notification summarizing them (e.g., "You have X applications due for follow-up
today"). The delivery mechanism (SendGrid, edge function, node-cron) is an
implementation detail. The system SHOULD send a single summary per user rather
than one email per application.

#### Scenario: Daily email of due follow-ups

- GIVEN a user has 2 applications due today
- WHEN the daily reminder check runs (9:00 AM)
- THEN the user receives a single notification listing those 2 applications.

#### Scenario: No due applications, no notification

- GIVEN a user has no applications due today
- WHEN the daily reminder check runs
- THEN no notification is sent to that user.

#### Requirement: Snooze / advance behavior

The system SHOULD allow the user to resolve a due follow-up either by
advancing the stage (Domain 2) or by updating `follow_up_date` to a future
date; either action MUST remove the application from the due set. This is a
SHOULD-level capability for the MVP.

#### Scenario: Advancing stage clears due state

- GIVEN an application due today
- WHEN the user promotes its stage (triggering a new follow-up date in the
  future)
- THEN it no longer appears in the due list.

---

## Domain 4: Pipeline Analytics

### Purpose

The system computes and exposes aggregate statistics over the user's pipeline.

### Requirements

#### Requirement: Per-stage distribution

The system MUST compute, for the authenticated user, the count and percentage
of applications in each active stage (`applied`, `screened`, `interview`,
`offer`). Percentages MUST be computed relative to the total count of
applications in the active pipeline (excluding `rejected`), and the analytics
the distribution across active stages MUST sum to 100% (within rounding).
Rejected applications MAY be reported separately and SHOULD be excluded from
the active-stage percentages.

#### Scenario: Percentages computed correctly

- GIVEN a user has 10 active applications: 4 applied, 3 screened, 2 interview,
  1 offer
- WHEN analytics are computed
- THEN percentages are 40% applied, 30% screened, 20% interview, 10% offer.

#### Scenario: Rejected excluded from active percentages

- GIVEN a user has 5 active applications plus 2 rejected
- WHEN analytics are computed
- THEN percentages are computed over 5 applications (rejected not included in
  the 100% denominator).

#### Requirement: Average days-in-stage

The system MUST compute an average "days-in-stage" metric. For the `applied`
stage, days-in-stage is computed from `applied_date` to today (or to the
promotion date for applications already advanced). For subsequent stages, the
system SHOULD compute days-in-stage from the stage-entry timestamp. If
stage-entry timestamps are not tracked, the system MUST compute the `applied`
days-in-stage and MAY compute other stages by the same rule, clearly labeled.
The analytics contract MUST report `avgDaysInStage` as a single numeric value
in days (rounded to an appropriate precision).

#### Scenario: Avg days for applied stage

- GIVEN applications with `applied_date` 10, 20, and 30 days ago (all still
  in `applied`)
- WHEN analytics are computed
- THEN `avgDaysInStage` for `applied` is 20 days.

#### Requirement: Analytics response shape

The analytics endpoint MUST return per-stage counts and percentages plus an
average days-in-stage value. The response MUST use the canonical active-stage
keys `applied`, `screened`, `interview`, `offer`, and a top-level
`avgDaysInStage` field. It MAY also include a `rejected` count marked
separately.

#### Scenario: Analytics response uses canonical keys

- GIVEN an authenticated user with a populated pipeline
- WHEN they request pipeline analytics
- THEN the response contains `applied`, `screened`, `interview`, `offer`, and
  `avgDaysInStage` fields (with `rejected` reported separately if present).

#### Requirement: Analytics isolation

Analytics MUST be computed over the authenticated user's own applications only.

#### Scenario: Analytics scoped to user

- GIVEN user A has 3 applications and user B has 7
- WHEN user A requests analytics
- THEN the statistics reflect only A's 3 applications.

---

## Cross-cutting requirements

#### Requirement: Recruiter signal (quick retrieval)

The system MUST let the user, on demand, surface a concise view of their
pipeline: current stage counts and the next follow-up date(s). This MUST be
derivable from the data described above and require no manual record-keeping.

#### Scenario: One-glance status

- GIVEN a user with a populated pipeline
- WHEN they open the CRM dashboard
- THEN they can see their per-stage distribution and their next follow-up
  date immediately.