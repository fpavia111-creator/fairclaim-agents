# Fairclaim Patient Statements fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `patient-balances-2026-02-20.csv`: thirteen accounts (US dates; guarantor names are fictional). Planted, for a run on 2026-02-20: a first statement (P1), a second (P2), a final notice (P3), collections review after a final notice 49 days ago (P4); holds for insurance still pending (P5), a payment plan (P6), returned mail (P7), a 3-dollar balance (P8), an estate (A-2001), a dispute (A-2002), a payment 8 days ago (A-2003), a statement 10 days ago (A-2004); and an auto accident (PIP) flag that only a learned hold word catches (A-2005). Workers compensation is a built-in hold.
- `statement-config.json`: run rules, how to pay and the assistance sentence. `statement-config-typo.json` sets a 2-day cycle (refused).
