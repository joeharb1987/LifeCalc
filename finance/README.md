# LifeTrack (Joe & Zhila)

Mobile-first household finance app: **money in → money out → left over**.
Screens: Home, Transactions, Budget (+ category detail, expense overview), Debts, More (Net Worth, Reports, settings).
Plain HTML/CSS/JS, no build step. Lives alongside the LifeCalc calculator at `/finance/`.

- **Open:** `https://<your-github-pages-domain>/LifeCalc/finance/` — then Share → Add to Home Screen.
- **Run locally:** `python3 -m http.server` from the repo root, open `http://localhost:8000/finance/`.
- **Tests:** `node finance/tests/core.test.js`

## Files
- `js/core.js` – frequency conversion, Monday–Sunday periods, budget/actual/net-worth maths, storage, migration
- `js/seed.js` – starting figures from the Jan–Sep 2026 statement review
- `js/importer.js` – CSV / pasted-text parsing, merchant rules, transfer detection, de-dupe (no PDF)
- `js/icons.js` – line icon set (categories store an icon key)
- `js/app.js` – UI

Data is saved in this browser's local storage (`hf_state_v1`, schema version 3). Use More → Export backup.

## Ledger tables

**Account** – `id, name, type, owned, active` (+ `transferAs`: `internal` | `savings`, `match`: keywords for transfer detection)

**Transaction** – one row per bank or cash movement:

| field | meaning |
|---|---|
| `id` | unique id |
| `date` | ISO date (`YYYY-MM-DD`) |
| `date_raw` | date exactly as the statement printed it |
| `budget_week` | Monday (ISO) of the week it counts toward. Defaults to the week of `date`; move it to group split payments |
| `description_raw` | statement text, untouched |
| `merchant` | cleaned / rule-mapped name |
| `amount` | signed: + in, − out |
| `direction` | `in` \| `out` |
| `account_id` | → Account |
| `category_id`, `subcategory` | classification |
| `source` | `imported` \| `cash` \| `manual` |
| `internal_transfer` | between owned accounts — excluded from income/expenses |
| `cash_deposit` | cash already counted manually — excluded to avoid double counting |
| `one_off`, `recurring`, `recurring_group` | behaviour flags; `recurring_group` names the series (e.g. "Ariana Dance") |
| `notes` | free text |
| `hash`, `sign_guessed`, `user_edited` | import bookkeeping |

Weekly Actual figures and history group by `budget_week`; monthly/yearly by `date`.

**BudgetItem** – `name, categoryId, amount, frequency, customWeeks, source, kind (fixed|variable|oneoff), scope (personal|business), active, startDate, endDate, notes`.
Items outside their start/end dates aren't counted. `scope: business` items are excluded unless "+ Business" is on.

**Debt** – `name, balance, limit, rate, payment, frequency, endDate, scope, active, notes`.

**Net worth** = assets − every active debt in scope (household, or household + business). Debts without a balance are listed as not yet subtracted. `nwHistory` keeps one snapshot per day the value changes, for the chart.
