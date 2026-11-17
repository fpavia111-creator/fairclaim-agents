# Anise of Dental fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `dental-claims-2026-02.837`: an 837D (005010X224A2) with six fictional claims. Planted: bitewings already taken this year; a 2-surface code for 3 surfaces; an anterior resin code on a molar; a crown 32 months after the last one on that tooth; an anterior root canal code on a molar; scaling and root planing with no quadrant, and with a cleaning the same day; a sealant billed twice; a posterior resin code with an occlusal surface on a front tooth; a filling on a tooth extracted in November. D5006 is clean.
- `dental-history.csv`: seven past procedures for those patients (exams, cleaning, bitewings, a crown, an extraction, root planing in another quadrant).
- `exports/open-dental-procs.csv`: two lines in an Open Dental user-query layout (database column names), with a lettered (primary) tooth on an adult.
- `dental-config.json`: primary-tooth age. `dental-config-typo.json` has a code without the D.
