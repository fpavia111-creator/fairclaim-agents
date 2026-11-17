# Borage of Estimates (`borage-of-estimates`)

Keeps good faith estimates for self-pay and uninsured patients on time: counts business days from scheduling or request to each estimate's due date, finds missing and late estimates, compares final bills with estimates per provider against the 400-dollar dispute threshold, and drafts an estimate for a person to send. Patient identifiers are masked before results reach the model.

**Borage never sends estimates to patients; a person sends the approved draft.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y borage-of-estimates demo
npx -y borage-of-estimates mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y borage-of-estimates demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Borage of Estimates demo (fictional practice, patients and prices) in <demo folder>

▶ Check good faith estimate timing (business days, one office holiday)
  status: executed  decision: allow
  7 visit(s) or request(s): missing 1, due 2, late 1, ok 1, not_required 2. 3 estimate(s) to send.
    missing       G2  Due 2026-02-13 (scheduled 12 business days ahead: 3 business days) and not issued: send it now and record why it was late.
    due           G3  Due 2026-02-17 (0 business day(s) left): scheduled 3 business days ahead: 1 business day.
    due           G7  Due 2026-02-17 (0 business day(s) left): requested: 3 business days.
    late          G6  Issued 2026-01-27, after the due date 2026-01-23 (scheduled 10 business days ahead: 3 business days).
    ok            G1  Issued 2026-02-04; due 2026-02-05.
    not_required  G4  Scheduled under 3 business days ahead and not requested: no estimate due at scheduling (give one if asked).
    not_required  G5  Insured and billing the plan, with no request: no self-pay estimate is due (estimates for insured patients fall under a separate rule).

▶ Compare final bills with estimates
  status: executed  decision: allow
  3 estimate line(s): dispute_eligible 1, over_estimate 1, within 1. 800 billed over estimates in total.

▶ Draft the missing estimate
  status: executed  decision: allow  (auto)
  estimate G2 drafted for 210 with 3 open marker(s) ([MISSING: diagnosis codes, if known], [CHECK: add expected charges from other providers or facilities (anesthesia, lab, imaging) or list them as not included], [CHECK: use your approved estimate template with the required notices (not a contract; the right to dispute a bill 400 dollars or more over the estimate)]). Nothing was sent.

▶ Agent tries to send it itself
  status: blocked  decision: block
  reason: Borage never sends estimates to patients; a person sends the approved draft.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `borage_timing` | Each self-pay or uninsured visit or request with the estimate due date in business days, days left and status (missing, due, late, ok, not_required). | runs |
