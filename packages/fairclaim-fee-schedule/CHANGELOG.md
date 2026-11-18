# Changelog

Renamed from `hyssop-of-fees` on 18 Nov 2026 (tool names were `hyssop_*`, now `fees_*`).

## 0.2.0 (unreleased, Fairclaim ver 2)

Fixed:

- A 26 or TC fee with no matching RVU row was priced from the global row (the whole service), so a professional fee looked far below Medicare; it is now left unpriced. Status J (anesthesia) and four other status codes now have a meaning.

Tests and evals:

- 23 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 16 eval cases.

## 0.1.0 (unreleased)

- First version (Fairclaim ver 1).
