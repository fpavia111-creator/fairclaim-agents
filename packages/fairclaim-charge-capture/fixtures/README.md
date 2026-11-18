# Fairclaim Charge Capture fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `appointments-2026-02.csv`: twenty visits. `exports/tebra-charges-2026-02.csv`: the charges in a charge-detail export layout. Planted, as of 2026-02-12: an injection visit billed with only an E/M code (V102); a completed visit with no charge after 7 days (V103) and one from yesterday (V104, still pending); a no-show with a charge (V105); a charge billed 8 days after the visit (V106); a future visit (V107, skipped); a charge matched by patient and date because its encounter number differs (V108 / E-88); a charge with no visit (W900). Ten January visits give two providers different E/M level mixes.
- `charge-config.json`: charge lag target, comparison gap and the injection rule. `charge-config-typo.json` gives the lag as a word.
