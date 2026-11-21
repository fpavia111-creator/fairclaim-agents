# Fairclaim Payer Scorecards (`fairclaim-payer-scorecards`)

Scores each payer from your 835s and claim submissions: days to pay, denial rate and top denial reasons, share of billed paid, reversals, and a month-by-month trend, against your targets. Patient identifiers are masked before results reach the model.

**Fairclaim Payer Scorecards never files complaints with payers or regulators; a person decides and files.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-payer-scorecards demo
npx -y fairclaim-payer-scorecards mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-payer-scorecards demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Payer Scorecards demo (fictional payers, claims and patients) in <demo folder>

▶ Score payers against targets
  status: executed  decision: allow
  3 payer(s), 26 claim(s): 23.08% had a denial; median 32.5 days to pay. Sample Mutual Insurance: slow, high_denials, low_paid_percent, reversals; Demo Medicaid Plan: slow, high_denials, low_paid_percent
    Sample Mutual Insurance    denials    25%  median    34 days  paid 50% of billed
    Demo Medicaid Plan         denials  37.5%  median  59.5 days  paid 41.67% of billed
    Example Health Plan        denials    10%  median  16.5 days  paid 60% of billed

▶ One payer in detail
  status: executed  decision: allow
  Demo Medicaid Plan: 8 claim(s), 37.5% with a denial, median 59.5 days to pay, 41.67% of billed paid. Median 59.5 days to pay; target 45. 37.5% of claims had a denial; target 15%. Paid 41.67% of billed; target 55%.

▶ Write the scorecard (Chinese page)
  status: executed  decision: allow
  Payer scorecard written: 3 payer(s), 26 claim(s): 23.08% had a denial; median 32.5 days to pay. Sample Mutual Insurance: slow, high_denials, low_paid_percent, reversals; Demo Medicaid Plan: slow, high_denials, low_paid_percent Files: remedy-out/payers/payers.csv, remedy-out/payers/payers.html.

▶ Agent tries to file a complaint with a payer
  status: blocked  decision: block
  reason: Fairclaim Payer Scorecards never files complaints with payers or regulators; a person decides and files.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `payers_scorecard` | Per payer: claims, billed, paid, percent of billed paid, denial rate, top denial categories, median and average days to pay, share paid within 30 days, reversals, flags against targets, and a month-by-month trend. | runs |
| `payers_payer` | The scorecard for one payer and its claims with days to pay and denial categories, slowest first. | runs |
| `payers_write_report` | Write payers.csv (one row per payer with blank owner and action columns) and payers.html (with the month-by-month trend) into out_dir (default remedy-out/payers). | runs |
| `payers_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `payers_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `payers_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `payers_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `payer_complaint_file` | Fairclaim Payer Scorecards never files complaints with payers or regulators; a person decides and files. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Remittances (835 or payment export) (`remits`)

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

