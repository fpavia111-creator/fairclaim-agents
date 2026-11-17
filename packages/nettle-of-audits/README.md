# Nettle of Audits (`nettle-of-audits`)

Coding audits without the spreadsheet: draws a reproducible random sample of charges per provider (plus focus codes), writes the auditor's worksheet, then scores the results line by line (agree, upcoded, downcoded, wrong code, modifier or diagnosis error, not supported) with accuracy, dollar impact and next steps by provider. Patient identifiers are masked before results reach the model.

**Nettle never changes or resubmits a claim; the coder does, from the record. Nettle never sends refunds; tansy-of-credits drafts one for a person to approve.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y nettle-of-audits demo
npx -y nettle-of-audits mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y nettle-of-audits demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Nettle of Audits demo (fictional practice and patients) in <demo folder>

▶ Draw the Q1 sample (same seed, same lines)
  status: executed  decision: allow
  Seed "q1-2026": 20 line(s) sampled from 32 in the period, across 3 provider(s); 5 focus line(s) added.

▶ Write the auditor worksheet
  status: executed  decision: allow
  Auditor worksheet written. Seed "q1-2026": 20 line(s) sampled from 32 in the period, across 3 provider(s); 5 focus line(s) added. Files: remedy-out/nettle/nettle-worksheet.csv, remedy-out/nettle/nettle-worksheet.html.

▶ Score the filled-in worksheet
  status: executed  decision: allow
  25 line(s) audited: accuracy 64% (target 90%). not_supported 1, upcoded 4, wrong_code 1, downcoded 1, modifier_error 1, dx_error 1. Billed over what the record supports: 455; under: 55. Focused review: Felix Brandt DO (fictional) 40%, Alma Reyes MD (fictional) 81.82%.
        40%  Felix Brandt DO (fictional)  Accuracy 40% is below your 90% target: review the errors with the provider, then audit 10 new lines in 30 to 90 days. Most E/M errors are levels higher than the notes support.
        75%  Ines Moreau NP (fictional)   Only 4 line(s) audited; 10 are needed before the accuracy means much. Audit 6 more.
     81.82%  Alma Reyes MD (fictional)    Accuracy 81.82% is below your 90% target: review the errors with the provider, then audit 10 new lines in 30 to 90 days.

▶ Write the results
  status: executed  decision: allow
  Audit results written: 25 line(s) audited: accuracy 64% (target 90%). not_supported 1, upcoded 4, wrong_code 1, downcoded 1, modifier_error 1, dx_error 1. Billed over what the record supports: 455; under: 55. Focused review: Felix Brandt DO (fictional) 40%, Alma Reyes MD (fictional) 81.82%. Files: remedy-out/nettle/nettle-audit.csv, remedy-out/nettle/nettle-audit.html.

▶ Agent tries to send a refund
  status: blocked  decision: block
  reason: Nettle never sends refunds; tansy-of-credits drafts one for a person to approve.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `nettle_sample` | Pick random lines per provider from the charges with a seed (same seed, same sample), add every line with a focus code, and list them with the provider's line count in the period. | runs |
