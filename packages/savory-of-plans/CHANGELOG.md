# Changelog

## 0.2.0 (unreleased, Remedy ver 2)

Fixed:

- When the policy's longest term was under three months, the plan options fell back to the minimum payment and could offer, for example, 40 months against a 2-month limit; options now never run past the limit, and a limit that is not a standard length (such as 10 months) is offered too. A paid-off plan no longer gets a term-limit note.

Tests and evals:

- 24 tests (ver 1: 13 to 18 per agent), including a new domain test file, and 14 eval cases.

## 0.1.0 (unreleased)

- First version (Remedy ver 1).
