# Cumin of DME fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `dme-claims-2026-02.csv`: eleven fictional DME claim lines for February 2026 with order and delivery dates. Planted: a hospital bed in rental month 14 (past the 13-month cap); a nebulizer in month 2 billed with KH; an oxygen concentrator in month 38; a knee orthosis with no RT or LT; a power wheelchair with no prior authorization and an order dated after delivery; test strips over the unit limit and billed twice; a wheelchair restarting after a gap. The CPAP in month 12 (KJ) and the crutches are clean.
- `rental-history.csv`: 67 earlier rental months for those patients.
- `dme-config.json`: one extra item (a walker) and the 60-day gap. `dme-config-typo.json` has a misspelled category.
