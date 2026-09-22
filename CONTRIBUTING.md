# Contributing

Thanks for looking. This is a small self-hosted project, so the useful
contributions are usually a bug report with a reproduction, or a fix for a
behaviour that surprised you.

## Running it

```bash
cp .env.example .env
docker compose up -d --build
```

The stack runs migrations on boot. Open `http://127.0.0.1:8092/job-hunt-crm/` and
register the first account.

## Running the tests

There are three suites, and all three run in CI. Run them before opening a pull
request; a pull request that fails one of them will not be reviewed further.

```bash
# Backend: 232 tests
cd backend && npm ci && npm run build && npx eslint "{src,test}/**/*.ts" && npm test

# Frontend: 51 tests
cd frontend && npm ci && npm test

# Python tools: 119 tests
cd tools && python3 -m unittest discover -p "test_*.py"
```

The Python suite is standard library only. There is nothing to install.

## The one rule that is easy to get wrong

**The vacancy scoring rules live in Python, in `tools/`.** The TypeScript side is a
port, and `backend/src/vacancies/vacancy-rules.generated.ts` is generated from the
Python. Do not edit that file by hand: it is overwritten on the next regeneration,
and a hand edit creates the second source of truth the generated file exists to
prevent.

If you change a rule:

```bash
cd tools
python3 generate_ts_scoring_rules.py --out ../backend/src/vacancies/vacancy-rules.generated.ts
python3 generate_scoring_golden.py \
  --profile fixtures/triage-profile.example.json \
  --corpus fixtures/corpus.json \
  --out ../backend/test/fixtures/scoring-golden.json
```

Then run both suites. The golden fixture holds scored cases, so a rule that moves
scores shows up as failures naming the exact cases it moved. CI regenerates both
artifacts and diffs them, so a one-sided change fails there too.

`backend/src/offer-triage/profile.default.ts` and
`tools/fixtures/triage-profile.example.json` must stay identical. A test enforces
it, because when they drift the two scorers describe different candidates and the
symptom is dozens of unrelated fixture failures.

## Commits

Conventional commits, one logical change per commit:

```
feat(scoreboard): let a posting be marked as gone
fix(scoring): measure freshness in days, not calendar months
docs: document the vacancy scoreboard
```

No AI attribution or co-author trailers, please.

## Pull requests

- Keep it reviewable. A pull request over 400 changed lines is hard to review
  properly; if the change is genuinely that big, say so and explain the split you
  considered.
- Say what you verified and how. "Tests pass" is weaker than the command you ran
  and what it printed.
- If you fixed a bug, the fix should come with a test that fails without it. That
  is the only proof the bug was the bug.
- Documentation changes are welcome on their own. The README is the front door and
  a wrong sentence there costs more than a missing feature.

## Reporting a bug

Include the version or commit, what you ran, what you expected, and what happened.
Logs from `docker compose logs backend` are usually enough. If it involves the
scoreboard, the posting that scored wrong is worth more than a description of the
pattern.
