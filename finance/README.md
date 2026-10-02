# Household Finance (Joe & Zhila)

Mobile-first household finance app: **money in → money out → money left**.
Plain HTML/CSS/JS, no build step. Lives alongside the LifeCalc calculator at `/finance/`.

- **Open:** `https://<your-github-pages-domain>/LifeCalc/finance/` — then Share → Add to Home Screen.
- **Run locally:** `python3 -m http.server` from the repo root, open `http://localhost:8000/finance/`.
- **Tests:** `node finance/tests/core.test.js`

## Files
- `js/core.js` – frequency conversion, Monday–Sunday periods, budget/actual/net-worth maths, storage
- `js/seed.js` – starting figures from the Jan–Sep 2026 statement review
- `js/importer.js` – CSV / pasted text / PDF parsing, merchant rules, transfer detection, de-dupe
- `js/app.js` – UI

Data is saved in this browser's local storage (`hf_state_v1`). Use More → Export backup.
