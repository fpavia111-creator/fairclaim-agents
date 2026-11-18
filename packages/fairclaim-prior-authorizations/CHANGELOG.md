# Changelog

Renamed from `mint-of-authorizations` on 18 Nov 2026 (tool names were `mint_*`, now `authorizations_*`).

## 0.2.0 (unreleased, Fairclaim ver 2)

Fixed:

- A log status other than the exact words approved, denied, pending or cancelled (for example "Not approved" or "Under review") was treated as an approval, so the service showed as covered; statuses are now read from everyday words and an unknown word is never an approval.
- A 278 partial approval updated only the status, so the log's requested units and dates were still used; the payer's approved units and dates now replace them.

Tests and evals:

- 22 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 14 eval cases.

## 0.1.0 (unreleased)

- First version (Fairclaim ver 1).
