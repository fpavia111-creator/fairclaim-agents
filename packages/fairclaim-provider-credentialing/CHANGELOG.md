# Changelog

Renamed from `lavender-of-credentialing` on 18 Nov 2026 (tool names were `lavender_*`, now `credentialing_*`).

## 0.2.0 (unreleased, Fairclaim ver 2)

Fixed:

- An enrollment marked "Not submitted" was read as pending (the word "submitted") and "Not enrolled" or "Terminated" gave no task at all; they are now not started, and terminated or inactive enrollments are reported like a denial.

Tests and evals:

- 23 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 14 eval cases.

## 0.1.0 (unreleased)

- First version (Fairclaim ver 1).
