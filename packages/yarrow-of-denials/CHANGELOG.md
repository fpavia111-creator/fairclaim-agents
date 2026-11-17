# Changelog

## 0.2.0 (unreleased, Remedy ver 2)

Fixed:

- A denial whose appeal deadline had already passed was ranked high priority (its days left were below 14), so dead claims topped the worklist; it now goes last as "deadline_passed" with a note about late appeals for good cause.

Tests and evals:

- 24 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 14 eval cases.

## 0.1.0 (unreleased)

- First version (Remedy ver 1).
