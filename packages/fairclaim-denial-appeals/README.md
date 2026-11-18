# Fairclaim Denial Appeals (`fairclaim-denial-appeals`)

Drafts appeals for denied claims from your 835s, quoting the payer policy files you supply by file and line, with the argument for the denial category, the deadline and the enclosures to attach; tracks appeals against the payer's response time and the next level. Nothing is sent: a named person approves each draft.

**Fairclaim Denial Appeals never files appeals; a person sends the approved draft by mail, fax or portal. Fairclaim Denial Appeals never reads or attaches medical records; a person adds them.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-denial-appeals demo
npx -y fairclaim-denial-appeals mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-denial-appeals demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Denial Appeals demo (fictional practice, payers, policies and patients) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-denial-appeals-demo-fQs9KC

▶ Find the policy lines for a bundled injection
  status: executed  decision: allow
  R1002: CO-97 (bundling) 120. 5 policy passage(s) found. File by 2026-04-13 (57 days left).
    score 7  policies/smi-joint-injections.md:6  An evaluation and management service on the same day as 20610 is payable with modifier 25 when it is significant and separately identifiable.
    score 7  policies/smi-joint-injections.md:7  The injection 20610 is payable separately from an E/M service when the documentation supports a distinct decision to inject.
    score 5  policies/smi-joint-injections.md:4  Prior authorization is not required for 20610 when performed in the office (place of service 11).
    score 5  policies/smi-joint-injections.md:5  Prior authorization is required for 20610 when performed with ultrasound guidance (20611).
    score 1  policies/smi-joint-injections.md:9  Appeals must be received within 60 days of the remittance date.
    FLAGGED  policies/smi-joint-injections.md:8  [withheld: this line reads like instructions to an AI]

▶ Draft the appeal (markers left for what only a person knows)
  status: executed  decision: allow  (auto)
  appeal R1002 drafted for 120 with 6 open marker(s) ([TO CONFIRM: appeal address, fax or portal], [MISSING: rendering NPI], [MISSING: two or three sentences from the record: what was done, why, and how it meets the policy], [ATTACH: office note for the date of service], [ATTACH: copy of the remittance advice], [MISSING: name and phone]). Nothing was sent.

▶ Approving it while markers are open is refused
  status: needs_approval  decision: ask
  reason: binding_send stays one-click, even in Auto

▶ Track open appeals
  status: executed  decision: allow
  6 appeal(s): 4 open (670), 2 overdue, 120 won.

▶ Write the tracker (German page)
  status: executed  decision: allow
  Appeal tracker written: 6 appeal(s): 4 open (670), 2 overdue, 120 won. Files: remedy-out/appeals/appeals.csv, remedy-out/appeals/appeals.html.

▶ Agent tries to file the appeal itself
  status: blocked  decision: block
  reason: Fairclaim Denial Appeals never files appeals; a person sends the approved draft by mail, fax or portal.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `appeals_policy_search` | Show the denial lines of one claim, its category and filing deadline, and the policy lines that mention its codes or the words of its category, best first, with file and line. | runs |
