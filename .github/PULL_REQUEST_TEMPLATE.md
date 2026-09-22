## What this changes

<!-- One paragraph. What was wrong or missing, and what the change does about it. -->

## How it was verified

<!-- The commands you ran and what they printed. "Tests pass" is weaker than
     the command and its output. -->

- [ ] `cd backend && npm run build && npx eslint "{src,test}/**/*.ts" && npm test`
- [ ] `cd frontend && npm test`
- [ ] `cd tools && python3 -m unittest discover -p "test_*.py"`

## Scoring changes

<!-- Only if this touches the vacancy scoring. Delete the section otherwise. -->

- [ ] I changed the rule in Python, not in the generated TypeScript
- [ ] I regenerated `vacancy-rules.generated.ts` and `scoring-golden.json`
- [ ] I did not touch `profile.default.ts` without touching
      `tools/fixtures/triage-profile.example.json`, or the other way around

## Notes for the reviewer

<!-- Trade-offs, what you deliberately left out, what you are unsure about. -->
