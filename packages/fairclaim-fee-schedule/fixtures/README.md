# Fairclaim Fee Schedule fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `rvu-illustrative.csv` and `gpci-illustrative.csv`: made-up relative values and GPCIs in the layout of the CMS PPRRVU and GPCI files (title lines above the header). They are not the CMS numbers. `fee-config.json` uses the CY2026 non-qualifying-APM conversion factor 33.4009 from the CMS final rule; check the figure for the year you price.
- `fee-schedule.csv`: ten codes. Planted at the Alaska locality: 99214 below the Medicare amount; 99213 and 20610 below the 150% target; 93000 above the 400% ceiling; no fee for 99211; Medicare status X (36415) and N (99385); a code with no RVU (J3490).
- `exports/pfs-indicators.csv` and `exports/pfs-localities.csv`: four codes and one locality in the pfs.data.cms.gov layouts, with the conversion factor in the file.
- No patient data is used here; `phi-canaries.json` lists fictional patients anyway so the shared leak test runs.
