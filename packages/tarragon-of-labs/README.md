# Tarragon of Labs (`tarragon-of-labs`)

Lab claims that get paid: checks the CLIA number and certificate (QW on waived tests, nothing outside a waiver), finds panel components billed one by one or beside their panel, venipuncture more than once a day, repeats without 91, diagnoses that do not support a test under your rules, and tests repeated more often than your limits. Patient identifiers are masked before results reach the model.

**Tarragon never sends claims; the lab does, after fixing them. Tarragon never touches test results.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y tarragon-of-labs demo
npx -y tarragon-of-labs mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y tarragon-of-labs demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Tarragon of Labs demo (fictional lab and patients) in <demo folder>

▶ Check February lab claims
  status: executed  decision: allow
  8 lab claim(s): 6 with errors, 0 with warnings. clia 2, diagnosis 1, frequency 1, qw 1, venipuncture 1, unbundled_panel 1, panel_component 1, repeat 1.
    error    L8002 83036 36415                                      Lab tests need the lab's CLIA number on the claim (box 23 or loop 2300 REF*X4). 83036: none of the diagnoses (Z00.00) is on your list for this test (E08, E09, E10, E11, E13, O24, R73): example rule for testing, not a payer policy. Check the order, or get an ABN before the test when the patient has Medicare. 83036 was also done on 2025-12-10: your rule is 1 per 3 months (example limit for testing).
    error    L8003 87880 36415                                      87880 is a waived test: add QW. 36415 is billed 2 times on 2026-02-10: venipuncture is paid once per patient per day.
    error    L8004 82310 82374 82435 82565 82947 84132 84295 84520  Every component of 80048 (Basic metabolic panel (calcium, total)) is billed separately on 2026-02-10: bill 80048.
    error    L8005 80061 82465                                      82465 is part of 80061 (Lipid panel), billed the same day.
    error    L8006 85025 85025                                      85025 is billed more than once on 2026-02-10: add 91 when a test is repeated on the same day for a clinical reason, or remove the duplicate.
    error    L8007 81002                                            CLIA "2D12345" is not two digits, D, and seven digits.
    ok       L8001 80053 84443 36415                                
    ok       L8008 85018-QW                                         

▶ Same claims for a lab with a certificate of waiver
  status: executed  decision: allow
  8 lab claim(s): 7 with errors, 0 with warnings. certificate 5, clia 2, diagnosis 1, frequency 1, qw 1, venipuncture 1, unbundled_panel 1, panel_component 1, repeat 1.

▶ Write the list
  status: executed  decision: allow
  Lab claim list written: 8 lab claim(s): 6 with errors, 0 with warnings. clia 2, diagnosis 1, frequency 1, qw 1, venipuncture 1, unbundled_panel 1, panel_component 1, repeat 1. Files: remedy-out/tarragon/tarragon-labs.csv, remedy-out/tarragon/tarragon-labs.html.

▶ Agent tries to release results
  status: blocked  decision: block
  reason: Tarragon never touches test results.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `tarragon_check` | Every claim with lab tests or venipuncture, its codes and diagnoses, status (error, warning, ok) and issues: clia, qw, certificate, repeat, venipuncture, panel_component, unbundled_panel, diagnosis, frequency. | runs |
| `tarragon_explain` | One claim with its CLIA, codes, diagnoses and each issue in plain words. | runs |
| `tarragon_panels` | The panels Tarragon checks (built-in metabolic, lipid and hepatic panels plus any in the config) with their component codes. | runs |
| `tarragon_write_report` | Write tarragon-labs.csv (one row per issue with blank owner and fixed columns) and tarragon-labs.html (with counts by check) into out_dir (default remedy-out/tarragon). | runs |
| `tarragon_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `tarragon_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `tarragon_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `tarragon_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `claim_submit` | Tarragon never sends claims; the lab does, after fixing them. | refused |
| `result_release` | Tarragon never touches test results. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Lab claims (837P or claim export) (`claims`)

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

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates, the pfs.data.cms.gov column lists and Open Dental's published procedure log fields). The NCCI, MUE and RVU file headers and the other practice-management and clearinghouse layouts were written from knowledge of the export and were not checked; where the vendor's public help says something about the export, the layout's note says what. None was tested against a live account.

### Earlier lab tests (`history`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `patient_name` | text (masked) | Patient, Patient Name | Patient, Patient, 患者名, 患者 |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insurance ID, MBI | - |
| `date_of_service` (required) | date | Date of Service, DOS, Collection Date, Service Date | - |
| `code` (required) | text | CPT, Code, Test Code, Procedure Code | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx tarragon-of-labs inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

tarragon-of-labs can remember facts about your setup so the next run does not have to be told again. `tarragon_learn` only proposes a fact; it changes nothing until a named person accepts it with `tarragon_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `lab_dx_rule` | warns when a claim for that test has none of those diagnoses. It only adds a check. |
| `note` | nothing (shown by recall only) |

```bash
tarragon-of-labs memory list
tarragon-of-labs memory accept MEM-1a2b3c4d5e6f --as "Your Name"
tarragon-of-labs memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y tarragon-of-labs demo
npx -y tarragon-of-labs mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "tarragon-of-labs": {
      "command": "npx",
      "args": [
        "-y",
        "tarragon-of-labs",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add tarragon-of-labs -- npx -y tarragon-of-labs mcp --root .`, or install the `tarragon-of-labs` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `tarragon-of-labs approve <id> --as "Your Name"` (or on the local approvals page, `tarragon-of-labs approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`tarragon-of-labs kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
tarragon-of-labs tools                 # every tool, its policy and arguments
tarragon-of-labs sources               # the columns each input is read from
tarragon-of-labs inspect <file>        # how a file would be read (names and shapes, never values)
tarragon-of-labs call tarragon_check '{"claims":"<claims>"}'
tarragon-of-labs eval                  # the private eval cases on the fictional fixtures
tarragon-of-labs demo
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
