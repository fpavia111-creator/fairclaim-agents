# Basil of Eligibility fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `eligibility-2026-02-01.271`: four 271 responses (one per payer) for the visits on 3 February 2026, each tied to its appointment by the trace number. Planted: active with copay, coinsurance and deductible left (A1001); coverage ended 2025-12-31 (A1002); subscriber not found, AAA 75 (A1003); another payer primary (A1004); plan ends 31 January, before the visit (A1005); an HMO naming a primary care provider (A1007); Medicaid with no copay (A1008).
- `appointments-2026-02-03.csv`: nine visits; A1006 has no response and A1009 is cancelled.
