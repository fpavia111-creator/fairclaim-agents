# Fairclaim Anesthesia Claims (`fairclaim-anesthesia-claims`)

Anesthesia claims priced and paired right: computes base, time, physical-status and qualifying-circumstance units per payer, checks start and stop times against reported minutes, checks AA, QK, QY, QX, QZ and AD against how many cases the anesthesiologist covered at once, pairs each CRNA claim with its medical direction, and flags overlapping cases. Patient identifiers are masked before results reach the model.

**Fairclaim Anesthesia Claims never sends claims; the billing team does, after fixing them. Fairclaim Anesthesia Claims never changes anesthesia times in the record; the clinician corrects the record.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-anesthesia-claims demo
npx -y fairclaim-anesthesia-claims mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-anesthesia-claims demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Anesthesia Claims demo (fictional group and patients; illustrative base units) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-anesthesia-claims-demo-npoAi4

▶ Check one operating day
  status: executed  decision: allow
  14 anesthesia claim(s): 6 with errors, 1 with warnings. concurrency 2, time 1, qualifying 1, units 2, pairing 1, overlap 2, physical_status 1.
    error    A7005 01402 QY P2  10:00-12:10 units   16 (billed 16) rooms 2  QY but Ruth Vance MD (fictional) covered at most 2 case(s) at once during this one: use QK.
    error    A7007 00740 QY P2  10:30-11:00 units    7 (billed 7) rooms 2  QY but Ruth Vance MD (fictional) covered at most 2 case(s) at once during this one: use QK.
    error    A7009 00142 QZ P1  13:00-13:45 units    8 (billed 7)  Reported 40 minutes, but 13:00 to 13:45 is 45. 99100 is for patients under 1 or over 70; this patient is 13. Billed 7 unit(s); base 4 + time 3 + physical status and qualifying 1 = 8.
    error    A7010 01967 AA P2  14:00-15:30 units   11 (billed 11) rooms 1  AA (personally performed) but a CRNA billed the same case: medical direction (QK/QY with QX) or QZ applies.
    error    A7011 01967 QZ P2  14:00-15:30 units   11 (billed 11)  Tobi Okoro CRNA (fictional) has overlapping cases: A7012. A CRNA bills one case at a time.
    error    A7012 00840 QZ P2  15:00-16:00 units   10 (billed 10)  Tobi Okoro CRNA (fictional) has overlapping cases: A7011. A CRNA bills one case at a time.
    warning  A7013 00812 AA     16:30-17:10 units    6 (billed 8) rooms 1  No physical status modifier (P1-P6). Billed 8 unit(s); base 3 + time 3 = 6.
    ok       A7001 00790 QK P3  07:30-09:15 units   14 (billed 14) rooms 2  
    ok       A7002 00790 QX P3  07:30-09:15 units   14 (billed 14)  
    ok       A7003 00740 QK P2  08:00-09:00 units    9 (billed 9) rooms 2  
    ok       A7004 00740 QX P2  08:00-09:00 units    9 (billed 9)  
    ok       A7006 01402 QX P2  10:00-12:10 units   16 (billed 16)  
    ok       A7008 00740 QX P2  10:30-11:00 units    7 (billed 7)  
    ok       A7014 00840 AA P2  23:30-00:45 units   11 (billed 11) rooms 1  

▶ Write the list
  status: executed  decision: allow
  Anesthesia list written: 14 anesthesia claim(s): 6 with errors, 1 with warnings. concurrency 2, time 1, qualifying 1, units 2, pairing 1, overlap 2, physical_status 1. Files: remedy-out/anesthesia/anesthesia.csv, remedy-out/anesthesia/anesthesia.html.

▶ Agent tries to edit the anesthesia record
  status: blocked  decision: block
  reason: Fairclaim Anesthesia Claims never changes anesthesia times in the record; the clinician corrects the record.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `anesthesia_check` | Every claim with minutes, base, time and extra units, total units, the expected allowed amount when a conversion factor is set, the peak number of concurrent cases, and issues: code, base_units, time, pricing_modifier… | runs |
| `anesthesia_explain` | One claim with its times, unit arithmetic, modifiers, concurrency and each issue in plain words. | runs |
| `anesthesia_write_report` | Write anesthesia.csv (one row per claim with the unit arithmetic, issues and blank owner and fixed columns) and anesthesia.html (with counts by check) into out_dir (default remedy-out/anesthesia). | runs |
| `anesthesia_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `anesthesia_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `anesthesia_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `anesthesia_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `claim_submit` | Fairclaim Anesthesia Claims never sends claims; the billing team does, after fixing them. | refused |
| `record_edit` | Fairclaim Anesthesia Claims never changes anesthesia times in the record; the clinician corrects the record. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Anesthesia claims (`cases`)

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
| `case_id` | text | Case ID, Case Number, Case #, Anesthesia Case, Encounter Case | - |

### Anesthesia base units (`base_units`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `code` (required) | text | Code, CPT Code, Anesthesia Code, ASA Code, HCPCS | - |
| `base_units` (required) | number | Base Units, Base Unit, Base Unit Value, Base, Anesthesia Base Units | - |
| `description` | text | Description, Descriptor, Short Descriptor | Beschreibung, Description, 摘要, 摘要 |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-anesthesia-claims inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-anesthesia-claims can remember facts about your setup so the next run does not have to be told again. `anesthesia_learn` only proposes a fact; it changes nothing until a named person accepts it with `anesthesia_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_ps_required` | turns a missing P1-P6 for that payer from a warning into an error. It only makes the check stricter. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-anesthesia-claims memory list
fairclaim-anesthesia-claims memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-anesthesia-claims memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-anesthesia-claims demo
npx -y fairclaim-anesthesia-claims mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-anesthesia-claims": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-anesthesia-claims",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-anesthesia-claims -- npx -y fairclaim-anesthesia-claims mcp --root .`, or install the `fairclaim-anesthesia-claims` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-anesthesia-claims approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-anesthesia-claims approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-anesthesia-claims kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-anesthesia-claims tools                 # every tool, its policy and arguments
fairclaim-anesthesia-claims sources               # the columns each input is read from
fairclaim-anesthesia-claims inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-anesthesia-claims call anesthesia_check '{"cases":"<cases>","base_units":"<base_units>"}'
fairclaim-anesthesia-claims eval                  # the private eval cases on the fictional fixtures
fairclaim-anesthesia-claims demo
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
