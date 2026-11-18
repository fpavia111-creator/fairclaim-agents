# Fairclaim Revenue KPIs fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `claims-2025-11-to-2026-01.csv`: 24 fictional claims from November 2025 to early February 2026 across four payers, with the date each was submitted.
- `remits-2025-11-to-2026-02.835`: the 835 payments for them. Planted: two prior authorization denials and a medical necessity denial; a claim denied for missing information and paid 30 days later; a slow payer (45 days); three claims with no remittance more than 30 days after they were sent; one remittance for a claim that is not in the claims file.
- `kpi-config.json`: an as-of date of 2026-02-15 and example targets for testing, not benchmarks. `kpi-config-typo.json` has a denial rate target above 100.
