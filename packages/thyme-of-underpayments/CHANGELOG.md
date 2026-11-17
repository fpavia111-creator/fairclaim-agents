# Changelog

## 0.2.0 (unreleased, Remedy ver 2)

Fixed:

- A contract method typed with a space ("fee schedule") or a percent method with no percent gave every line an expected amount of 0, so every paid line showed as overpaid; such a contract now prices nothing and says why.

Tests and evals:

- 24 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 14 eval cases.

## 0.1.0 (unreleased)

- First version (Remedy ver 1).
