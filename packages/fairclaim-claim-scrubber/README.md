# Fairclaim Claim Scrubber (`fairclaim-claim-scrubber`)

Scrubs claims before they go out: reads an 837 file or a claim export and lists every error a payer is likely to reject on (NPI check digits, payer and member ids, birth and service dates, totals, units, code and modifier shapes, conflicting modifiers, diagnosis pointers, place of service, corrected-claim references, prior authorizations) with the fix. Patient identifiers are masked before results reach the model.

**Fairclaim Claim Scrubber never sends claims; your billing system or clearinghouse does, after a person releases the batch. Fairclaim Claim Scrubber never changes claims in the practice-management system; a person makes the fix.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-claim-scrubber demo
npx -y fairclaim-claim-scrubber mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-claim-scrubber demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Claim Scrubber demo (fictional practice, payers and patients) in <demo folder>

▶ Scrub a ten-claim 837 batch
  status: executed  decision: allow
  10 claim(s): 3 ready, 7 need fixing (1989 in charges held). 15 error(s), 4 warning(s). Clean claim rate 10%. Most common: rendering_npi 1, member_id 1, diagnosis_format 1.
    fix   C4008   DEMO MEDICAID PLAN         member_id_pattern, patient_dob, code_format, modifier_format
    fix   C4006   SAMPLE MUTUAL INSURANCE    total_mismatch, units, modifier_conflict
    fix   C4002   SAMPLE MUTUAL INSURANCE    rendering_npi, member_id
    fix   C4003   DEMO MEDICAID PLAN         diagnosis_format, pointer_range
    fix   C4004   TEST MEDICARE CONTRACTOR   frequency_ref, future_service
    fix   C4005   EXAMPLE HEALTH PLAN        prior_auth, em_modifier_25
    fix   C4010   DEMO MEDICAID PLAN         late_to_file
    ready C4007   EXAMPLE HEALTH PLAN        pos_unknown, duplicate_line
    ready C4009   EXAMPLE HEALTH PLAN        duplicate_claim
    ready C4001   EXAMPLE HEALTH PLAN        -

▶ Explain claim C4005
  status: executed  decision: allow
  C4005: 1 error(s), 1 warning(s). Example Health Plan needs prior authorization for 20610. line 1 (99214) and line 2 (20610) on 2026-01-14; the E/M has no modifier 25.

▶ Write the work list (French page)
  status: executed  decision: allow
  Scrub work list written: 10 claim(s): 3 ready, 7 need fixing (1989 in charges held). 15 error(s), 4 warning(s). Clean claim rate 10%. Most common: rendering_npi 1, member_id 1, diagnosis_format 1. Files: remedy-out/scrub/scrub.csv, remedy-out/scrub/scrub.html.

▶ Teach a payer rule from a rejection
  status: executed  decision: allow
  Stored MEM-de3302b398a9 as waiting. It changes nothing until a named person accepts it with scrub_accept_learning (id "MEM-de3302b398a9", decision "accept").

▶ Accepting it waits for a named person
  status: needs_approval  decision: ask
  reason: Changing what the agent remembers needs a named person, even in Auto.

▶ Agent tries to send the batch itself
  status: blocked  decision: block
  reason: Fairclaim Claim Scrubber never sends claims; your billing system or clearinghouse does, after a person releases the batch.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `scrub_scrub` | Check every claim and line and return the claims with their findings (error = payer likely rejects, warning = check before sending), each with the field and how to fix it. | runs |
| `scrub_explain` | Show one claim with its lines, diagnoses and every finding, with what each check looks for. | runs |
| `scrub_checks` | List every check Fairclaim Claim Scrubber runs with its severity, field and fix, and the fields a payer rule may require. | runs |
| `scrub_write_report` | Write scrub.csv (one row per finding with blank owner, decision and notes columns) and scrub.html (totals by check and by payer) into out_dir (default remedy-out/scrub). | runs |
| `scrub_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `scrub_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `scrub_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `scrub_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `claim_submit` | Fairclaim Claim Scrubber never sends claims; your billing system or clearinghouse does, after a person releases the batch. | refused |
| `claim_edit_in_pm` | Fairclaim Claim Scrubber never changes claims in the practice-management system; a person makes the fix. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Claims (837 or claim export) (`claims`)

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

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-claim-scrubber inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-claim-scrubber can remember facts about your setup so the next run does not have to be told again. `scrub_learn` only proposes a fact; it changes nothing until a named person accepts it with `scrub_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_required_field` | adds an error to that payer's claims that lack the field (only for the listed codes, when given). It can only add a check, never remove one. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-claim-scrubber memory list
fairclaim-claim-scrubber memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-claim-scrubber memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-claim-scrubber demo
npx -y fairclaim-claim-scrubber mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-claim-scrubber": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-claim-scrubber",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-claim-scrubber -- npx -y fairclaim-claim-scrubber mcp --root .`, or install the `fairclaim-claim-scrubber` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-claim-scrubber approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-claim-scrubber approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-claim-scrubber kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-claim-scrubber tools                 # every tool, its policy and arguments
fairclaim-claim-scrubber sources               # the columns each input is read from
fairclaim-claim-scrubber inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-claim-scrubber call scrub_scrub '{"claims":"<claims>"}'
fairclaim-claim-scrubber eval                  # the private eval cases on the fictional fixtures
fairclaim-claim-scrubber demo
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
