# Fairclaim Coding Audits fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `charges-2026-q1.csv`: 32 fictional charge lines in January and February 2026 for three providers (14, 12 and 6 lines), in a charge export layout.
- `audit-results-2026-q1.csv`: a filled-in worksheet of 25 audited lines. Planted: Reyes 10 of 11 agree, one level 5 supported at level 4, one diagnosis added (accuracy 81.82%); Brandt 4 of 10 agree (40%), three E/M levels higher than supported (one unpaid), modifier 25 removed, a joint injection with no procedure note, a new-patient code for an established patient; Moreau 4 lines (too few to judge), one level lower than supported.
- `audit-config.json`: 90% target, 5 random lines per provider plus every 99215. `audit-config-typo.json` has a target over 100.
- Every patient, claim and amount is invented.