### Claims with submitted dates (`claims`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `claim_id` (required) | text | Claim ID, Claim Number, Claim #, Claim No, Patient Control Number, Encounter ID | - |
| `line` | number | Line, Line Number, Line #, Service Line, Line No | - |
| `patient_name` | text (masked) | Patient, Patient Name, Patient Full Name, Pt Name, Patient (Last, First) | Patient, Patient, 患者名, 患者 |
| `patient_first` | text (masked) | Patient First Name, First Name, Patient First | - |
| `patient_last` | text (masked) | Patient Last Name, Last Name, Patient Last | - |
| `patient_dob` | date (masked) | DOB, Date of Birth, Patient DOB, Birth Date, Birthdate | Geburtsdatum, Date de naissance, 生年月日, 出生日期 |
| `patient_gender` | text | Gender, Sex, Patient Sex, Patient Gender | - |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insured ID, Policy Number, Policy #, Insurance ID | - |
| `account` | text (masked) | Account Number, Patient Account, Acct #, Account #, Account No, Patient Acct | - |
| `mrn` | text (masked) | MRN, Chart Number, Chart #, Medical Record Number, Chart No | - |
| `payer` | text | Payer, Payer Name, Insurance, Primary Insurance, Insurance Company, Insurance Name | Kostenträger, Payeur, 保険者, 付款方 |
| `payer_id` | text | Payer ID, Payor ID, Electronic Payer ID, EDI Payer ID, Insurance Payer ID | - |
| `filing_indicator` | text | Financial Class, Claim Filing Indicator, Insurance Type, Plan Type, Fin Class | - |
| `billing_npi` | text | Billing NPI, Group NPI, Billing Provider NPI, Practice NPI | - |
| `rendering_npi` | text | Rendering NPI, Provider NPI, Rendering Provider NPI, NPI, Servicing NPI | - |
| `referring_npi` | text | Referring NPI, Referring Provider NPI, Ordering NPI | - |
| `provider` | text | Provider, Rendering Provider, Provider Name, Physician, Doctor, Clinician | Leistungserbringer, Prestataire, 医師, 医生 |
| `pos` | text | POS, Place of Service, Place Of Service Code, POS Code | - |
| `facility_code` | text | Bill Type, Type of Bill, TOB, Facility Type | - |
| `frequency` | text | Frequency, Claim Frequency, Frequency Code, Resubmission Code, Claim Frequency Code | - |
| `date_of_service` | date | DOS, Date of Service, Service Date, From Date, Service From, Visit Date | Leistungsdatum, Date de soins, 診療日, 服务日期 |
| `date_to` | date | To Date, Service To, DOS To, Thru Date, Through Date | - |
| `code` | text | CPT, CPT Code, Procedure, Procedure Code, HCPCS, CPT/HCPCS | - |
| `modifiers` | text | Modifiers, Modifier, Mod, Mods | - |
| `modifier_1` | text | Modifier 1, Mod 1, Modifier1, Mod1, M1 | - |
| `modifier_2` | text | Modifier 2, Mod 2, Modifier2, Mod2, M2 | - |
| `modifier_3` | text | Modifier 3, Mod 3, Modifier3, Mod3, M3 | - |
| `modifier_4` | text | Modifier 4, Mod 4, Modifier4, Mod4, M4 | - |
| `units` | number | Units, Qty, Quantity, Days/Units, Service Units, Days or Units | Anzahl, Quantité, 回数, 数量 |
| `charge` | amount | Charge, Charges, Charge Amount, Billed, Billed Amount, Line Charge | Betrag, Montant, 請求額, 金额 |
| `total_charge` | amount | Total Charge, Claim Total, Total Billed, Claim Charge, Total Charges, Claim Amount | - |
| `diagnoses` | text | Diagnoses, Diagnosis Codes, ICD-10 Codes, ICD10 Codes, Dx Codes, ICD Codes | - |
| `dx_1` | text | Dx 1, Diagnosis 1, ICD 1, Primary Diagnosis, Dx1, ICD-10 1 | - |
| `dx_2` | text | Dx 2, Diagnosis 2, ICD 2, Dx2, ICD-10 2, Diag 2 | - |
| `dx_3` | text | Dx 3, Diagnosis 3, ICD 3, Dx3, ICD-10 3, Diag 3 | - |
| `dx_4` | text | Dx 4, Diagnosis 4, ICD 4, Dx4, ICD-10 4, Diag 4 | - |
| `dx_pointer` | text | Dx Pointer, Diagnosis Pointer, Pointer, Dx Ptr, Diag Pointer | - |
| `prior_auth` | text | Prior Auth, Authorization, Auth Number, Auth #, Prior Authorization Number, Authorization Number | - |
| `referral` | text | Referral, Referral Number, Referral # | - |
| `original_ref` | text | Original Claim Number, Original Reference, Original ICN, Original Claim ID, Replaces Claim | - |
| `revenue_code` | text | Revenue Code, Rev Code, UB Rev Code, Rev | - |
| `tooth` | text | Tooth, Tooth Number, Tooth #, Tooth No | - |
| `surfaces` | text | Surface, Surfaces, Tooth Surface | - |
| `quadrant` | text | Quadrant, Area of Oral Cavity, Arch, Oral Cavity | - |
| `clia` | text | CLIA, CLIA Number, CLIA # | - |
| `submitted_date` | date | Submitted, Submit Date, Date Submitted, Billed Date, First Billed, Claim Date | - |
| `status` | text | Status, Claim Status, Current Status | Status, Statut, ステータス, 状态 |
| `minutes` | number | Minutes, Anesthesia Minutes, Time (min), Anesthesia Time, Total Minutes | - |
| `start_time` | date and time | Start Time, Anesthesia Start, Start, Time In | - |
| `end_time` | date and time | End Time, Anesthesia End, End, Time Out | - |
| `balance` | amount | Balance, Claim Balance, Open Balance, Outstanding, Insurance Balance, Ins Balance | Saldo, Solde, 残高, 余额 |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-payer-scorecards inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-payer-scorecards can remember facts about your setup so the next run does not have to be told again. `payers_learn` only proposes a fact; it changes nothing until a named person accepts it with `payers_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_target` | uses this target when it is stricter than the config's. It only adds flags; it never loosens a target. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-payer-scorecards memory list
fairclaim-payer-scorecards memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-payer-scorecards memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-payer-scorecards demo
npx -y fairclaim-payer-scorecards mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-payer-scorecards": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-payer-scorecards",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-payer-scorecards -- npx -y fairclaim-payer-scorecards mcp --root .`, or install the `fairclaim-payer-scorecards` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-payer-scorecards approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-payer-scorecards approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-payer-scorecards kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-payer-scorecards tools                 # every tool, its policy and arguments
fairclaim-payer-scorecards sources               # the columns each input is read from
fairclaim-payer-scorecards inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-payer-scorecards call payers_scorecard '{"remits":"<remits>"}'
fairclaim-payer-scorecards eval                  # the private eval cases on the fictional fixtures
fairclaim-payer-scorecards demo
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
