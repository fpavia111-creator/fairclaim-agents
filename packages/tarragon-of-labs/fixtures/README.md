# Tarragon of Labs fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `lab-claims-2026-02.837`: an 837P with eight fictional lab claims. Planted: no CLIA and an HbA1c with only a screening diagnosis, two months after the last one; a waived strep test without QW and venipuncture billed twice; every basic metabolic panel component billed separately; a lipid panel with one of its components; a CBC twice with no 91; a malformed CLIA. L8001 and L8008 are clean.
- `lab-history.csv`: two earlier HbA1c tests.
- `lab-config.json`: CLIA, waived tests, one example diagnosis rule and one example frequency limit (for testing, not payer policy). `lab-config-waiver.json` is the same lab with a certificate of waiver. `lab-config-typo.json` has a certificate type that does not exist.
