```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:46681593eb3eb9c7da5ac3bf0b9993e40f23d970dfeef90551ad05e37f0b8c1e
verdict: pass
blockers: 0
critical_findings: 0
requirements: 26/26
scenarios: 33/33
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:d85cddfae964117855cb7be74af141ab8f07572138dae0832012f81f89f5dadd
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:582638e30b43c931b55a17a1dc52fa2345ddba43fc14202b760c267623a3dd37
```

# Verify Report — job-hunt-crm

**Verdict: PASS** — all 26 requirements and 33 scenarios are covered. The Domain 0
(auth) gap found in the prior verify (report obs 141) is now closed with real
credential-based authentication, and every build/test command is green.

## Spec coverage

| Domain | Requirements | Status |
|---|---|---|
| Domain 0: Auth & User Identity | User entity, Registration, Login verifies credentials, Tokens bind to real user, Daily reminder maps user→email | ✅ 5/5 |
| Domain 1: Applications CRUD | Application record shape, Per-user isolation (RLS), Update stage | ✅ 3/3 |
| Domain 2: Stage lifecycle | Canonical stage set, Promotion forward order, Follow-up scheduling, Stage display | ✅ 4/4 |
| Domain 3: Follow-up reminders | Due detection, Next follow-ups list, Daily reminder, Snooze/advance | ✅ 4/4 |
| Domain 4: Pipeline analytics | Per-stage distribution, Avg days-in-stage, Response shape, Isolation | ✅ 4/4 |
| Cross-cutting | Recruiter signal, backup, dashboard, CORS, healthchecks, clean first-run | ✅ 6/6 |

**Requirements: 26/26 complete. Scenarios: 33/33 complete.**

## Prior critical finding — RESOLVED

The previous verify reported Domain 0 as an archive blocker (JWT minted from
client-supplied `userId` with no credential check; no User entity). That is now
fully resolved:

- `User` entity + `users` table (uuid id, unique email, bcrypt `password_hash`).
- `POST /auth/register` hashes the password (bcryptjs) and rejects duplicates (409).
- `POST /auth/login` verifies email + hash; unknown email and wrong password return
  401 with no token.
- `JwtStrategy.validate` resolves the JWT `sub` to a persisted user and rejects 401
  if absent — tokens bind to a real user.
- `RemindersCron` maps `user_id -> User.email` (fallback to `SENDGRID_TO_EMAIL`
  only when no user record exists).

Auth is covered by 5 unit + 5 e2e HTTP tests, including wrong-password and
unknown-email 401 cases and a duplicate-registration 409.

## Task completion

`tasks.md` uses `### Task N:` headers (no `- [ ]` markers). All 15 tasks (backend,
frontend, seed/README/deploy) have implementation present and are summarized in
`apply-progress.md`. No unchecked implementation markers remain.

## Test / validation commands (exact, all green)

```
cd backend && npm test               → 7 suites, 35 tests PASS (exit 0)
cd backend && npm run test:e2e        → 2 suites, 8 tests PASS (exit 0)
cd backend && npm run build           → clean (exit 0)
cd frontend && npm run build          → clean (exit 0)
cd frontend && npx ng test --watch=false --browsers ChromeHeadless → 14 tests PASS (exit 0)
```

## Strict TDD

Not active (`openspec/config.yaml` absent). Skipped.

## Review workload / PR boundary

Forecast High (~2500–3500 lines), 3 chained PRs. Implemented slices PR1 (backend),
PR2 (frontend, migrated to Angular standalone), PR3 (seed/README/deploy) all landed
as separate commits on `main`. Domain 0 closure is an incremental backend slice
within PR1 scope — no additional scope creep.

## Blockers

None.

## Key Learnings

1. The initial backend shipped a JWT stub that signed any client-supplied userId without credential verification, which the spec explicitly labeled a security hole requiring a real user table and bcrypt hashing.
2. jest.resetAllMocks wipes the implementation of mocks defined outside beforeEach, so jest.clearAllMocks is the correct choice when preserving shared mock behavior across tests.
3. A Passport JwtStrategy validate hook must resolve the token subject to a persisted user and throw UnauthorizedException rather than NotFoundException, otherwise a deleted user produces a 404 instead of a clean 401.
4. The daily reminder cron should resolve each user identifier to their registered email through the users table and treat the SENDGRID_TO_EMAIL environment variable only as a single-owner fallback.
5. The end-to-end isolation suite exposed that ParseUUIDPipe returns 400 on non-UUID identifiers before service-layer ownership checks run, so test fixtures must use real UUIDs.