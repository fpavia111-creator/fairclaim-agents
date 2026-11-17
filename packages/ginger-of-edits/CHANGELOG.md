# Changelog

## 0.2.0 (unreleased, Remedy ver 2)

Fixed:

- Modifier 25 on a non-E/M line (for example the injection) was taken as bypassing a PTP edit; 25 and 57 now count only on the E/M line.
- Date-of-service MUEs added units across claims from different billing providers; MUEs are per provider, patient and day, so they are now kept apart.
- A column 1 code on two lines gave the same PTP finding twice for one column 2 line; it is now reported once.

Tests and evals:

- 24 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 15 eval cases.

## 0.1.0 (unreleased)

- First version (Remedy ver 1).
