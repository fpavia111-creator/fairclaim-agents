# Fairclaim AR Aging fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `open-ar-2026-02-15.csv`: ten open claims in a claim-aging export layout (US dates). Planted, as of 2026-02-15: a recent claim within the payer's time (A1001); an unbilled claim 8 days from the 90-day limit (A1002); an unbilled claim past the limit (A1003); a claim submitted 105 days after service against a 90-day limit (A1004); a claim with no payment or activity for over 30 days (A1005); an old claim someone worked last week (A1006); a patient balance (A1007); a payer with no filing limit set (A1008); a paid claim with no balance (A1009); a draft well inside the limit (A1010).
- `ar-config.json`: filing limits for the four payers and the follow-up rules. `ar-config-typo.json` gives a limit as text.
- `exports/athena-claims.csv`: two claims in a claim-worklist export layout with no submitted date for the held claim.
