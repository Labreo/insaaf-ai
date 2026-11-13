# Contributing

## Branches

| Prefix | Use | Example |
|---|---|---|
| `fe/` | frontend work | `fe/pipeline-screen` |
| `be/` | backend work | `be/kanoon-time-boxed-search` |
| `ml/` | model / data work | `ml/b-score-baseline` |
| `rules/` | legal rule packs | `rules/proof-ledger-property` |
| `docs/` | plan, contract, PPT notes | `docs/api-contract-v2` |

1. `git pull origin main`, then branch from the latest `main`.
2. Keep PRs small: one feature or screen per PR.
3. Put the feature ID in the PR title, e.g. `F7: citation health badges`.
4. Squash-merge into `main`.

## Stay in your lane

- Frontend PRs touch `frontend/` only.
- Backend PRs touch `backend/` and `ml/` only.
- [`.github/CODEOWNERS`](.github/CODEOWNERS) requests the right reviewers automatically.
- **Exception: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) and `frontend/mocks/`.** These are shared. Any change needs one approval from each side, so nobody breaks the other team.

## Commits

Short, imperative, prefixed with the area:

```text
fe: add statute clock ring to matter screen
be: cache kanoon docfragment responses
ml: calibrate b-score with isotonic regression
rules: add stamp duty requirement to property pack
```

## Before you open a PR

- [ ] It runs locally.
- [ ] No API keys, tokens or `.env` files in the diff.
- [ ] No real client data. Demo data is fictional.
- [ ] If you changed a response shape, you also updated `docs/API_CONTRACT.md` and the matching mock.
