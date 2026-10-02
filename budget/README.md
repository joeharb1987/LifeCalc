# LifeCalc Budget (Joe & Zhila)

LifeCalc's Budget tab: **money in → money out → left over**.
The calculator (`/`) is the home screen; this lives at `/budget/` and shares its bottom bar:
Calc · Budget · Transactions · Debts · More (Net Worth, Reports, settings). The calculator's bar links to `budget/#<tab>`.
Plain HTML/CSS/JS, no build step. One manifest and service worker for the whole app, at the repo root.

- **Open:** `https://<your-github-pages-domain>/LifeCalc/` — then Share → Add to Home Screen (one app: calculator + budget).
- **Run locally:** `python3 -m http.server` from the repo root, open `http://localhost:8000/`.
- **Tests:** `node budget/tests/core.test.js`

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

**BudgetItem** – `name, categoryId, amount, frequency, customWeeks, source, kind (fixed|variable|oneoff), scope (personal|business), active, startDate, endDate, order, notes`. `order` is the drag-and-drop position within its category.
Items outside their start/end dates aren't counted. Everything counts as household; `scope` is kept on old data but no longer filters anything.

**Debt** – `name, balance, limit, rate, payment, frequency, endDate, scope, active, notes`.

**Net worth** = every asset − every active debt (one combined household). Debts without a balance are listed as not yet subtracted. `nwHistory` keeps one snapshot per day the value changes, for the chart.
