# Changelog

Renamed from `nettle-of-audits` on 18 Nov 2026 (tool names were `nettle_*`, now `audits_*`).

## 0.2.0 (unreleased, Fairclaim ver 2)

Fixed:

- Critical care 99291 and 99292 were treated as E/M levels, so an audit changing one to the other counted as an up- or downcode; they are time-based codes and now count as a wrong code.

Tests and evals:

- 23 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 15 eval cases.

## 0.1.0 (unreleased)

- First version (Fairclaim ver 1).
