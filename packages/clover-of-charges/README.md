# Clover of Charges (`clover-of-charges`)

Matches completed visits to charges: finds visits with no charge, charges with no visit or on a cancelled one, late charge entry, visit types missing their expected codes, and each provider's E/M level mix against peers. Patient identifiers are masked before results reach the model.

**Clover never enters or changes charges; the coder or provider does. Clover never signs or closes clinical notes.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y clover-of-charges demo
npx -y clover-of-charges mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y clover-of-charges demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Clover of Charges demo (fictional practice, providers and patients) in <demo folder>

▶ Match completed visits to charges
  status: executed  decision: allow
  17 visit(s) and 16 charge(s): 5 need action (missing_charge 1, charge_on_cancelled 1, charge_without_visit 1, expected_code_missing 1, late_entry 1). Median days from visit to billing: 1. E/M mix differs from peers for: Alma Reyes MD (fictional), Felix Brandt DO (fictional).
    missing_charge         V103   Visit completed 7 day(s) ago with no charge.
    charge_on_cancelled    V105   Visit is "No Show" but claim V105 charges 150.
    charge_without_visit   W900   Claim W900 has no visit on the schedule for 2026-02-04.
    expected_code_missing  V102   Visit type "Injection" usually bills 20610 or J*; the charge has 99214. Injection visits bill the procedure and usually the drug.
    late_entry             V106   Charge billed 8 day(s) after the visit (target 3).
    pending                V104   Visit completed 1 day(s) ago; charge not entered yet (within 3 days).

▶ Compare E/M level mix by provider
  status: executed  decision: allow
  3 provider(s) with E/M lines. Differs from peers: Alma Reyes MD (fictional) 66.67% vs 14.29%; Felix Brandt DO (fictional) 16.67% vs 60%. A difference is a reason to review notes, not a finding.

▶ Write the list (Portuguese page)
  status: executed  decision: allow
  Charge capture list written: 17 visit(s) and 16 charge(s): 5 need action (missing_charge 1, charge_on_cancelled 1, charge_without_visit 1, expected_code_missing 1, late_entry 1). Median days from visit to billing: 1. E/M mix differs from peers for: Alma Reyes MD (fictional), Felix Brandt DO (fictional). Files: remedy-out/clover/clover-charges.csv, remedy-out/clover/clover-charges.html.

▶ Agent tries to enter a charge itself
  status: blocked  decision: block
  reason: Clover never enters or changes charges; the coder or provider does.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `clover_reconcile` | Every completed or cancelled visit and every charge with a status (missing_charge, pending, charge_on_cancelled, charge_without_visit, expected_code_missing, late_entry, matched), the message and the fix. | runs |
| `clover_em_mix` | For each provider: E/M lines by level, the share at level 4 and 5, the share for peers, and whether the gap is large enough to review a sample of notes. | runs |
| `clover_explain` | Show one row by appointment id or claim id with its codes, charge, days since the visit and why it got its status. | runs |
| `clover_write_report` | Write clover-charges.csv (one row per visit or charge with blank owner and decision columns) and clover-charges.html (with the E/M mix by provider) into out_dir (default remedy-out/clover). | runs |
| `clover_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `clover_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `clover_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `clover_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `charge_post` | Clover never enters or changes charges; the coder or provider does. | refused |
| `note_sign` | Clover never signs or closes clinical notes. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Appointments (`appointments`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `appointment_id` (required) | text | Appointment ID, Appt ID, Visit ID, Encounter ID, Appointment #, Appt # | - |
| `patient_name` | text (masked) | Patient, Patient Name, Pt Name | Patient, Patient, 患者名, 患者 |
| `mrn` | text (masked) | MRN, Chart Number, Chart #, Patient ID | - |
| `account` | text (masked) | Account Number, Patient Account, Acct # | - |
| `date` | date | Appointment Date, Date, Visit Date, Appt Date, DOS, Date of Service | Datum, Date, 日付, 日期 |
| `time` | text | Time, Appointment Time, Start Time, Appt Time | - |
| `provider` | text | Provider, Resource, Rendering Provider, Provider Name, Doctor, Clinician | Leistungserbringer, Prestataire, 医師, 医生 |
| `status` | text | Status, Appointment Status, Visit Status, Appt Status | Status, Statut, ステータス, 状态 |
| `type` | text | Appointment Type, Visit Type, Type, Reason, Appt Type | Typ, Type, 種類, 类型 |
| `payer` | text | Payer, Insurance, Primary Insurance, Carrier | Kostenträger, Payeur, 保険者, 付款方 |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insurance ID | - |
| `location` | text | Location, Facility, Department, Office, Site | Lagerort, Emplacement, 保管場所, 库位 |
| `claim_id` | text | Claim ID, Encounter Claim, Claim Number | - |

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
| Tebra (Kareo) | Charges detail report (CSV) | Encounter ID, Procedure Code, Service Date, Primary Insurance | no |
| AdvancedMD | Charge detail report (CSV) | Visit ID, Proc Code, Date of Service, Primary Carrier | no |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates and the pfs.data.cms.gov column lists). The NCCI, MUE and RVU file headers and every practice-management and clearinghouse layout were written from knowledge of the export and were not checked. None was tested against a live account.

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx clover-of-charges inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

clover-of-charges can remember facts about your setup so the next run does not have to be told again. `clover_learn` only proposes a fact; it changes nothing until a named person accepts it with `clover_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `visit_type_code` | flags matching visits whose charge has none of the codes. It only adds a check; it never marks a charge as complete. |
| `note` | nothing (shown by recall only) |

```bash
clover-of-charges memory list
clover-of-charges memory accept MEM-1a2b3c4d5e6f --as "Your Name"
clover-of-charges memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y clover-of-charges demo
npx -y clover-of-charges mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "clover-of-charges": {
      "command": "npx",
      "args": [
        "-y",
        "clover-of-charges",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add clover-of-charges -- npx -y clover-of-charges mcp --root .`, or install the `clover-of-charges` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `clover-of-charges approve <id> --as "Your Name"` (or on the local approvals page, `clover-of-charges approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`clover-of-charges kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
clover-of-charges tools                 # every tool, its policy and arguments
clover-of-charges sources               # the columns each input is read from
clover-of-charges inspect <file>        # how a file would be read (names and shapes, never values)
clover-of-charges call clover_reconcile '{"appointments":"<appointments>","charges":"<charges>"}'
clover-of-charges eval                  # the private eval cases on the fictional fixtures
clover-of-charges demo
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
