# Fairclaim Credit Balances fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `credit-balances-2026-02-15.csv`: eight credits in a credit-balance report layout (negative amounts, US dates). Planted, as of 2026-02-15: a Medicare overpayment past 60 days from identification (T1001); a payer credit 10 days from a 30-day deadline (T1002); a payer credit with time left (T1003); a patient credit with an open balance on the account (T1004); a patient credit almost three years old (T1005); a credit under the small-credit level (T1006); a plain patient refund (T1007); a payer with no refund rule (T1008).
- `credit-config.json`: refund days per payer, small-credit level and a 3-year unclaimed-property age. `credit-config-typo.json` has 0 refund days.
