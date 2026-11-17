# Changelog

## 0.2.0 (unreleased, Remedy ver 2)

Fixed:

- A visit status of "Not seen" counted as a completed visit (the word "seen"), so it showed as a missing charge; "Not seen", "left without being seen" and "LWBS" are now cancellations and any status with "not" is no longer a completed visit.
- An expected-code rule with no codes failed the whole check; such a rule is now ignored.

Tests and evals:

- 25 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 15 eval cases.

## 0.1.0 (unreleased)

- First version (Remedy ver 1).
