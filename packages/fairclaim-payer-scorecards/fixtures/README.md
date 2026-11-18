# Fairclaim Payer Scorecards fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `era-2026-01.835` and `era-2026-02.835`: two months of payments from three payers (26 claims). `claims-submitted.csv`: the submission date of each claim. Planted: one payer pays in about two weeks with 10% denials; one in about five weeks with 25% denials and a reversal; one in about two months with 38% denials (enrollment, timely filing, medical necessity).
- `payer-config.json`: targets of 30 days, 15% denials and 55% of billed paid, with a looser 45-day target for the Medicaid plan. `payer-config-typo.json` gives days as a word.
