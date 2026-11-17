# Changelog

## 0.2.0 (unreleased, Remedy ver 2)

Fixed:

- An appeal marked "Unpaid" was counted as won (it contains "paid") and "Not denied yet" as lost; statuses are now read as whole words.
- The policy search treated the dot in a diagnosis code such as E11.9 as "any character" and a code with a bracket would stop the search; codes are now matched as plain text.

Tests and evals:

- 23 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 14 eval cases.

## 0.1.0 (unreleased)

- First version (Remedy ver 1).
