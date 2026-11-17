# Changelog

## 0.2.0 (unreleased, Remedy ver 2)

Fixed:

- A member id pattern from the config was compiled as given, so a pattern like "(a+)+" could hang the check and a typo stopped it with a raw error; it now gets the same guard as Marjoram and a readable error, and spaces and dashes in the id are ignored.
- An E/M with modifier 57 (decision for surgery) was still told to add 25; 57 now counts.

Tests and evals:

- 23 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 14 eval cases.

## 0.1.0 (unreleased)

- First version (Remedy ver 1).
