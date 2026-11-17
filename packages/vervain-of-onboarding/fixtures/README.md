# Vervain of Onboarding fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `onboarding-setup.json`: a fictional practice going live on 2026-03-02. Planted: the billing provider address is a PO box with a five-digit ZIP. `onboarding-setup-typo.json` has a state that is not two letters.
- `provider-roster.csv`: three fictional providers. Planted: a taxonomy one character short; an NPI with a wrong check digit and no license state.
- `payer-enrollments.csv`: four payers. Planted: ERA pending and EFT not started; a provider still pending and one with no credentialing row; an EDI enrollment submitted 10 days before go-live and no payer ID; credentialing effective after go-live. Example Health Plan contracts at group level and is ready; Test Medicare Contractor is ready.
- `fee-schedule.csv` and `charges-last-month.csv`: a code billed with no fee, a fee of zero, a payer with no enrollment row and a provider not on the roster.
