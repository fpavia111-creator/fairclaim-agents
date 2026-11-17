# Changelog

## 0.2.0 (unreleased, Remedy ver 2)

Fixed:

- Any value in the modality column (including "In person" or "Office") made an office visit a telehealth line, which then got place-of-service errors; only a remote modality counts now. A provider in the licence list with no states no longer stops the check.

Tests and evals:

- 25 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 15 eval cases.

## 0.1.0 (unreleased)

- First version (Remedy ver 1).
