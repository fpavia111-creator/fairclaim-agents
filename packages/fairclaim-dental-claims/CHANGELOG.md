# Changelog

Renamed from `anise-of-dental` on 18 Nov 2026 (tool names were `anise_*`, now `dental_*`).

## 0.2.0 (unreleased, Fairclaim ver 2)

Fixed:

- The same line on two claims was flagged as a duplicate on both copies (and counted twice for same-day frequency); now only the later copy.

- Reads Open Dental procedure-log exports that include ProcStatus: only completed procedures are checked (see fairclaim-core).

Tests and evals:

- 26 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 14 eval cases.

## 0.1.0 (unreleased)

- First version (Fairclaim ver 1).
