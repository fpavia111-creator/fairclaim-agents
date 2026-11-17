# Thyme of Underpayments (`thyme-of-underpayments`)

Finds underpaid (and overpaid) lines on your 835s by pricing each line from your contract: fee schedule, percent of Medicare or percent of charge, with modifier percents and the multiple-procedure rule. Lists missing fees, totals by payer, and drafts the reprocessing request for a person to send.

**Thyme never logs in to payer portals or files requests; a person sends the approved draft. Thyme never posts payments or adjustments.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y thyme-of-underpayments demo
npx -y thyme-of-underpayments mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y thyme-of-underpayments demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Thyme of Underpayments demo (fictional practice, payers, contract and patients) in <demo folder>

▶ Price every remittance line from the contract
  status: executed  decision: allow
  12 line(s), 9 priced: 4 underpaid by 66.75, 0 overpaid by 0. No fee for 1 code(s): Example Health Plan: 99395.
    underpaid      C7004 97110  allowed      64 expected      96  fee 32
    underpaid      C7005 99214  allowed     125 expected  143.75  115% of Medicare 125
    underpaid      C7003 20610  allowed      30 expected      40  fee 80, multiple procedure at 50%
    underpaid      C7001 99213  allowed      90 expected      96  fee 96
    as_contracted  C7002 99214  allowed   130.5 expected   130.5  fee 130.5
    as_contracted  C7002 93000  allowed      12 expected      12  fee 30, -26 at 40%
    as_contracted  C7003 11042  allowed     140 expected     140  fee 140
    no_fee         C7008 99395  allowed     150 expected       -  99395 is not in the fee schedule for Example Health Plan.
    denied         C7009 99213  allowed       0 expected       -  No payment: a denial, worked in yarrow-of-denials.
    as_contracted  C7005 99213  allowed   101.2 expected   101.2  115% of Medicare 88
    as_contracted  C7006 99212  allowed      54 expected      54  60% of charge
    no_contract    C7007 99213  allowed    93.6 expected       -  No contract terms for this payer in the config.

▶ How claim C7003 was priced
  status: executed  decision: allow
  C7003 (Example Health Plan): 11042 as_contracted 0; 20610 underpaid -10.

▶ Draft the reprocessing request for C7004
  status: executed  decision: allow  (auto)
  reprocessing request C7004 drafted for 32 with 2 open marker(s) ([CHECK: contract name, section and effective date], [MISSING: name and phone]). Nothing was sent.

▶ Write the report (Italian page)
  status: executed  decision: allow
  Underpayment report written: 12 line(s), 9 priced: 4 underpaid by 66.75, 0 overpaid by 0. No fee for 1 code(s): Example Health Plan: 99395. Files: remedy-out/thyme/thyme-underpayments.csv, remedy-out/thyme/thyme-underpayments.html.

▶ Teach a fee the file is missing
  status: executed  decision: allow
  Stored MEM-bcd2a13ccbc0 as waiting. It changes nothing until a named person accepts it with thyme_accept_learning (id "MEM-bcd2a13ccbc0", decision "accept").

▶ Agent tries to file it in the portal itself
  status: blocked  decision: block
  reason: Thyme never logs in to payer portals or files requests; a person sends the approved draft.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `thyme_check` | Price every paid remittance line from the contract and compare with what the payer allowed. | runs |
| `thyme_explain` | Show how each line of one claim was priced: method, fee, modifier and multiple-procedure steps, allowed and variance. | runs |
| `thyme_write_report` | Write thyme-underpayments.csv (every line with expected, allowed, variance, basis and blank decision columns) and thyme-underpayments.html (totals by payer, missing fees) into out_dir (default remedy-out/thyme). | runs |
| `thyme_draft_reprocessing_request` | Write a draft request asking one payer to reprocess the underpaid lines of one claim at the contracted rate, listing each line, the allowed amount, the contract amount and the basis. | asks first (Auto can be opted in) |
| `thyme_request_send` | After one named human click (even in Auto), record that the reviewed reprocessing request draft is approved in reprocessing_request-requests.csv. | one named click, even in Auto (`binding_send`) |
| `thyme_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `thyme_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `thyme_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `thyme_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `payer_portal_submit` | Thyme never logs in to payer portals or files requests; a person sends the approved draft. | refused |
| `payment_post` | Thyme never posts payments or adjustments. | refused |

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

### Fee schedule (`fees`, `medicare_fees`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `payer` | text | Payer, Payer Name, Insurance, Plan, Carrier, Payor | Kostenträger, Payeur, 保険者, 付款方 |
| `code` (required) | text | CPT, CPT Code, HCPCS, Code, Procedure, Procedure Code | - |
| `modifier` | text | Modifier, Mod, Modifier 1 | - |
| `fee` (required) | amount | Fee, Allowed, Allowable, Rate, Contract Rate, Contracted Amount | - |
| `effective_from` | date | Effective, Effective Date, Start Date, From | - |
| `effective_to` | date | End Date, Termination Date, To, Expires | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx thyme-of-underpayments inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

thyme-of-underpayments can remember facts about your setup so the next run does not have to be told again. `thyme_learn` only proposes a fact; it changes nothing until a named person accepts it with `thyme_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `contract_fee` | prices that code for that payer when the fee file has no row for it, so the line is checked instead of skipped. A fee-file row always wins. |
| `note` | nothing (shown by recall only) |

```bash
thyme-of-underpayments memory list
thyme-of-underpayments memory accept MEM-1a2b3c4d5e6f --as "Your Name"
thyme-of-underpayments memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y thyme-of-underpayments demo
npx -y thyme-of-underpayments mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "thyme-of-underpayments": {
      "command": "npx",
      "args": [
        "-y",
        "thyme-of-underpayments",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add thyme-of-underpayments -- npx -y thyme-of-underpayments mcp --root .`, or install the `thyme-of-underpayments` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `thyme-of-underpayments approve <id> --as "Your Name"` (or on the local approvals page, `thyme-of-underpayments approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`thyme-of-underpayments kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
thyme-of-underpayments tools                 # every tool, its policy and arguments
thyme-of-underpayments sources               # the columns each input is read from
thyme-of-underpayments inspect <file>        # how a file would be read (names and shapes, never values)
thyme-of-underpayments call thyme_check '{"remits":"<remits>","contract":"<contract>"}'
thyme-of-underpayments eval                  # the private eval cases on the fictional fixtures
thyme-of-underpayments demo
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
