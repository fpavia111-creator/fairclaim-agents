# Rosemary of Appeals fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `era-2026-02-12.835`: an authorization denial (R1001), a bundled injection with remark M15 (R1002), a medical-necessity denial (R1003) and a paid claim with nothing to appeal (R1004).
- `policies/`: two fictional payer policies. One line in the injection policy is written like an instruction to an AI: it must be flagged and never quoted.
- `appeal-log.csv`: six appeals (as of 2026-02-15: one overdue, one waiting, one upheld at level 1, one exhausted, one won, one not filed). `appeal-config.json`: deadlines and response times.
