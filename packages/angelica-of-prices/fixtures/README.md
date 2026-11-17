# Angelica of Prices fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `standard-charges-v3.csv`: a CMS tall CSV, template v3.0, for a fictional hospital (13 data rows). Planted: a type 2 NPI with a bad check digit; a dollar amount written "$455.00"; an algorithm with methodology "other" and no note or count; an NDC with no drug unit or type; a setting "Outpatient surgery"; a dollar amount with no min or max; a duplicate row; a payer and plan named with no negotiated charge; a count written "1,204"; a code type "CPT4"; a cash price above the gross charge. It does not list 74177 from the required list.
- `standard-charges-v2.csv`: the same hospital on template v2.2, dated 2025-06-30, with license_number|[state] left as a placeholder.
- `chargemaster.csv`: ten items; 80053 is 60.00 (the file says 55.00) and 71046 is missing from the file.
- `era-2025-2026.835`: two 835 payments for the allowed-amount table: 14 paid 99213 lines for one payer (count 14, median 100, 10th 92, 90th 110), 4 for another (count "1 through 10"), three CT heads, one $0 denial, one reversal and one line before the period.
- `price-config.json`: required codes and plan names. `price-config-typo.json` has an age limit over 400 days.
- The 835 patients are fictional; Angelica never needs them and they are masked anyway.
