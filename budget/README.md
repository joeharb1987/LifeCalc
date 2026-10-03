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
- `js/files.js` – Files vault page (needs Live sharing)

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

**Asset categories** (`assetCats`) – `id, name, icon, order`. An asset's `type` is one of these ids; defaults are bank/cash, kids savings, super, shares, crypto, property, vehicles, business, valuables, other, and users can add their own. Assets, debts, categories and items all carry an `order` set by drag and drop.

**Budget screen** – six tiles (Income, Expenses, Left over; Assets, Debts, Net worth), a runway line (cash in Bank accounts & cash ÷ average weekly spending over the last 13 weeks of bank data, or the budget if there's none), then Earnings, Expenses (category cards) and One-offs. Rows: tap to edit, swipe left to delete; Edit in a section header shows drag grips. Manual lines with matching bank transactions show `Budget $x · Bank avg $y`.

**Net worth** = every asset − every active debt (one combined household). Debts without a balance are listed as not yet subtracted. `nwHistory` keeps one snapshot per day the value changes, for the chart.

## Live sharing (Supabase)

Project `lifecalc` (ref `qfcislqcszymihvyjrud`, Sydney). `budget/js/sync.js` keeps the whole budget as one JSON document per household:

- `households(id, name, data jsonb, version, invite_code, updated_at, updated_by)` and `household_members(household_id, user_id, email, role)`, both with row-level security (members only).
- RPCs: `create_household(name, data)`, `join_household(code)`, `save_household(id, data, version)` (returns the new version, or -1 if someone saved first).
- Each phone works offline and saves ~1s after a change. On a version clash it re-reads the server copy and merges record by record (three-way, against the last synced copy), so edits to different items on both phones are kept.
- Realtime pushes updates to the other phone. Per-phone settings (name, view, theme, tab) aren't shared.
- The browser only holds the publishable key; access is enforced by RLS.

## Connect AI (Claude / ChatGPT connector)

`supabase/functions/lifecalc-mcp` is a read-only MCP server (streamable HTTP, deployed with JWT verification off; the 64-hex `ai_token` in the URL is the credential). Settings → Connect AI calls `ai_token_create` / `ai_token_revoke` (members only) and shows `https://<project>.supabase.co/functions/v1/lifecalc-mcp/<token>` to paste into Claude → Settings → Connectors → Add custom connector. Tools: `get_budget_summary`, `get_items`, `get_debts`, `get_assets`, `get_transactions`, `get_monthly_spending`, `list_files`, `get_file` (signed link valid 10 min); totals use the same rules as the app. Unknown tokens get 401 for everything.

## Files vault

Budget → Files. Private household finance files (statements, payslips, bills, screenshots, CSVs), max 20 MB each. Needs Live sharing (signed in to a household).

- Table `public.files` (migration `supabase/migrations/20261003_files_vault.sql`), RLS: household members only. Duplicates blocked by `unique (household_id, sha256)`.
- Storage: private bucket `household-files`, objects at `<household_id>/<uuid>-<name>`; storage policies check the folder is a household you belong to. Only short-lived signed URLs, never public ones.
- `supabase/functions/process-file` (JWT on) reads each upload once with Claude: type, as-at date, summary, extracted text (≤ 50k chars), suggested link to a budget line or asset, and a note if that line/asset differs from the file. Account/card numbers are masked to the last 4 digits. It never edits the budget. PDF, images (PNG/JPEG/GIF/WebP) and text files (CSV, TXT, OFX, QIF, JSON…) are read; other types are stored without a summary.
- Secret: `ANTHROPIC_API_KEY` in Supabase → Edge Functions → Secrets (server only). Without it, uploads show "Failed" with Retry.
