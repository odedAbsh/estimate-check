# Estimate Check

Compare home-service quotes on more than price, and hire the right contractor. Built for US homeowners, businesses and property managers.

You add the quotes you already have (PDF, photo, pasted text or a short form). Estimate Check lines them up, prices in what each one leaves out, checks the license and lawsuit record, and recommends who to hire and why, weighted by what you said matters.

## Plans (one-time, per project)

| Plan | Price | Quotes | Includes |
|---|---|---|---|
| Essential | $29 | 3 | Business background check, line-by-line analysis |
| Verified | $39 | 5 | + license verification, lawsuit/lien records and what they were, best-value pick |
| Advisor | $49 | 9 | + advisor chat for the final decision |

The side-by-side comparison, true-cost chart and document-level warnings are free. The verdict, background checks and advisor are paid.

## Run it

```bash
npm install
npm run dev          # web on :5173, API on :8787
npm test             # unit + component tests
npm run test:e2e     # browser tests (desktop + phone), needs Chromium
npm run build && npm start   # production server on :8787
```

Set `ANTHROPIC_API_KEY` to turn on AI quote reading (photos and scanned PDFs) and the AI advisor. Without it the app still works: PDFs and pasted text are read by a built-in parser and the advisor answers from the analysis.

## What is real and what is a prototype

- **Real:** scoring and ranking, scope-gap pricing, red-flag rules, quote parsing, AI extraction and advisor (with a key), the full UI.
- **Sample data:** background checks. `DemoVerificationProvider` returns deterministic fake records. Do not ship it as is. Replace it by implementing `VerificationProvider` in `src/domain/verification.ts` with real sources: state licensing boards (there is no national database), Secretary of State business search, and a court-records vendor.
- **Simulated:** payments (no card is charged), and accounts (projects live in the browser's local storage).

## Before launch

1. Real license and court-record data, and a legal review of how lawsuit findings are shown (defamation risk if a match is wrong). Show source, date, and how to dispute.
2. Real payments, accounts, and server-side storage. Move verification and the paywall to the server; today they run in the browser.
3. Validate the scope checklists in `src/domain/trades.ts` with contractors in each trade.

## Layout

- `src/domain/` scoring, flags, plans, trades, parser, verification interface (all unit tested)
- `src/pages`, `src/components` the UI
- `server/` Express API for AI extraction and advisor
- `tests/e2e/` Playwright flows
