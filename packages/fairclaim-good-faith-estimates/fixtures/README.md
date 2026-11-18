# Fairclaim Good Faith Estimates fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `self-pay-schedule.csv`: seven self-pay visits and requests (US dates). Planted, as of 2026-02-17 with 2026-02-16 as an office holiday: on time (G1); missing past its 3-business-day due date (G2); due with one business day of notice (G3); booked too close to need one (G4); insured (G5); issued late (G6); a price request with no visit (G7).
- `estimates-vs-bills.csv`: one estimate billed 450 over for one provider (dispute threshold reached), 350 over for another, and one within the estimate. `self-pay-prices.csv`: five self-pay prices.
- `estimate-config.json`: one office holiday and the 400-dollar threshold. `estimate-config-typo.json` gives a holiday as a name.
