# Lavender of Credentialing fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `provider-roster.csv`: four fictional providers. Planted, as of 2026-02-15: a DEA registration 74 days from expiry (Reyes); a license expiring in 13 days and a CAQH attestation overdue (Brandt); no malpractice date (Moreau); an NPI with a wrong check digit (Vance).
- `payer-enrollments.csv`: seven enrollments: a Medicare revalidation in 74 days, one pending 62 days, one denied, one approved but not effective until 2026-03-01, one not started, and a Medicaid revalidation in 136 days that only a learned 150-day lead time flags.
- `credentialing-config.json`: warning and follow-up days. `credentialing-config-typo.json` names an unknown document.
- Provider names are not patient data. No patient data is used; `phi-canaries.json` lists fictional patients anyway so the shared leak test runs.
