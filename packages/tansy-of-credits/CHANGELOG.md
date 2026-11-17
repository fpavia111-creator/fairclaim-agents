# Changelog

## 0.2.0 (unreleased, Remedy ver 2)

Fixed:

- Any payer name containing "self" or "card" (a self-funded employer plan, a BlueCard payment) was taken for a patient credit, so a payer overpayment lost its refund deadline; the patient words are now whole words.
- Medicaid overpayments had no refund deadline unless configured; the 60-day report-and-return rule covers Medicaid as well as Medicare, so they now get it.

Tests and evals:

- 23 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 15 eval cases.

## 0.1.0 (unreleased)

- First version (Remedy ver 1).