| `borage_compare` | For each estimate and provider: estimate, billed, the difference and whether it reaches the dispute threshold (400 dollars by default). | runs |
| `borage_draft_estimate` | Write a draft estimate for one self-pay visit from your self-pay prices: each service, price and total, with the elements a person must add (diagnosis if known, co-provider charges, your approved template's notices). | asks first (Auto can be opted in) |
| `borage_request_send` | After one named human click (even in Auto), record that the reviewed estimate draft is approved in estimate-requests.csv. | one named click, even in Auto (`binding_send`) |
| `borage_write_report` | Write borage-estimates.csv (one row per visit or request with blank owner and sent columns) and borage-estimates.html into out_dir (default remedy-out/borage). | runs |
| `borage_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `borage_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `borage_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `borage_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `estimate_send` | Borage never sends estimates to patients; a person sends the approved draft. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Self-pay schedule or estimate log (`schedule`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `appointment_id` (required) | text | Appointment ID, Appt ID, Visit ID, Encounter ID, Request ID | - |
| `patient_name` | text (masked) | Patient, Patient Name, Pt Name | Patient, Patient, 患者名, 患者 |
| `coverage` | text | Insurance, Coverage, Primary Insurance, Payer, Financial Class | - |
| `self_pay` | text | Self Pay, Self-Pay, Uninsured, Not Billing Insurance | - |
| `scheduled_on` | date | Scheduled On, Date Scheduled, Booked On, Created Date, Booking Date | - |
| `service_date` | date | Service Date, Appointment Date, DOS, Visit Date, Date of Service | - |
| `requested_on` | date | Requested On, Estimate Requested, GFE Requested, Request Date | - |
| `issued_on` | date | GFE Issued, Estimate Issued, Issued On, Estimate Sent, GFE Sent | - |
| `visit_type` | text | Visit Type, Appointment Type, Service, Procedure Type | - |
| `codes` | text | Planned Codes, CPT, Expected Codes, Codes, Procedure Codes | - |

### Estimates and final bills (`bills`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `gfe_id` (required) | text | GFE ID, Estimate ID, GFE #, Estimate # | - |
| `patient_name` | text (masked) | Patient, Patient Name | Patient, Patient, 患者名, 患者 |
| `provider` | text | Provider, Facility, Provider or Facility, Billing Provider | Leistungserbringer, Prestataire, 医師, 医生 |
| `estimate` (required) | amount | Estimate, GFE Amount, Estimated, Estimated Total | - |
| `billed` (required) | amount | Billed, Billed Charges, Final Bill, Actual Charges, Charges | Rechnungsbetrag, Montant facturé, 請求額, 账单金额 |

### Self-pay price list (`prices`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `code` (required) | text | CPT, Code, HCPCS, Procedure Code | - |
| `description` | text | Description, Service, Procedure | Beschreibung, Description, 摘要, 摘要 |
| `price` (required) | amount | Self-Pay Price, Self Pay Price, Cash Price, Discounted Cash Price, Price, Fee | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx borage-of-estimates inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

borage-of-estimates can remember facts about your setup so the next run does not have to be told again. `borage_learn` only proposes a fact; it changes nothing until a named person accepts it with `borage_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `visit_type_codes` | adds these codes to drafted estimates for that visit type. It only adds lines; it never removes a code. |
| `note` | nothing (shown by recall only) |

```bash
borage-of-estimates memory list
borage-of-estimates memory accept MEM-1a2b3c4d5e6f --as "Your Name"
borage-of-estimates memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y borage-of-estimates demo
npx -y borage-of-estimates mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "borage-of-estimates": {
      "command": "npx",
      "args": [
        "-y",
        "borage-of-estimates",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add borage-of-estimates -- npx -y borage-of-estimates mcp --root .`, or install the `borage-of-estimates` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `borage-of-estimates approve <id> --as "Your Name"` (or on the local approvals page, `borage-of-estimates approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`borage-of-estimates kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
borage-of-estimates tools                 # every tool, its policy and arguments
borage-of-estimates sources               # the columns each input is read from
borage-of-estimates inspect <file>        # how a file would be read (names and shapes, never values)
borage-of-estimates call borage_timing '{"schedule":"<schedule>"}'
borage-of-estimates eval                  # the private eval cases on the fictional fixtures
borage-of-estimates demo
```

## Patient data

Results go to an AI model, so patient identifiers are masked before they leave the agent (`--phi mask`, the default): names, member IDs, MRNs and account numbers become stable pseudonyms such as `PT-3f9a1c2e`; birth dates become the birth year; addresses, phones, e-mails and SSNs are removed, also inside free text. `--phi strict` also hides claim numbers, service days and ZIP codes. Tools still take a pseudonym back as an argument. Report files written to disk keep real names, because people work from them: keep them in a folder only your staff can open. `--phi off` is possible and is recorded in the audit log. The shared tests check that no fictional patient identifier from the fixtures reaches any eval result. This is a design for keeping PHI away from the model; it is not a HIPAA compliance determination: your business associate agreements, access controls and policies still apply.

## Audit log and data

Every call is written to `.remedy/audit.jsonl` under the root: hash-chained JSON lines, with arguments stored as a hash, signed with an Ed25519 key when you configure one. Everything runs on your machine on files you choose. No network calls, no telemetry, no credentials. The bundled fixtures are fictional.

<!-- generated:end -->

## Limits

- It checks only what is in the files and config you load. Code tables, fee schedules, payer rules and limits are as current as what you give it; the built-in tables and example rules are starting points, not any payer's policy.
- It is not coding, legal, compliance or medical advice. A person reviews every result before a claim, appeal, refund or message goes anywhere; the agent sends nothing.
- Export layouts named in "Columns it reads" were written from knowledge of each system and not tested against a live account; `inspect` shows how a file was read.
- Patient masking keeps identifiers away from the model; it does not replace your HIPAA program (business associate agreements, access control, retention).
