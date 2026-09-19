# Deterministic Offer Triage — Plan (spec / design / tasks)

> SDD planning artifact for `07-job-hunt-crm` (Job Hunt CRM).
> Mode: **engram** (preflight: Pace=Automático, Artifacts=Engram, PR strategy=Un solo PR, ≤400 líneas/PR).
> NOTE: Engram MCP was unavailable at write time, so this file is the fallback persistence; sync to Engram (`sdd/07-job-hunt-crm/{proposal,spec,design,tasks}`) when it reconnects. No code was written.

## Intent
Pull job offers discovered by the companion `ai-job-search` workspace, use TypeSafe AI's **Jev** decision-only model to **deterministically** decide whether to send the user's CV, and on a positive verdict auto-create an `Application` card in the existing kanban pipeline (`stage=applied`) carrying the full sent context (offer link, Jev verdict, fit score, what was sent). Type-safe, auditable, reproducible — not a flaky LLM.

## Scope
- **IN:** new `OfferTriageModule` in the CRM backend (NestJS): `Offer` entity + import endpoint + triage service + Jev client; Jev integration (`POST /v1/systemone`) with fixed thresholds; auto-create `Application` on positive verdict (kanban col 1, no frontend change for display); typed candidate profile (user-maintained) as Jev state input.
- **OUT:** no scraping inside CRM (StepStone scraping stays in `ai-job-search`; CRM ingests pushed JSON only). "Send" = create the kanban card + record sent artifacts (CV/cover letter ref). Actual transmission to the portal `applyUrl` is **MANUAL** (out of scope — resolves auto-apply risk). Cover-letter generation via local Ollama is a later optional phase (draft only).

---

## SPEC (requirements + acceptance scenarios)

**REQ-1 Offer ingestion (authenticated):** `POST /offers/import` (`JwtAuthGuard`) accepts offer JSON `{id,title,company,companyUrl,location,url,description,deadline,applyUrl}`.
- A: valid payload → 201, `Offer` persisted (`user_id` from JWT), dedupe on external id (re-import updates).
- B: no JWT → 401.
- C: missing required field → 400 with field errors.

**REQ-2 Per-user isolation:** offers, triage and `Application`s scoped by `user_id`; a user never sees another's.

**REQ-3 Deterministic triage via Jev:** `OfferTriageService` POSTs Jev `{state:{offer,candidateProfile}, questions:{fit:Score[poor..strong], hard_gate:Noul}}`.
- A: `fit>=good` AND `hard_gate` prob `<0.2` → `decision=SEND` (confidence recorded).
- B: else → `decision=REVIEW` (flagged, no card).
- C: Jev error/timeout → `decision=REVIEW` (safe fallback), error logged, no card.
- D: same inputs → same decision (fixed thresholds; deterministic, auditable).

**REQ-4 Audit log:** every decision stores raw Jev output (`choice/score/noul` + `probabilities` + `confidence`) on the `Offer`; queryable.

**REQ-5 Send creates Application:** on SEND `ApplicationsService.create({company, role:title, source:'ai-job-search', stage:'applied', applied_date:now, follow_up_date:now+7d, notes: offer.url + Jev verdict + fit + sent artifacts})`.
- A: card appears in kanban column 1 automatically (groups by stage; no frontend change).
- B: dedupe — offer already SENT/SKIPPED not re-created/re-triaged.

**REQ-6 Send scope:** creates card + records sent artifacts (`cv/main.pdf`, cover_letter ref). Does **NOT** transmit to `applyUrl` (manual). Auto-apply out of scope.

**REQ-7 Candidate profile:** `triage-profile.json` (user-editable) supplies `target_roles, must_have_skills, seniority, locations, remote_ok`; used as Jev state. Avoids CV-LaTeX parsing (injection + fragility).

**REQ-8 Review surfacing:** REVIEW items flagged for manual decision; optional frontend Offers inbox deferred.

**REQ-9 Jev API key config (authenticated):** a Settings view lets the user set/retrieve their Jev API key.
- A: `POST /settings/jev-key` (JWT, body `{key}`) stores it encrypted (never plaintext); returns 204.
- B: `GET /settings/jev-key` (JWT) returns `{configured:boolean, masked:string}` (e.g. `****abcd`); never the plaintext.
- C: key is per-user (`user_id` scoped); only the owner can set/read their own.
- D: key is never logged; used only by `JevClient` at triage time (env `JEV_API_KEY` remains a fallback).

**REQ-10 Settings UI:** Angular Settings view (route `/settings`, `JwtAuthGuard`) with a password input + Save; shows configured status + masked key; nav link 'Settings'.

---

## DESIGN