| `appeals_draft_appeal` | Write a draft first-level (or later) appeal for one denied claim: the denial lines, what to argue for its category, quotes from the policy files with file and line, and the enclosures. | asks first (Auto can be opted in) |
| `appeals_request_send` | After one named human click (even in Auto), record that the reviewed appeal draft is approved in appeal-requests.csv. | one named click, even in Auto (`binding_send`) |
| `appeals_track` | Read the appeal log and say for each appeal: waiting, overdue (past the payer's response time), next level, exhausted or won, with the next step. | runs |
| `appeals_write_report` | Write appeals.csv and appeals.html (every appeal with status, response due and next step, and blank owner and notes columns) into out_dir (default remedy-out/appeals). | runs |
| `appeals_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `appeals_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `appeals_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `appeals_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `appeal_submit` | Fairclaim Denial Appeals never files appeals; a person sends the approved draft by mail, fax or portal. | refused |
| `medical_record_attach` | Fairclaim Denial Appeals never reads or attaches medical records; a person adds them. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Remittances (ERA / payment export) (`remits`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `claim_id` (required) | text | Claim ID, Patient Control Number, Claim Number, Claim #, Encounter ID, Encounter | - |
| `payer_claim_id` | text | Payer Claim Number, ICN, Payer Claim ID, Claim Control Number, Payer ICN, Payer Claim Control Number | - |
| `patient_name` | text (masked) | Patient, Patient Name, Pt Name | Patient, Patient, 患者名, 患者 |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insured ID, Policy Number | - |
| `account` | text (masked) | Account Number, Patient Account, Acct #, Account # | - |
| `payer` | text | Payer, Payer Name, Insurance, Payor, Carrier, Insurance Company | Kostenträger, Payeur, 保険者, 付款方 |
| `payer_id` | text | Payer ID, Payor ID | - |
| `check_number` | text | Check Number, Check #, EFT Number, EFT Trace, Trace Number, Payment Reference | - |
| `payment_date` | date | Payment Date, Check Date, Paid Date, Remit Date, EFT Date, Check/EFT Date | - |
| `claim_status` | text | Claim Status Code, Status Code, CLP02, Claim Status | - |
| `date_of_service` | date | DOS, Date of Service, Service Date, From Date | Leistungsdatum, Date de soins, 診療日, 服务日期 |
| `code` | text | CPT, CPT Code, Procedure, Procedure Code, HCPCS, Proc Code | - |
| `modifiers` | text | Modifiers, Modifier, Mod | - |
| `units` | number | Units, Qty, Paid Units, Units Paid | Anzahl, Quantité, 回数, 数量 |
| `billed` | amount | Billed, Charge, Billed Amount, Charges, Submitted Charge, Charge Amount | Rechnungsbetrag, Montant facturé, 請求額, 账单金额 |
| `allowed` | amount | Allowed, Allowed Amount, Allowable, Allowed Amt | Anerkannt, Montant admis, 許容額, 允许金额 |
| `paid` | amount | Paid, Paid Amount, Payment, Insurance Paid, Payer Paid, Ins Paid | Bezahlt, Payé, 支払額, 已付 |
| `patient_responsibility` | amount | Patient Responsibility, Pt Resp, PR Amount, Patient Portion, Patient Resp | - |
| `adjustment_group` | text | Group Code, Adj Group, Adjustment Group, CAS Group, Group | - |
| `adjustment_reason` | text | Reason Code, CARC, Adj Reason, Adjustment Reason, Adjustment Code, Denial Code | - |
| `adjustment_amount` | amount | Adjustment, Adj Amount, Adjustment Amount, Adj Amt, Write Off, Contractual | - |
| `adjustments` | text | Adjustments, Adjustment Codes, CARC Codes, CAS, Adjustment Detail | - |
| `remarks` | text | Remark Codes, RARC, Remarks, Remark, Remark Code, RARC Codes | - |
| `rendering_npi` | text | Rendering NPI, Provider NPI, NPI | - |
| `provider` | text | Provider, Rendering Provider, Provider Name | Leistungserbringer, Prestataire, 医師, 医生 |
| `received_date` | date | Received Date, Date Received, Payer Received | - |
| `submitted_date` | date | Submitted, Submit Date, Date Submitted, Billed Date, Claim Date | - |

### Appeal log (`appeals`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `claim_id` (required) | text | Claim ID, Claim Number, Claim #, Patient Control Number | - |
| `payer` | text | Payer, Insurance, Payer Name | Kostenträger, Payeur, 保険者, 付款方 |
| `patient_name` | text (masked) | Patient, Patient Name | Patient, Patient, 患者名, 患者 |
| `level` | number | Level, Appeal Level | - |
| `filed` | date | Filed, Filed Date, Date Filed, Submitted, Sent Date | - |
| `status` | text | Status, Outcome, Decision | Status, Statut, ステータス, 状态 |
| `amount` | amount | Amount, Amount Appealed, Denied Amount, Balance | Betrag, Montant, 金額, 金额 |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-denial-appeals inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-denial-appeals can remember facts about your setup so the next run does not have to be told again. `appeals_learn` only proposes a fact; it changes nothing until a named person accepts it with `appeals_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_appeal_address` | puts the address on that payer's appeal drafts, still marked [CHECK] so a person confirms it is current. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-denial-appeals memory list
fairclaim-denial-appeals memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-denial-appeals memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-denial-appeals demo
npx -y fairclaim-denial-appeals mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-denial-appeals": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-denial-appeals",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-denial-appeals -- npx -y fairclaim-denial-appeals mcp --root .`, or install the `fairclaim-denial-appeals` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-denial-appeals approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-denial-appeals approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-denial-appeals kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-denial-appeals tools                 # every tool, its policy and arguments
fairclaim-denial-appeals sources               # the columns each input is read from
fairclaim-denial-appeals inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-denial-appeals call appeals_policy_search '{"remits":"<remits>","claim_id":"<claim_id>","policies":"<policies>"}'
fairclaim-denial-appeals eval                  # the private eval cases on the fictional fixtures
fairclaim-denial-appeals demo
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
