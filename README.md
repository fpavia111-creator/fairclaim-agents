# Remedy medical billing agents

Thirty small MCP agents for medical billing and the revenue cycle. Each one owns **one job**, such as scrubbing claims before they go out, sorting the denials in an 835, finding underpaid lines or working the credit balance report, and cannot act outside it. They read the files you already export from your practice management system, clearinghouse and payer portals (837, 835, 999, 277CA, 271 and 278 files or spreadsheets), mask patient identifiers before any result reaches the AI model, write worklists on your machine, and wait for a named person before anything is sent, refunded, posted or paid.

MIT licence · Node 20 or newer · local files only · no credentials · no dependencies · fictional test data only

Also in: [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Italiano](README.it.md) · [日本語](README.ja.md) · [简体中文](README.zh-Hans.md) · [한국어](README.ko.md) (translated by Claude; native review pending)

## Try one

```bash
npx -y sage-of-claims demo          # claim scrubber on fictional claims
npx -y yarrow-of-denials demo       # denial worklist from a fictional 835
```

Every agent has a `demo` that runs on fictional files, an `eval` that checks it against its own test cases, and an MCP server (`npx -y <agent> mcp --root <folder>`) for Claude Desktop, Claude Code, Cursor and other MCP hosts. Each agent's README lists its tools, the columns it reads and the exports it recognises.

## The agents

**Before the claim goes out**

| Agent | What it does | Never does |
|---|---|---|
| [`marjoram-of-registration`](packages/marjoram-of-registration) | Registration and insurance records before the visit: member ID and MBI shape, birth dates, subscriber gaps, ended coverage, likely duplicate charts | Merges or edits patient records |
| [`basil-of-eligibility`](packages/basil-of-eligibility) | 271 eligibility responses against the appointment list: inactive, not found, plan ending, another payer primary, amounts to collect | Sends eligibility inquiries or cancels visits |
| [`mint-of-authorizations`](packages/mint-of-authorizations) | Claims and scheduled services against the prior authorization log and 278 responses: missing, expired, used-up or mismatched authorizations | Submits authorization requests or logs in to payer portals |
| [`borage-of-estimates`](packages/borage-of-estimates) | Good faith estimates for self-pay and uninsured patients: due dates in business days, late estimates, final bills past the $400 dispute threshold | Sends an estimate without a named person's click |
| [`clover-of-charges`](packages/clover-of-charges) | Completed visits matched to charges: missed charges, charges with no visit, late charge entry, E/M level mix by provider | Posts charges or signs notes |
| [`sage-of-claims`](packages/sage-of-claims) | Claim scrubber for 837s and claim exports: identifiers, diagnoses, pointers, dates, place of service, payer rules you learn | Submits or edits claims |
| [`dill-of-modifiers`](packages/dill-of-modifiers) | Modifiers on each line: missing or misplaced 25 and 57, 59 with X modifiers, laterality, bilateral units, conflicting pairs | Appends modifiers or submits claims |
| [`ginger-of-edits`](packages/ginger-of-edits) | Claims against the CMS NCCI PTP and MUE files you download, by date of service | Appends modifiers or submits claims |
| [`anise-of-dental`](packages/anise-of-dental) | Dental claims: CDT codes, tooth numbers and surfaces, quadrants, frequency limits, extracted teeth, attachments payers ask for | Submits claims or updates the chart |
| [`caraway-of-anesthesia`](packages/caraway-of-anesthesia) | Anesthesia units (base, time, physical status, qualifying circumstances), medical direction modifiers against concurrent cases | Submits claims or edits anesthesia times |
| [`cumin-of-dme`](packages/cumin-of-dme) | DME claims and capped rentals: KH, KI and KJ by month, the 13-month cap, oxygen months, written order before delivery | Submits claims or signs orders |
| [`tarragon-of-labs`](packages/tarragon-of-labs) | Lab claims: CLIA number and certificate, QW, panels billed as components, repeats, venipuncture, diagnosis and frequency rules | Submits claims or releases results |
| [`lovage-of-telehealth`](packages/lovage-of-telehealth) | Telehealth lines: place of service 02 or 10, modifiers by payer, audio-only, the 98000-98015 codes, deleted 99441-99443, licensing in the patient's state | Submits claims or starts visits |
| [`nettle-of-audits`](packages/nettle-of-audits) | Coding audits: draws a repeatable sample per provider, writes the worksheet, scores the results with accuracy and dollar impact | Corrects claims or sends refunds |