### Modules / files (backend)
- `offer-triage/offer.entity.ts` — `Offer` (TypeORM).
- `offer-triage/offers.controller.ts` — `POST /offers/import`, `GET /offers`, `GET /offers/review` (all `JwtAuthGuard`).
- `offer-triage/offer-triage.service.ts` — ingest dedupe, call Jev, apply thresholds, create `Application` on SEND, set status.
- `offer-triage/jev.client.ts` — HTTP client to `https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer ${key}` where `key` is resolved per-user at triage time (from `SettingsService.getJevKeyPlain(userId)`, falling back to env `JEV_API_KEY`), body `{state, model:'jev-latest', questions}`, 5s timeout, throws `JevUnavailable` on error.
- `offer-triage/triage-profile.service.ts` — loads `triage-profile.json` from backend config (or user upload).
- `offer-triage/offer-triage.module.ts` — wires entities + services + controllers; registers a `@nestjs/schedule` cron to triage `NEW` offers in batch.
- `settings/settings.controller.ts` — `POST /settings/jev-key`, `GET /settings/jev-key` (`JwtAuthGuard`).
- `settings/settings.service.ts` — `setJevKey(userId, plain)` encrypt + store; `getJevKeyMasked(userId)`; `getJevKeyPlain(userId)` decrypt (for `JevClient`). Encryption: `crypto` aes-256-gcm keyed by `APP_SECRET` (same secret as JWT). Never log plaintext.

### Entities
- **Offer**: `id` (uuid pk), `externalId` (unique per user), `userId`, `title`, `company`, `companyUrl`, `location`, `url`, `description`, `deadline`, `applyUrl`, `status` (`NEW|SEND|REVIEW|SKIPPED`), `fit` (enum), `jevRaw` (jsonb), `jevConfidence` (float), `decisionAt`, `createdAt`.
- **UserSettings** (per user): `userId` (pk), `jevApiKeyEnc` (encrypted blob, aes-256-gcm with `APP_SECRET`), `updatedAt`.
- **Application**: schema **unchanged** (REQ-5 carries triage context in `notes`). Optional `offerId` FK deferred.

### Jev client
- `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer ${JEV_API_KEY}`.
- Body: `{ state: {offer, candidateProfile}, model: 'jev-latest', questions: { fit: {type:'score', instructions, criteria:['poor','fair','good','strong']}, hard_gate: {type:'noul', instructions} } }`.
- Returns `{ questions: { fit: {score, weighted, confidence}, hard_gate: {noul, confidence} } }`.
- Timeout 5s; any failure → `JevUnavailable` → `REVIEW` (no card, error logged).

### Thresholds (config)
- `triage.thresholds = { fitMin: 'good', hardGateMaxProb: 0.2 }` (env/config). Fixed → deterministic.

### Triage flow
1. Ingest → `Offer` status `NEW` (dedupe on `externalId`).
2. Cron (e.g. every 15 min) or on-import: triage all `NEW` offers (Jev batch, cheap).
3. Apply thresholds → `SEND`: `ApplicationsService.create(...)` (`stage=applied`, `follow_up_date +7d`, `notes` with url + verdict + fit + artifacts) + `Offer.status=SEND`. Else `REVIEW`: `Offer.status=REVIEW` (flagged, no card).
4. Low confidence / Jev error → `REVIEW` (safe; never auto-send below threshold).

### Profile
- `triage-profile.json`: `{ targetRoles:[], mustHaveSkills:[], seniority:'senior', locations:[], remoteOk:true }`. Loaded at triage time; user-editable.

### Isolation / audit
- All `Offer` queries scoped by `userId` (JWT). `Offer.jevRaw` stores full Jev response; `GET /offers/:id` returns decision + raw for audit.

---

## TASKS (implementation order)

1. Add `Offer` entity + TypeORM migration. *(TDD: entity unit test)*
2. `OfferTriageModule` wiring (module, controller guards).
3. `POST /offers/import` endpoint + validation + dedupe. *(TDD)*
4. `JevClient` service (HTTP, env key, 5s timeout, error→`REVIEW`). *(TDD with mocked Jev)*
5. `TriageProfileService` (load `triage-profile.json`). *(TDD)*
6. `OfferTriageService`: call Jev, apply thresholds, create `Application` on SEND, set status. *(TDD: deterministic-thresholds test)*
7. Cron triage `NEW` offers in batch. *(TDD)*
8. `GET /offers` + `GET /offers/review` (scoped lists). *(TDD)*
9. `Settings` module: `UserSettings` entity + migration, `setJevKey` (encrypt)/`getJevKeyMasked`/`getJevKeyPlain` service, `POST`/`GET /settings/jev-key` endpoints. *(TDD: encryption round-trip + masked GET)*
10. Frontend `SettingsComponent` (route `/settings`, guarded) — password input + Save + status/masked; nav link.
11. Wire `JevClient` to resolve per-user key (fallback env). *(TDD)*
12. Seed `triage-profile.json` + document format.
13. *(Optional)* Frontend Offers inbox view for REVIEW items.
14. *(Optional)* Ollama cover-letter draft on SEND (local, per user rule).

All in a single PR (≤400 changed lines; split if exceeded). No code written yet — planning only.
