# Changelog

Renamed from `cumin-of-dme` on 18 Nov 2026 (tool names were `cumin_*`, now `dme_*`).

## 0.2.0 (unreleased, Fairclaim ver 2)

Fixed:

- A rental month that appeared in both the history file and the claim file (or was billed twice) counted as two months, so month 13 of a capped rental was reported as past the cap; the same date now counts once.

Tests and evals:

- 25 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 15 eval cases.

## 0.1.0 (unreleased)

- First version (Fairclaim ver 1).