**After the claim goes out**

| Agent | What it does | Never does |
|---|---|---|
| [`verbena-of-rejects`](packages/verbena-of-rejects) | 999 and 277CA acknowledgements tied back to the claim and loop in the 837 you sent | Resubmits claims or logs in to the clearinghouse |
| [`chamomile-of-ar`](packages/chamomile-of-ar) | Open insurance A/R by payer and bucket, timely-filing limits, claims with no response, what to work first | Posts write-offs or calls payers |
| [`fennel-of-remits`](packages/fennel-of-remits) | 835 remittances matched to bank deposits; missing, short and unexplained payments | Posts payments or moves money |
| [`yarrow-of-denials`](packages/yarrow-of-denials) | Denials sorted by reason code and root cause into a worklist with the team and next step | Resubmits, appeals or uses payer portals |
| [`rosemary-of-appeals`](packages/rosemary-of-appeals) | Appeal drafts quoting the payer policy files you supply, with deadline and enclosures | Submits an appeal without a named person's click |
| [`thyme-of-underpayments`](packages/thyme-of-underpayments) | 835 lines priced from your contract: underpaid and overpaid lines, reprocessing requests | Submits through payer portals or posts payments |
| [`tansy-of-credits`](packages/tansy-of-credits) | The credit balance report: who is owed what, by when, refund drafts | Issues a refund without a named person's click |
| [`aloe-of-statements`](packages/aloe-of-statements) | Patient statement cycles: who gets a first, second or final statement, who is held and why, a plain-language draft | Sends statements or assigns accounts to collections |
| [`savory-of-plans`](packages/savory-of-plans) | Patient payment plans against your policy: missed installments, terms outside policy, options for a new balance | Charges cards or cancels plans |

**Run the practice**

| Agent | What it does | Never does |
|---|---|---|
| [`hyssop-of-fees`](packages/hyssop-of-fees) | Your fee schedule priced against the Medicare RVU and GPCI files: fees below Medicare or your floor | Publishes a fee schedule without a named person's click |
| [`laurel-of-contracts`](packages/laurel-of-contracts) | Payer rates against Medicare and each other, weighted by volume; contract end dates and notice deadlines | Signs contracts or sends termination notices |
| [`sorrel-of-payers`](packages/sorrel-of-payers) | Payer scorecards from your 835s and submissions: days to pay, denial rate and reasons, share of billed paid, monthly trend | Files complaints |
| [`lavender-of-credentialing`](packages/lavender-of-credentialing) | Licences, DEA, board certification, CAQH attestation and payer enrollment dates | Submits enrollments or attests in CAQH |
| [`angelica-of-prices`](packages/angelica-of-prices) | Hospital price transparency file against the CMS template and your chargemaster | Publishes the file or changes the chargemaster |
| [`mallow-of-kpis`](packages/mallow-of-kpis) | Revenue cycle KPIs from your claims and 835s, against the targets you set; no built-in benchmarks | Sends reports or writes off balances |
| [`vervain-of-onboarding`](packages/vervain-of-onboarding) | Go-live readiness for a new practice: billing NPI and address, roster, EDI, ERA, EFT and credentialing by payer, fees | Submits enrollments or switches a practice live |

## Patient data

