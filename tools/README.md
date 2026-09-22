# tools/ — the Python source of truth for vacancy scoring

The app is TypeScript. This directory is Python. That is deliberate.

The ranker here came first: it is where the scoring rules are tuned against real
postings. The TypeScript side (`backend/src/vacancies/vacancy-scoring.ts`) is a
port that exists so the app and the ranker cannot disagree about what a posting is
worth. Two implementations of one rule set is a liability, so the port is
generated or verified against this code instead of being written by hand and
trusted.

## What is generated from here

| Artifact | Command | Committed |
|----------|---------|-----------|
| `backend/src/vacancies/vacancy-rules.generated.ts` | `python3 generate_ts_scoring_rules.py --out ../backend/src/vacancies/vacancy-rules.generated.ts` | yes, and it says so at the top |
| `backend/test/fixtures/scoring-golden.json` | `python3 generate_scoring_golden.py --profile <profile.json> --corpus <corpus.json> --out ../backend/test/fixtures/scoring-golden.json` | yes, it is the parity fixture |

Both were regenerated with these exact commands when this directory was added, and
both came out byte-identical to the files already committed. That is the check to
repeat after any change:

```bash
python3 generate_ts_scoring_rules.py --out /tmp/rules.ts
diff /tmp/rules.ts ../backend/src/vacancies/vacancy-rules.generated.ts
```

## Changing a scoring rule

1. Change it here, in the Python.
2. Regenerate both artifacts with the commands above.
3. Run the Python tests, then the backend tests. The golden fixture is what tells
   you how far the change reached: it holds scored cases, so a rule that moves
   scores shows up as failures with the exact cases named.

Do not edit `vacancy-rules.generated.ts` by hand. It is overwritten on the next
regeneration, and a hand edit silently creates the second source of truth this
setup exists to prevent.

## Running the tests

```bash
python3 -m unittest discover -p "test_*.py"
```

119 tests, under a second, standard library only. No pytest, no dependencies to
install.

## Files that are not in the repo

Two inputs belong to the person running this, so they are gitignored:

- **`triage-profile.json`** — your skills, roles and depth. Export it from the app
  (`GET /settings/profile`, or the export script) so the ranker and the scoreboard
  score against the same profile. Tests use
  `fixtures/triage-profile.example.json` instead, so they never depend on yours.
- **`companies/`** — the remote-companies corpus used by
  `shortlist_remote_companies.py`. Its test skips itself when the corpus is
  absent, so a clone without it still runs green.

`out/` is where the CLIs write by default. It is gitignored too.

## About the feed client

`fetch_pegas_devschile.py` reads a public Chilean job board. It uses a browser
User-Agent, a one-second pause between pages, and retries, because it is talking
to somebody else's server. The TypeScript ingest in the backend keeps the same
behaviour. If you point either at a different source, keep it.
