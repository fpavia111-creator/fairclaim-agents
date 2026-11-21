# Fairclaim NCCI Edits (`fairclaim-ncci-edits`)

Checks claims against the CMS NCCI procedure-to-procedure (PTP) and medically unlikely edit (MUE) files you download, by date of service: modifier indicator 0 and 1, the bypass modifiers, effective and deletion dates, and MUE units per line or per day across claims. Payer pair edits your team accepts are added on top. Patient identifiers are masked before results reach the model.

**Fairclaim NCCI Edits never adds 59, X or 25 modifiers to claims. A coder decides from the record. Fairclaim NCCI Edits never sends claims.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-ncci-edits demo
npx -y fairclaim-ncci-edits mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-ncci-edits demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim NCCI Edits demo (fictional patients, illustrative NCCI rows) in <demo folder>

▶ Check eleven claims against PTP and MUE
  status: executed  decision: allow
  11 claim(s) against 6 PTP pair(s) and 4 MUE code(s): 5 error(s), 3 warning(s), 1035 in charges at risk. ptp_no_modifier 1, ptp_needs_modifier 2, ptp_bypassed 2, mue_day 3
    error    G1006         mue_day             20610: 3 units on 2026-01-14 across 1 claim(s); the MUE is 2 per day (date of service edit, policy: units per day, absolute).
    error    G1007, G1008  mue_day             99213: 2 units on 2026-01-15 across 2 claim(s); the MUE is 1 per day (date of service edit, policy: units per day, absolute).
    error    G1002         ptp_needs_modifier  99214 is bundled into 20610 (NCCI modifier indicator 1) and no bypass modifier is on either line.
    error    G1011         ptp_needs_modifier  99213 is bundled into 20610 (NCCI modifier indicator 1) and no bypass modifier is on either line.
    error    G1003         ptp_no_modifier     93010 is bundled into 93000 (NCCI modifier indicator 0); no modifier makes it payable.
    warning  G1005         mue_day             97110: 6 units on 2026-01-14 across 1 claim(s); the MUE is 4 per day (date of service edit, clinical: units per day, may be exceeded with documentation).
    warning  G1001         ptp_bypassed        99213 with 20610: the edit allows a modifier and 25 is on the claim.
    warning  G1004         ptp_bypassed        97140 with 97530: the edit allows a modifier and 59 is on the claim.

▶ Look up a pair whose edit was deleted
  status: executed  decision: allow
  11042 into 11043: indicator 1 (not in effect on that date)

▶ Write the coder work list (Portuguese page)
  status: executed  decision: allow
  NCCI work list written: 11 claim(s) against 6 PTP pair(s) and 4 MUE code(s): 5 error(s), 3 warning(s), 1035 in charges at risk. ptp_no_modifier 1, ptp_needs_modifier 2, ptp_bypassed 2, mue_day 3 Files: remedy-out/edits/edits-ncci.csv, remedy-out/edits/edits-ncci.html.

▶ Teach a payer pair edit beyond NCCI
  status: executed  decision: allow
  Stored MEM-8b36997ebf93 as waiting. It changes nothing until a named person accepts it with edits_accept_learning (id "MEM-8b36997ebf93", decision "accept").

▶ Agent tries to add modifier 59 itself
  status: blocked  decision: block
  reason: Fairclaim NCCI Edits never adds 59, X or 25 modifiers to claims. A coder decides from the record.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `edits_check` | Find PTP pairs billed on the same date (by modifier indicator, with bypass modifiers and edit dates) and units above MUE (per line for MAI 1, per patient and day for MAI 2 and 3). | runs |
| `edits_lookup` | Show the PTP edits between two codes (either order) with effective and deletion dates, modifier indicator and rationale, and the MUE of each code. | runs |
| `edits_explain` | Show one claim's lines and every NCCI finding on it. | runs |
| `edits_write_report` | Write edits-ncci.csv (one row per finding with blank coder decision columns) and edits-ncci.html into out_dir (default remedy-out/edits). | runs |
| `edits_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `edits_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `edits_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `edits_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `modifier_append` | Fairclaim NCCI Edits never adds 59, X or 25 modifiers to claims. | refused |
| `claim_submit` | Fairclaim NCCI Edits never sends claims. | refused |

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

### NCCI PTP edits (`ptp`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `column_1` (required) | text | Column 1, Column1, Col 1, Column One | - |
| `column_2` (required) | text | Column 2, Column2, Col 2, Column Two | - |
| `effective` | text | Effective Date, Effective, Eff Date | - |
| `deletion` | text | Deletion Date, Deletion Date *=no data, Deleted, Del Date | - |
| `modifier_indicator` | text | Modifier, Modifier Indicator, Modifier 0=not allowed 1=allowed 9=not applicable, Mod Ind | - |
| `rationale` | text | PTP Edit Rationale, Rationale, Edit Rationale | - |

Named exports recognised by their column names:

| System | Export | Recognised by | Layout checked against vendor docs |
|---|---|---|---|
| CMS NCCI | Procedure-to-procedure edits, practitioner file | Column 1, Column 2, Effective Date, Deletion Date or Deletion Date *=no data | no |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates, the pfs.data.cms.gov column lists and Open Dental's published procedure log fields). The NCCI, MUE and RVU file headers and the other practice-management and clearinghouse layouts were written from knowledge of the export and were not checked; where the vendor's public help says something about the export, the layout's note says what. None was tested against a live account.

### NCCI MUE table (`mue`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `code` (required) | text | HCPCS/CPT Code, HCPCS, CPT, Code, HCPCS Code | - |
| `mue` (required) | number | Practitioner Services MUE Values, MUE Value, MUE Values, MUE, Practitioner MUE | - |
| `mai` | text | MUE Adjudication Indicator, MUE Adjudication Indicator (MAI), MAI, Adjudication Indicator | - |
| `rationale` | text | MUE Rationale, Rationale | - |

Named exports recognised by their column names:

| System | Export | Recognised by | Layout checked against vendor docs |
|---|---|---|---|
| CMS NCCI | Medically unlikely edits, practitioner services table | HCPCS/CPT Code, Practitioner Services MUE Values | no |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates, the pfs.data.cms.gov column lists and Open Dental's published procedure log fields). The NCCI, MUE and RVU file headers and the other practice-management and clearinghouse layouts were written from knowledge of the export and were not checked; where the vendor's public help says something about the export, the layout's note says what. None was tested against a live account.

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-ncci-edits inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-ncci-edits can remember facts about your setup so the next run does not have to be told again. `edits_learn` only proposes a fact; it changes nothing until a named person accepts it with `edits_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_pair_edit` | adds an error when that payer's claim has both codes on one date. It only adds edits; it can never switch off an NCCI edit. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-ncci-edits memory list
fairclaim-ncci-edits memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-ncci-edits memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-ncci-edits demo
npx -y fairclaim-ncci-edits mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-ncci-edits": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-ncci-edits",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-ncci-edits -- npx -y fairclaim-ncci-edits mcp --root .`, or install the `fairclaim-ncci-edits` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-ncci-edits approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-ncci-edits approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-ncci-edits kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-ncci-edits tools                 # every tool, its policy and arguments
fairclaim-ncci-edits sources               # the columns each input is read from
fairclaim-ncci-edits inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-ncci-edits call edits_check '{"claims":"<claims>"}'
fairclaim-ncci-edits eval                  # the private eval cases on the fictional fixtures
fairclaim-ncci-edits demo
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
