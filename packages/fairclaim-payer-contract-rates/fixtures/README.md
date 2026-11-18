# Fairclaim Payer Contract Rates fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `payer-fees-2026.csv`: three payers' rates for six codes (made up). `medicare-2026-illustrative.csv`: made-up Medicare amounts. `volumes-2025.csv`: yearly units. Planted: one payer at 120% of Medicare, one at 105-110% with one code under 100% (20610), one at 70%, a code with no Medicare amount (T1015).
- `contracts.csv`: four contracts as of 2026-02-15: an auto-renewal whose notice deadline passed, one with 45 days left to give notice, an expired one, and one with no end date.
- `contract-config.json`: floor 100% of Medicare, 120-day warning. `contract-config-typo.json` gives the floor as text.
- No patient data is used here; `phi-canaries.json` lists fictional patients anyway so the shared leak test runs.