Results go to an AI model, so each agent masks patient identifiers before they leave it (`--phi mask`, the default): names, member IDs and record numbers become stable pseudonyms (`PT-3f9a1c2e`), birth dates become the birth year, and addresses, phone numbers, e-mails and SSNs are removed, also inside free text. `--phi strict` also hides claim numbers, service days and ZIP codes. Tools accept a pseudonym back as an argument. Report files written to disk keep real names because people work from them. Turning masking off is possible and is recorded in the audit log.

Every agent's shared tests check that no fictional patient identifier from its fixtures reaches any eval result, and the hostile-input run checks the same with poisoned data. This keeps PHI away from the model by design; it is not a HIPAA compliance determination. Your business associate agreements, access controls, retention and policies still apply. All bundled data is fictional.

## How they stay safe

- **Allowlist per agent.** Each agent can call only its own tools. Anything else is blocked, including tools a host model invents.
- **Refused tools.** Each agent names the live actions near its job (submitting claims, posting payments, issuing refunds, logging in to payer portals) and blocks them, so a model asking for them gets a clear refusal.
- **One named click.** Sending a statement, an appeal or a refund request, publishing a fee schedule, and accepting something the agent learned wait for a named person, even in Auto mode. Approvals are tied to the sha256 of the reviewed draft.
- **Memory that only tightens.** An agent can learn a payer's rule from a denial, but a learned fact applies only after a named person accepts it, it can add a check but not remove one, and every result names the facts it used.
- **Audit log.** Every call is written to a hash-chained log under `.remedy/`, signed with an Ed25519 key when you configure one.
- **Kill switch.** `<agent> kill` stops every tool until `<agent> unkill`.
- **Hostile input tested.** Spreadsheet formulas, HTML, path tricks and text aimed at the model are planted in every agent's data (`npm run hostile`).

## Use with Claude Code

This repository is a Claude Code plugin marketplace (`remedy-medical-billing`). Each agent is a plugin that starts its MCP server with `npx`:

```text
/plugin marketplace add <path or git URL of this repository>
/plugin install sage-of-claims@remedy-medical-billing
```

The plugins start `npx -y <agent>@<version>`, so they need that version on npm. Until then, add an agent from a local checkout:

```bash
claude mcp add sage-of-claims -- node /path/to/remedy-agents/packages/sage-of-claims/bin/sage-of-claims.js mcp --root .
```

## Develop

```bash
npm ci
npm test                       # every package's tests and evals
npm run intl                   # every spreadsheet eval case as an export from 8 countries
npm run hostile                # planted hostile inputs and patient-data leak check in every agent
npm run mcp:check              # the official MCP SDK client against every agent
npm run readme:check           # generated README sections are up to date
npm run bench                  # speed at 1,000 and 10,000 rows
npm run plugin:check           # plugin files match the packages
npm run release:check:offline  # pack contents, licences, docs and versions
node scripts/new-agent.mjs <herb>-of-<word> "<description>" kw1,kw2
```

CI runs on Node 20, 22 and 24, on Linux and Windows.

## How they are tested

Each agent has hand-written tests for its own rules, the same contract tests as every other agent (every argument described, one-click actions never on Auto, the default rule is block, no patient identifier in any eval result, the stdio MCP server) and 8 to 13 eval cases on fictional files, including a patient-masking case and a report in another language. Every spreadsheet case is run again as a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export (CMS files keep their published English layout), and hostile data is planted in every agent's files. [REVIEW-ver1.md](REVIEW-ver1.md) lists every check and its result.

## Limits

- Every agent works from the files you give it. None of them logs in to a payer, clearinghouse, practice management system or bank.
- Code tables, payer rules, fee schedules and limits are as current as what you load. Built-in tables and example rules are starting points, not any payer's policy; check each payer's current policy.
- Not coding, legal, compliance or medical advice. People decide and act.
- Export layouts were written from knowledge of each system and were not tested against live accounts; each agent's README says which layouts were checked against published documentation.
