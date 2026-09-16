# Job Hunt CRM — Apply Progress

## Status: SELF-HOSTABLE — portable Docker Compose stack verified end-to-end on Docker

## PR 1 — Backend: DONE
- Tasks 1-5 complete. `npm test` 5 suites/27 pass, `npm run test:e2e` isolation pass, `tsc --noEmit` clean.
- `main.ts`: `enableCors` honors `CORS_ORIGIN` env (permissive when unset).

## PR 2 — Frontend: DONE (re-scaffolded Angular 15 → 22)
- Tasks 6-11 complete. Re-scaffolded to Angular **22** (latest stable) standalone + routing + karma/Jasmine.
- `JobHuntService` token-free (reads `localStorage('jobhunt_token')`), named observables `applications$`/`pipelineStats$`; native HTML5 drag/drop (no CDK); lazy routes per view.
- 14/14 Jasmine tests PASS (ChromeHeadless), `ng build` clean.
- Restored PR 3 deploy config for v22: `frontend/Dockerfile` (output `dist/frontend/browser`), `frontend/nginx.conf`, `angular.json` prod `baseHref`/`fileReplacements`. Verified `<base href="/job-hunt-crm/">` + prod `apiUrl` `/job-hunt-crm/api` baked, no `localhost` leak.

## PR 3 + Pivot — Seed/README/Deploy: DONE (portable)
- Deploy re-scoped Vercel/Render → Docker Compose + NixOS Caddy (subpath `/job-hunt-crm/`).
- **PIVOT (2026-09-10):** goal is self-hosted on ANY Docker host (portable, like Joe's other nix99 apps). Auth: app keeps its own JWT login; Authelia SSO is an OPTIONAL Caddy-layer gate (documented Variant B in Caddyfile.example). No app-code change for SSO.
- Portable fixes verified on a fresh `docker compose up -d`:
  - `backend/docker-entrypoint.sh`: self-runs `migration:run` on boot (idempotent) → no manual migration step on fresh clone.
  - Entrypoint honors override args (`docker compose run --rm backend npm run seed` actually seeds, doesn't boot API).
  - `docker-compose.yml`: single root `.env` (backend reads it directly), postgres healthcheck + `depends_on: service_healthy`, seed as one-shot.
  - `Caddyfile.example`: fixed routing bug — `handle /job-hunt-crm/*` (no strip, nginx expects prefix) + `uri strip_prefix /job-hunt-crm` on API (NestJS keeps `api` prefix). Variant A (JWT) / Variant B (Authelia).
  - `.env.example`: removed fake `***` password placeholder.

## Verification evidence (fresh Docker host, 2026-09-10)
```
docker compose up -d --build
  → postgres healthy, backend "Nest application successfully started", frontend up
  → backend self-migrated (applications table + RLS created on boot)
docker compose exec frontend wget backend:3000/api/health → {"status":"ok"}
docker compose run --rm backend npm run seed → "Seeded 3 applications"
  → SELECT count(*) FROM applications = 3 (applied/screened/interview)
```

## Deviations from original tasks.md
- Task 14: Vercel/Render → Docker Compose + Caddy subpath.
- `CORS_ORIGIN` env added; self-migrating entrypoint added; seed is one-shot.
- Angular 15 → **Angular 22** (latest stable) per review feedback; frontend fully re-scaffolded to standalone components.

## Domain 0 — Authentication & User Identity: DONE (post-verify closure)

The verify phase flagged Domain 0 as an archive-blocking gap: `POST /auth/login`
minted a JWT from client-supplied `userId` with no credential check. This is now
closed with real credential-based auth:

- `User` entity (`users` table: uuid id, unique email, bcrypt `password_hash`).
- `POST /auth/register` (201): validates email/password, hashes password (bcryptjs),
  rejects duplicate email (409), returns JWT with `sub = user.id`.
- `POST /auth/login` (200/401): verifies email + bcrypt hash; unknown email and
  wrong password both return 401 with no token.
- `JwtStrategy.validate` resolves the token subject to a persisted user via
  `UsersService.findById` and rejects (401) if the user no longer exists — tokens
  bind to a real user.
- `RemindersCron` resolves `user_id -> User.email` via `UsersService`, falling back
  to `SENDGRID_TO_EMAIL` only when no user record maps (never required once users
  exist).
- Migration `AddUsers1700000000000` (users table + unique email index); `User`
  wired into the TypeORM `data-source.ts` entities.

Verification: 35 unit tests + 8 e2e tests PASS; `nest build` clean.
