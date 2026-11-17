# Thyme of Underpayments fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `era-2026-02-10.835`: nine claims from four payers. Planted: 99213 allowed 90 against a 96 fee (C7001), a -26 line paid at 40% as the contract says (C7002), a second procedure that should be at 50% but was allowed 30 against 40 (C7003), three units allowed as two (C7004), 99214 allowed at 100% of Medicare where the contract says 115% (C7005), a percent-of-charge payer paid right (C7006), a payer with no contract (C7007), a code missing from the fee file (C7008) and a denied line (C7009).
- `contract.json`: method per payer, modifier percents, the multiple-procedure rule. `contract-typo.json` leaves out the percent a percent-of-Medicare payer needs.
- `fees-ehp.csv`: the fee schedule, with an expired 2025 row that must not be used. `medicare-fees.csv`: two Medicare fees.
