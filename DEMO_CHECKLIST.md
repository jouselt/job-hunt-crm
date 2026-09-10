# Job Hunt CRM — End-to-End Demo Checklist

Goal: verify the full loop works locally (backend + frontend + DB) so the
recruiter-signal demo is reproducible. Run in order; each step is a gate.

## Prerequisites
- [ ] Docker running (`docker info` succeeds)
- [ ] PostgreSQL available (local or `docker run postgres:15`)
- [ ] Root `.env` filled from `.env.example` (single file — `DATABASE_URL`, `JWT_SECRET`); backend reads it directly
- [ ] Node 20+ installed

## 1. Backend boots + DB connects
```bash
cd backend
npm install
npm run migration:run      # creates table + indexes + RLS
npm run start:dev          # → http://localhost:3000
```
- [ ] `curl localhost:3000/api/health` → `200`

## 1b. Auth (login to get a token)
```bash
curl -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"00000000-0000-0000-0000-000000000001","email":"dev@example.com"}'
```
- [ ] Returns `{ "access_token": "..." }` (223-char JWT)
- [ ] **KNOWN GAP:** login is credential-less today (any `userId`/`email` mints a
      token — see `design.md` §4 / `spec.md` Domain 0). After Domain 0 lands this
      step becomes real register + password login; replace the body above with
      registered credentials.

## 2. Seed test data
```bash
npm run seed
```
- [ ] Logs "Seeded 3 applications for test user"
- [ ] `curl localhost:3000/api/applications` (with Bearer) → 3 rows at applied/screened/interview

## 3. Analytics endpoint
- [ ] `curl localhost:3000/api/analytics/pipeline` →
      `{ applied, screened, interview, offer, rejected, avgDaysInStage }`,
      active % sums to 100, rejected excluded.

## 4. Frontend serves
```bash
cd ../frontend
npm install
npm run start              # → http://localhost:4200
```
- [ ] App loads, no console errors
- [ ] List shows the 3 seeded applications

## 5. Add a 4th application
- [ ] Fill Add Application form (company + role required)
- [ ] Submit → appears in list + Kanban

## 6. Promote stage via Kanban
- [ ] Drag an `applied` card to `screened` → DB updates
- [ ] Backward/skip drag rejected (no API call)

## 7. Pipeline overview + follow-ups
- [ ] Overview shows canonical bars + avgDaysInStage
- [ ] Due follow-ups list renders

## 8. Recruiter scenario (the signal)
1. Recruiter: "¿Dónde estás parado en tu búsqueda?"
2. Open CRM → organized pipeline + next follow-up visible
3. Shows ownership of the process, no one managing the search for you

## 9. Production build sanity (pre-deploy)
```bash
npm run build --configuration production
```
- [ ] `dist/job-hunt-crm/index.html` has `<base href="/job-hunt-crm/">`
- [ ] bundle contains `/job-hunt-crm/api` (NOT localhost)

## 10. Deploy via Docker + Caddy (NixOS)
- [ ] `docker compose up -d` (postgres + backend + frontend)
- [ ] Caddy routes `/job-hunt-crm/` → frontend, `/job-hunt-crm/api/` → backend
- [ ] Visit `https://<domain>/job-hunt-crm/` → app works end-to-end
