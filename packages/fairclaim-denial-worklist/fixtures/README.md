# Fairclaim Denial Worklist fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `era-2026-01.835`: one interchange with four 835 payments (four payers, eight claims). Planted: authorization (CO-197), bundling (CO-97 + M15), CO-16 + N290 that the config maps to provider enrolment for one payer, medical necessity (CO-50), timely filing (CO-29), an unknown code (CO-989), duplicate (CO-18), coordination of benefits (CO-22 + MA04); plus clean lines with CO-45 and PR-2, and provider-level interest and a recovery.
- `denial-config.json`: appeal days (90, one payer 60) and one payer-specific code meaning. `denial-config-typo.json` has a bad category, to show the schema error.
- `exports/office-ally-era.csv`: three remittance lines in an ERA-export layout with US dates.
