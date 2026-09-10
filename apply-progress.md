# Job Hunt CRM — Apply Progress

## Status: PR 1 + PR 2 DONE — PR 3 (Seed/README/Deploy/Demo) DONE — pending verification against live DB

## PR 1 — Backend: DONE
- Tasks 1-5 complete. `npm test` 5 suites/27 pass, `npm run test:e2e` isolation pass, `tsc --noEmit` clean (verified this session).
- `main.ts` hardened: `enableCors` now honors `CORS_ORIGIN` env (was wide-open `true`). Permissive when unset.

## PR 2 — Frontend: DONE
- Tasks 6-11 complete. `ng build --configuration production` succeeds.
- **BUG FIXED this session:** `frontend/angular.json` project key was `job-hunt-crm-temp` (never renamed), so `--configuration production` was silently ignored and the prod build leaked `localhost:3000/api`. Renamed key → `job-hunt-crm` (also `package.json` name), added `baseHref: /job-hunt-crm/` + `fileReplacements` (environment.prod.ts → `/job-hunt-crm/api`). Verified: hashed bundle, correct base-href, no localhost leak.
- Deleted orphan root `angular.json` (ng only reads `frontend/angular.json`).

## PR 3 — Seed/README/Deploy/Demo: DONE
- Task 12 (seed): written, not yet run against a live DB (no Postgres installed; Docker available).
- Task 13 (README): complete; deploy section rewritten to NixOS+Caddy (was Vercel).
- Task 14 (deploy): **re-scoped from Vercel/Render → NixOS+Caddy per user decision (conflicted with standing rule "never Vercel/Render").** Artifacts:
  - `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`
  - `docker-compose.yml` (postgres + backend + frontend; backend/frontend have NO published ports, Caddy-proxied)
  - `Caddyfile.example`, `nixos-module.example.nix`
  - `frontend/src/environments/environment.prod.ts` (apiUrl `/job-hunt-crm/api`)
  - `.env.example` (compose root), `.gitignore` extended (.env, Caddyfile)
- Task 15 (demo checklist): `DEMO_CHECKLIST.md` written (10 gates).

## Verification evidence (builds)
```
backend:  npx tsc --noEmit            → clean
frontend: npx ng build --configuration production
          → base-href /job-hunt-crm/, bundle apiUrl /job-hunt-crm/api, hashed main.js, no localhost leak
```

## Remaining before merge
1. Run seed + migration against a real Postgres (Docker postgres:15) and confirm endpoints.
2. (Optional) `docker compose up -d --build` + Caddy route to prove the live path.
3. Commit all backend/ + frontend/ (currently UNCOMMITTED) + new deploy artifacts.

## Deviations from original tasks.md
- Task 14 deploy target changed Vercel/Render → Docker+NixOS Caddy (subpath `/job-hunt-crm/`).
- `CORS_ORIGIN` env added to backend (not in original spec).
