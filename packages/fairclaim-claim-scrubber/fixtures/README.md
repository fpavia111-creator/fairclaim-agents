# Fairclaim Claim Scrubber fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `batch-2026-01-20.837`: one 837P with ten claims. C4001 is clean. Planted: missing member id and a bad rendering NPI check digit (C4002), an ICD-9 code and a pointer to a diagnosis that is not there (C4003), a corrected claim with no original reference and a future date (C4004), E/M plus injection without 25 and a code the config says needs prior auth (C4005), a wrong total, 26+TC together and zero units (C4006), a duplicate line and an unknown place of service (C4007), a member id that does not fit the payer pattern, birth date after service, bad code and modifier (C4008), a duplicate of C4001 (C4009), a service past the payer filing limit (C4010).
- `scrub-config.json`: member id patterns, prior-auth codes, filing limits and a unit limit. `scrub-config-typo.json` names a field Fairclaim Claim Scrubber cannot require.
- `exports/tebra-charges.csv`: three charge lines in a practice-management export layout; one line has no diagnosis pointer.
