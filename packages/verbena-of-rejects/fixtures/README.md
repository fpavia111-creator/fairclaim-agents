# Verbena of Rejects fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `batch-2026-01-20.837`: two 837P transactions. 0001 has five claims (one with a birth date in the future, one with a bad rendering NPI, one with no member id); 0002 has two claims and no billing NPI.
- `ack-999.x12`: transaction 0001 accepted with an element error on the second claim's DMG segment; 0002 rejected for the missing billing NPI (both its claims must be resent).
- `ack-277ca.x12`: the payer accepts V1001 and V1002, rejects V1003 (rendering NPI) and V1007 (member number); V1004 has no line.
- `ack-277ca-resent.x12`: a later 277CA (2026-01-23) accepting V1003 after it was resent with the right rendering NPI, so it drops off the worklist.
