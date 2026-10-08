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

## Configuration

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Turns on real Stripe Checkout |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhooks. Point Stripe at `POST /api/stripe/webhook`, event `checkout.session.completed` |
| `PUBLIC_URL` | Public origin, used for Stripe return URLs |
| `DATABASE_PATH` | SQLite file (default `data/app.db`, `:memory:` for tests). Uses Node's built-in `node:sqlite`, which is still experimental |
| `ALLOW_DEMO_CHECKOUT` | `1` allows demo checkout in production |
| `INSECURE_COOKIES` | `1` drops the Secure cookie flag (local HTTP production-mode runs only) |

## What is real and what is a prototype

- **Real:** scoring and ranking, scope-gap pricing, red-flag rules, quote parsing, AI extraction and advisor (with a key), the full UI.
- **Sample data:** background checks. `DemoVerificationProvider` returns deterministic fake records. Do not ship it as is. Replace it by implementing `VerificationProvider` in `src/domain/verification.ts` with real sources: state licensing boards (there is no national database), Secretary of State business search, and a court-records vendor.
- **Real:** accounts (email + password, scrypt, httpOnly session cookie), server-side projects in SQLite, and Stripe Checkout with signature-verified webhooks. A plan exists only if a row in `purchases` says so. License lookup and the advisor are gated on that plan server-side.
- **Live license data:** Oregon CCB (see `docs/license-data-sources.md`). Other states say "not yet connected" and link to the board.
- **Demo checkout:** with no `STRIPE_SECRET_KEY`, outside production, a demo button unlocks plans without charging. In production it is off unless `ALLOW_DEMO_CHECKOUT=1`.
- **Known gap:** the verdict is still computed in the browser, so the paywall on the verdict itself is soft. Only license lookup and the advisor are hard-gated.
- **No password reset yet** (needs an email provider).

## Before launch

1. Real license and court-record data, and a legal review of how lawsuit findings are shown (defamation risk if a match is wrong). Show source, date, and how to dispute.
2. Move the analysis and verdict server-side so the paywall is hard, and add password reset.
3. Validate the scope checklists in `src/domain/trades.ts` with contractors in each trade.

## Layout

- `src/domain/` scoring, flags, plans, trades, parser, verification interface (all unit tested)
- `src/pages`, `src/components` the UI
- `server/` Express API for AI extraction and advisor
- `tests/e2e/` Playwright flows
