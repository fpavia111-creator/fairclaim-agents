# Ginger of Edits fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `batch-ncci.837`: eleven claims. Planted: injection plus E/M with 25 (bypassed, warning) and without (error), an indicator 0 pair (93000 + 93010), 97530 + 97140 with 59 (bypassed), 97110 x6 against a clinical MUE of 4, three 20610 lines on one day against a policy MUE of 2, two claims with 99213 for one patient on one day, a pair whose edit was deleted on 2025-12-31 (no finding), a preventive visit pair with indicator 9 (no finding), and the same side (LT) on both lines, which does not bypass.
- `ncci-ptp-practitioner.csv` and `ncci-mue-practitioner.csv`: illustrative rows in the CMS layouts (with title lines above the header, as CMS files have). They are not the CMS edits.
