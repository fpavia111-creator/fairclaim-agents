# Fairclaim Dental Claims (`fairclaim-dental-claims`)

Dental claims that go out right: checks CDT codes, Universal tooth numbers, surfaces against the restoration code, anterior and posterior codes, root canal codes against the tooth, quadrants for scaling and root planing, frequency limits against the patient's history, extracted teeth, duplicates, and the attachments payers ask for, from an 837D or a practice export. Patient identifiers are masked before results reach the model.

**Fairclaim Dental Claims never sends claims; the practice does, after fixing them. Fairclaim Dental Claims never changes the clinical chart or tooth numbers.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-dental-claims demo
npx -y fairclaim-dental-claims mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-dental-claims demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Dental Claims demo (fictional dental practice and patients) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-dental-claims-demo-0QOJ8G

▶ Check the 837D against the patients' history
  status: executed  decision: allow
  6 claim(s), 19 line(s): 7 with errors, 3 with warnings, 0 needing attachments. surfaces 2, tooth_type 3, quadrant 1, same_day 2, attachment 3, duplicate 1, extracted 1, frequency 2.
    error    D5001 D2392 #30 MOD  D2392 is a 2-surface code but MOD is 3 surface(s): bill D2393.
    error    D5002 D2331 #14 MO  D2331 is an anterior resin code but tooth 14 is posterior: use D2392.
    error    D5002 D3310 #19  D3310 is root canal therapy for an anterior tooth but 19 is a molar: bill D3330.
    error    D5003 D4342  D4342 needs a quadrant (UR, UL, LL, LR or 10, 20, 30, 40). Scaling and root planing with a prophylaxis on the same day: most plans pay one of them.
    error    D5004 D1351 #3  D1351 on tooth 3 is billed twice on 2026-02-06.
    error    D5005 D2391 #8 O  D2391 is a posterior resin code but tooth 8 is anterior: use D2330. Occlusal (O) on anterior tooth 8: anterior teeth have an incisal (I) edge.
    error    D5005 D2392 #16 MO  Tooth 16 was extracted on 2025-11-03 (D7140).
    warning  D5001 D0274  Bitewing x-rays: 1 per calendar year; already D0274 2026-01-10. The plan may deny: check the patient's benefits (this is a common limit, not this plan's rule).
    warning  D5002 D2740 #19  Crown replacement: 1 per 60 months per tooth; already D2750 2023-06-20. The plan may deny: check the patient's benefits (this is a common limit, not this plan's rule).
    warning  D5003 D4341  Scaling and root planing with a prophylaxis on the same day: most plans pay one of them.

▶ Write the list
  status: executed  decision: allow
  Dental claim list written: 6 claim(s), 19 line(s): 7 with errors, 3 with warnings, 0 needing attachments. surfaces 2, tooth_type 3, quadrant 1, same_day 2, attachment 3, duplicate 1, extracted 1, frequency 2. Files: remedy-out/dental/dental.csv, remedy-out/dental/dental.html.

▶ Agent tries to send the claims
  status: blocked  decision: block
  reason: Fairclaim Dental Claims never sends claims; the practice does, after fixing them.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `dental_check` | Every line with its status (error, warning, attach, ok) and issues: code, tooth, surfaces, tooth_type, quadrant, extracted, duplicate, same_day, frequency, age, attachment. | runs |
| `dental_explain` | Every line of one claim with its tooth, surfaces, quadrant and each issue in plain words. | runs |
| `dental_frequency_rules` | The frequency limits Fairclaim Dental Claims checks: from the config, else the built-in common limits, plus learned payer limits. | runs |
| `dental_write_report` | Write dental.csv (one row per issue with blank owner and fixed columns) and dental.html (with counts by check) into out_dir (default remedy-out/dental). | runs |
| `dental_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `dental_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `dental_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `dental_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `claim_submit` | Fairclaim Dental Claims never sends claims; the practice does, after fixing them. | refused |
| `chart_update` | Fairclaim Dental Claims never changes the clinical chart or tooth numbers. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Dental claims (837D or procedure export) (`claims`)

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
| Open Dental | User query on the procedure log (CSV; database column names) | ProcDate, ProcCode, ToothNum, Surf, ProcFee | against opendental.com/site/apiprocedurelogs.html: procedurelog.ProcDate, ProcFee, ToothNum, Surf, ProcStatus, CodeNum and procedurecode.ProcCode (the full schema pages need a support login) on 2026-11-17 |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates, the pfs.data.cms.gov column lists and Open Dental's published procedure log fields). The NCCI, MUE and RVU file headers and the other practice-management and clearinghouse layouts were written from knowledge of the export and were not checked; where the vendor's public help says something about the export, the layout's note says what. None was tested against a live account.

### Procedure history (`history`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `patient_name` | text (masked) | Patient, Patient Name | Patient, Patient, 患者名, 患者 |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insurance ID | - |
| `patient_dob` | date (masked) | DOB, Birth Date, Date of Birth, Birthdate | - |
| `date_of_service` (required) | date | Date, Date of Service, DOS, Service Date, ProcDate | - |
| `code` (required) | text | Code, CDT, CDT Code, Procedure Code, ProcCode, Proc Code | - |
| `tooth` | text | Tooth, Tooth Number, Tooth #, ToothNum, Th | - |
| `quadrant` | text | Quadrant, Area of Oral Cavity, Quad | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-dental-claims inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-dental-claims can remember facts about your setup so the next run does not have to be told again. `dental_learn` only proposes a fact; it changes nothing until a named person accepts it with `dental_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_frequency` | adds a frequency warning for that payer's claims. It only adds a check; it never removes a built-in or config limit. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-dental-claims memory list
fairclaim-dental-claims memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-dental-claims memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-dental-claims demo
npx -y fairclaim-dental-claims mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-dental-claims": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-dental-claims",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-dental-claims -- npx -y fairclaim-dental-claims mcp --root .`, or install the `fairclaim-dental-claims` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-dental-claims approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-dental-claims approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-dental-claims kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-dental-claims tools                 # every tool, its policy and arguments
fairclaim-dental-claims sources               # the columns each input is read from
fairclaim-dental-claims inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-dental-claims call dental_check '{"claims":"<claims>"}'
fairclaim-dental-claims eval                  # the private eval cases on the fictional fixtures
fairclaim-dental-claims demo
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
