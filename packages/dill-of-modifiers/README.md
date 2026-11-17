# Dill of Modifiers (`dill-of-modifiers`)

Checks the modifiers on each claim line before it goes out: missing 25 on an E/M with a procedure, 25 or 57 on the wrong code, conflicting pairs, 59 with X modifiers, missing laterality, bilateral units, repeat modifiers with no first service, payment modifiers out of order, too many modifiers, and payer rules. Patient identifiers are masked before results reach the model.

**Dill never adds or removes modifiers; a coder decides from the note. Dill never submits claims.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y dill-of-modifiers demo
npx -y dill-of-modifiers mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y dill-of-modifiers demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Dill of Modifiers demo (fictional practice, payers and patients) in <demo folder>

▶ Check modifiers on an 837 batch
  status: executed  decision: allow
  10 claim(s), 13 line(s): 2 clean; 4 error(s), 6 warning(s). needs_laterality 1, conflicting_pair 1, wrong_code_25 1, payer_not_accepted 1, em_needs_25 1, distinct_redundant 1, repeat_without_first 1, bilateral_units 1, pricing_order 1, unknown_modifier 1.
    error    needs_laterality       D1002 line 2  20610 has no side or digit modifier.
    error    conflicting_pair       D1004 line 1  LT and RT on the same line.
    error    wrong_code_25          D1005 line 1  25 on 11102, which is not an E/M code.
    error    payer_not_accepted     D1006 line 1  DEMO MEDICAID PLAN does not accept 59: use XE, XS, XP or XU instead
    warning  em_needs_25            D1002 line 1  E/M 99214 with 20610 on the same day and no 25.
    warning  distinct_redundant     D1004 line 1  59 with XS.
    warning  repeat_without_first   D1007 line 1  91 on 85025 but no other 85025 on 2026-02-05.
    warning  bilateral_units        D1008 line 1  50 with 2 units.
    warning  pricing_order          D1009 line 1  26 (payment) comes after RT (informational).
    warning  unknown_modifier       D1010 line 1  ZZ is not in the table.

▶ Look up XS
  status: executed  decision: allow
  XS: Separate structure or organ (informational).

▶ Write the coder's list (Japanese page)
  status: executed  decision: allow
  Modifier work list written: 10 claim(s), 13 line(s): 2 clean; 4 error(s), 6 warning(s). needs_laterality 1, conflicting_pair 1, wrong_code_25 1, payer_not_accepted 1, em_needs_25 1, distinct_redundant 1, repeat_without_first 1, bilateral_units 1, pricing_order 1, unknown_modifier 1. Files: remedy-out/dill/dill-modifiers.csv, remedy-out/dill/dill-modifiers.html.

▶ Agent tries to add a modifier itself
  status: blocked  decision: block
  reason: Dill never adds or removes modifiers; a coder decides from the note.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `dill_check` | One row per issue: claim, line, code, modifiers, check, severity, message and fix. | runs |
| `dill_modifier` | What a modifier means in Dill's short table (paraphrased, not the official descriptor) and whether it changes payment or is informational. | runs |
| `dill_explain` | All modifier issues on one claim with the fixes. | runs |
| `dill_write_report` | Write dill-modifiers.csv (one row per issue with blank coder and decision columns) and dill-modifiers.html into out_dir (default remedy-out/dill). | runs |
| `dill_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `dill_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `dill_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `dill_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `modifier_append` | Dill never adds or removes modifiers; a coder decides from the note. | refused |
| `claim_submit` | Dill never submits claims. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Claims (837 or charge export) (`claims`)

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
| Tebra (Kareo) | Charges detail report (CSV) | Encounter ID, Procedure Code, Service Date, Primary Insurance | no |
| AdvancedMD | Charge detail report (CSV) | Visit ID, Proc Code, Date of Service, Primary Carrier | no |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates and the pfs.data.cms.gov column lists). The NCCI, MUE and RVU file headers and every practice-management and clearinghouse layout were written from knowledge of the export and were not checked. None was tested against a live account.

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx dill-of-modifiers inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

dill-of-modifiers can remember facts about your setup so the next run does not have to be told again. `dill_learn` only proposes a fact; it changes nothing until a named person accepts it with `dill_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_modifier_rule` | adds this rule to the checks for that payer. It only adds checks; it never clears an issue the built-in checks find. |
| `note` | nothing (shown by recall only) |

```bash
dill-of-modifiers memory list
dill-of-modifiers memory accept MEM-1a2b3c4d5e6f --as "Your Name"
dill-of-modifiers memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y dill-of-modifiers demo
npx -y dill-of-modifiers mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "dill-of-modifiers": {
      "command": "npx",
      "args": [
        "-y",
        "dill-of-modifiers",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add dill-of-modifiers -- npx -y dill-of-modifiers mcp --root .`, or install the `dill-of-modifiers` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `dill-of-modifiers approve <id> --as "Your Name"` (or on the local approvals page, `dill-of-modifiers approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`dill-of-modifiers kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
dill-of-modifiers tools                 # every tool, its policy and arguments
dill-of-modifiers sources               # the columns each input is read from
dill-of-modifiers inspect <file>        # how a file would be read (names and shapes, never values)
dill-of-modifiers call dill_check '{"claims":"<claims>"}'
dill-of-modifiers eval                  # the private eval cases on the fictional fixtures
dill-of-modifiers demo
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
