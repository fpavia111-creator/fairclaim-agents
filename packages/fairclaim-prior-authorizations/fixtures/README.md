# Fairclaim Prior Authorizations fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `services-2026-02.csv`: eleven service lines (charge-export layout with a prior-auth column). Planted, as of 2026-02-10: covered therapy (M1, M2); an authorization running out and then over its units (M3, M4); an injection with no authorization (M5); an MRI after the authorization ended (M6); surgery pended by the payer (M7); a code not on the authorization (M8); a denied review (M9); a number on a claim that needs none and is not in the log (M10); a typo in the number (M11).
- `auth-log.csv`: the authorization log. `responses-278.x12`: the payer's 278 answers (one pended, one not certified).
- `auth-log-status-words.csv`: the same log with everyday status words (Partial approval, Under review, Not approved, see notes, Requested).
- `auth-rules.json`: codes each payer requires authorization for. `auth-rules-typo.json` gives codes as a string.
