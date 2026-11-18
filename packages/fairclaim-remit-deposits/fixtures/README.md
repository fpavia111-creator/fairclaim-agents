# Fairclaim Remit Deposits fixtures

Everything here is fictional: the practice (Example Family Medicine (fictional)), the payers (Example Health Plan, Sample Mutual Insurance, Demo Medicaid Plan, Test Medicare Contractor), the patients, member ids and claim numbers. NPIs are made-up numbers that pass the check digit; any match with a real provider is a coincidence. Regenerate with `npm run fixtures` from the repository root.

- `era-2026-02.835`: five 835 payments. EHP (with a 40.00 overpayment recovery and 2.10 interest) matches its deposit by the TRN in the bank description; SMI matches by amount two days later; DMP has the trace in the reference column but the bank received 10.00 less; the TMC paper check has no deposit; an EHP payment of 0.00 (a denial) expects no money.
- `bank-2026-02.csv`: six deposits. One EHP deposit has no remittance; a card settlement and a savings transfer are not insurance (the config ignores the transfer).
- `exports/waystar-remit.csv` and `exports/bank-2026-02-12.csv`: an ERA export with one check of two claims, and its deposit.
