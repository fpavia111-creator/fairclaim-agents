# Savory of Plans fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `payment-plans.csv` and `plan-payments.csv`: six plans and their payments (US dates). Planted, as of 2026-02-20 with a 10-day grace period: current (PL1); one missed (PL2); four missed, for default review (PL3); paid off (PL4); 20 a month on 2400, below the minimum and over the 24-month limit (PL5); ahead by one payment (PL6).
- `plan-config.json`: grace days, default rule, minimum payment and term tiers. `plan-config-typo.json` has a tier with no term.
