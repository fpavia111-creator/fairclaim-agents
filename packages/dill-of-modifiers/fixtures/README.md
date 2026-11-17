# Dill of Modifiers fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `batch-2026-02-06.837`: ten claims. D1001 and D1003 are clean. Planted: E/M with an injection and no 25, injection with no side (D1002); 59 with XS and LT with RT (D1004); 25 on a skin biopsy (D1005); 59 to a payer that does not take it (D1006); 91 with no first test (D1007); 50 with 2 units (D1008); 26 after RT (D1009); an unknown modifier (D1010).
- `modifier-config.json`: codes that need a side and one payer rule. `modifier-config-typo.json` has an unknown action.
- `exports/advancedmd-charges.csv`: two visits in a charge-detail export layout with modifier columns (E/M with an injection and no 25; 26 with TC).
