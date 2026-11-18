# Fairclaim Anesthesia Claims fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `anesthesia-claims-2026-02-03.csv`: one fictional operating day, 14 claims for 9 cases (an anesthesiologist and two CRNAs), with qualifying circumstance lines. Planted: QY billed while the anesthesiologist covered two rooms (twice); 99100 on a 13-year-old; reported minutes that do not match the times; AA while a CRNA billed the same case; a CRNA with two overlapping cases; a case with no physical status modifier and units billed above base plus time. Cases K1 and K2 (QK with QX, two rooms) and the case that crosses midnight are clean.
- `anesthesia-base-units-illustrative.csv`: base units for the codes used. Illustrative values for testing: load the CMS anesthesia base units file for your year.
- `anesthesia-config.json`: per-payer conversion factors (illustrative), rounding and whether physical status and qualifying units are paid. `anesthesia-config-typo.json` has a rounding value that does not exist.
