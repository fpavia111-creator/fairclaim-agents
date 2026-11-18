# Changelog

Renamed from `laurel-of-contracts` on 18 Nov 2026 (tool names were `laurel_*`, now `contracts_*`).

## 0.2.0 (unreleased, Fairclaim ver 2)

Fixed:

- A payer's 26 or TC rate was compared with the global Medicare amount when no component amount was given, so it always looked far below the floor; it is now left without a Medicare amount.
- An auto-renewing contract whose term ended long ago said it "renews" on the day after the old end date; it now says it renewed and to record the new end date.

Tests and evals:

- 23 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 15 eval cases.

## 0.1.0 (unreleased)

- First version (Fairclaim ver 1).