| `nettle_write_sample` | Write nettle-worksheet.csv (one row per sampled line with blank audited code, modifiers, diagnoses, amount, paid and note columns; nettle_score reads it back as it is) and nettle-worksheet.html into out_dir (default r… | runs |
| `nettle_score` | Classify each audited line (not_supported, upcoded, wrong_code, downcoded, modifier_error, dx_error, agree) with the dollar impact, and give each provider's accuracy, error mix, pattern and next step. | runs |
| `nettle_explain` | Show every audited line of one claim with its outcome, what the record supports, the dollar impact and the auditor's note. | runs |
| `nettle_write_report` | Write nettle-audit.csv (one row per audited line with blank education and recheck columns) and nettle-audit.html (with accuracy and next step by provider) into out_dir (default remedy-out/nettle). | runs |
| `nettle_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `nettle_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `nettle_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `nettle_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `claim_correct` | Nettle never changes or resubmits a claim; the coder does, from the record. | refused |
| `refund_send` | Nettle never sends refunds; tansy-of-credits drafts one for a person to approve. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Charges (837 or charge export) (`charges`)

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

Named exports recognised by their column names:

| System | Export | Recognised by | Layout checked against vendor docs |
|---|---|---|---|
| Tebra (Kareo) | Charges detail report (CSV) | Encounter ID, Procedure Code, Service Date, Primary Insurance | no; Tebra help (Encounters Detail Report, read 2026-11-17) confirms Encounter ID as the first column and lists service date, procedure, modifiers and diagnoses, but publishes no exact header text |
| AdvancedMD | Charge detail report (CSV) | Visit ID, Proc Code, Date of Service, Primary Carrier | no |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates, the pfs.data.cms.gov column lists and Open Dental's published procedure log fields). The NCCI, MUE and RVU file headers and the other practice-management and clearinghouse layouts were written from knowledge of the export and were not checked; where the vendor's public help says something about the export, the layout's note says what. None was tested against a live account.

### Audit results (`results`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `claim_id` (required) | text | Claim ID, Claim, Encounter ID, Visit ID, Claim Number | - |
| `line` | number | Line, Line No, Line Number | - |
| `patient_name` | text (masked) | Patient, Patient Name | Patient, Patient, 患者名, 患者 |
| `provider` | text | Provider, Rendering Provider, Clinician | Leistungserbringer, Prestataire, 医師, 医生 |
| `payer` | text | Payer, Insurance, Primary Insurance | Kostenträger, Payeur, 保険者, 付款方 |
| `date_of_service` | date | Date of Service, DOS, Service Date | - |
| `billed_code` (required) | text | Billed Code, Billed CPT, Submitted Code, Coded CPT, CPT Billed, Provider Code | - |
| `billed_modifiers` | text | Billed Modifiers, Billed Modifier, Submitted Modifiers | - |
| `billed_dx` | text | Billed Dx, Billed Diagnosis, Billed ICD-10, Submitted Dx | - |
| `billed_amount` | amount | Billed Amount, Charge, Billed Charge, Expected Payment Billed | - |
| `audited_code` | text | Audited Code, Audited CPT, Auditor Code, Correct Code, Supported Code, Auditor CPT | - |
| `audited_modifiers` | text | Audited Modifiers, Auditor Modifiers, Correct Modifiers | - |
| `audited_dx` | text | Audited Dx, Auditor Dx, Correct Diagnosis, Audited ICD-10 | - |
| `audited_amount` | amount | Audited Amount, Supported Amount, Corrected Charge, Expected Amount | - |
| `paid` | text | Paid, Claim Paid, Paid Y/N | Bezahlt, Payé, 支払額, 已付 |
| `note` | text | Note, Auditor Note, Comments, Rationale, Finding | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx nettle-of-audits inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

nettle-of-audits can remember facts about your setup so the next run does not have to be told again. `nettle_learn` only proposes a fact; it changes nothing until a named person accepts it with `nettle_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `focus_code` | adds every line with those codes to the sample, beside the random lines. It only adds lines; it never removes one. |
| `note` | nothing (shown by recall only) |

```bash
nettle-of-audits memory list
nettle-of-audits memory accept MEM-1a2b3c4d5e6f --as "Your Name"
nettle-of-audits memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y nettle-of-audits demo
npx -y nettle-of-audits mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "nettle-of-audits": {
      "command": "npx",
      "args": [
        "-y",
        "nettle-of-audits",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add nettle-of-audits -- npx -y nettle-of-audits mcp --root .`, or install the `nettle-of-audits` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `nettle-of-audits approve <id> --as "Your Name"` (or on the local approvals page, `nettle-of-audits approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`nettle-of-audits kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
nettle-of-audits tools                 # every tool, its policy and arguments
nettle-of-audits sources               # the columns each input is read from
nettle-of-audits inspect <file>        # how a file would be read (names and shapes, never values)
nettle-of-audits call nettle_sample '{"charges":"<charges>"}'
nettle-of-audits eval                  # the private eval cases on the fictional fixtures
nettle-of-audits demo
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
