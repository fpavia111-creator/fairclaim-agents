# Fairclaim Practice Go Live (`fairclaim-practice-go-live`)

Go-live readiness for a new practice: checks the billing NPI, tax ID and billing address (no PO box, nine-digit ZIP), the provider roster (NPI check digits, taxonomy), each payer's EDI, ERA, EFT and credentialing enrollment against the go-live date, payer IDs, and the fee schedule against the charges the practice will bill. Lists blockers and to-dos by area with a payer readiness matrix. Patient identifiers in charges are masked before results reach the model.

**Fairclaim Practice Go Live never submits enrollment or credentialing applications; your team does, in each payer's portal. Fairclaim Practice Go Live never switches a practice live; a person decides go-live.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-practice-go-live demo
npx -y fairclaim-practice-go-live mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-practice-go-live demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Practice Go Live demo (fictional practice going live on 2026-03-02) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-practice-go-live-demo-wNQ8tg

▶ Check go-live readiness
  status: executed  decision: allow
  Not ready (go-live 2026-03-02, 15 day(s) away): 12 blocker(s), 6 to-do(s); 2 of 4 payer(s) ready. practice 2, providers 3, enrollment 3, payers 2, fees 2.
    error    practice    The billing provider address is a PO box (PO Box 4410): the 837 billing provider address must be a street address; put the PO box or lockbox in the pay-to address.
    error    practice    Billing provider ZIP 99501 has five digits: the 837 billing provider address needs the full nine-digit ZIP.
    error    providers   Taxonomy 207Q0000X is not ten characters ending in X.
    error    providers   NPI 1990000031: check digit is wrong.
    error    providers   1 claim(s) in the charges are for Tobi Okoro CRNA (fictional), who is not on the roster.
    error    enrollment  837 claim (EDI) enrollment is pending (submitted 2026-02-20, 10 day(s) before go-live): your lead time for this payer is 30 days, so it may not be live by go-live.
    error    enrollment  Ines Moreau NP (fictional): credentialing effective 2026-03-15, after go-live on 2026-03-02; claims for visits before that date may deny.
    error    enrollment  Ines Moreau NP (fictional): credentialing not on file for this payer: hold or reassign this provider's visits for this payer until it is done.
    error    payers      No clearinghouse payer ID: claims cannot be routed.
    error    payers      1 claim(s) in the charges go to Sample Vision Plan, which has no enrollment row: enroll or confirm the payer name.
    error    fees        Fee for 36415 is 0.00.
    error    fees        92014 is billed 1 time(s) in the charges but has no fee in the fee schedule.
    warning  providers   No license state on the roster.
    warning  enrollment  835 ERA enrollment is pending (submitted 2026-02-20, 10 day(s) before go-live): your lead time for this payer is 30 days, so it may not be live by go-live.
    warning  enrollment  EFT enrollment is pending (submitted 2026-02-20, 10 day(s) before go-live): your lead time for this payer is 30 days, so it may not be live by go-live.
    warning  enrollment  835 ERA enrollment is pending (submitted 2026-02-10, 20 day(s) before go-live): your lead time for this payer is 30 days, so it may not be live by go-live.
    warning  enrollment  EFT enrollment not started: payments will come as paper checks.
    warning  enrollment  Felix Brandt DO (fictional): credentialing pending since 2026-01-20: hold or reassign this provider's visits for this payer until it is done.
    info     practice    Billing NPI 2990000012 has a valid check digit. Confirm in NPPES that it is the group's (type 2) NPI, not a provider's.

▶ Payer readiness matrix
  status: executed  decision: allow
  2 of 4 payer(s) ready for go-live on 2026-03-02. Sample Mutual Insurance, Demo Medicaid Plan
    Example Health Plan        EDI done     ERA done     EFT done     credentialed 3/3 ready
    Sample Mutual Insurance    EDI done     ERA pending  EFT missing  credentialed 1/3 not ready
    Demo Medicaid Plan         EDI pending  ERA pending  EFT pending  credentialed 2/3 not ready
    Test Medicare Contractor   EDI done     ERA done     EFT done     credentialed 3/3 ready

▶ Write the go-live checklist
  status: executed  decision: allow
  Go-live checklist written: Not ready (go-live 2026-03-02, 15 day(s) away): 12 blocker(s), 6 to-do(s); 2 of 4 payer(s) ready. practice 2, providers 3, enrollment 3, payers 2, fees 2. Files: remedy-out/golive/golive-go-live.csv, remedy-out/golive/golive-go-live.html.

▶ Agent tries to switch the practice live
  status: blocked  decision: block
  reason: Fairclaim Practice Go Live never switches a practice live; a person decides go-live.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `golive_check` | Blockers (error), to-dos (warning) and notes (info) by area (practice, providers, enrollment, payers, fees), with counts, days to go-live and whether the practice is ready. | runs |
| `golive_payers` | For each payer: payer ID, EDI, ERA and EFT status, providers credentialed of those on the roster, providers to hold, and whether the payer is ready; with one payer, its items too. | runs |
| `golive_write_plan` | Write golive-go-live.csv (one row per blocker, to-do and note, with blank owner, due and done columns) and golive-go-live.html (with the payer readiness matrix and counts by area) into out_dir (default remedy-out/goli… | runs |
| `golive_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `golive_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `golive_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `golive_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `enrollment_submit` | Fairclaim Practice Go Live never submits enrollment or credentialing applications; your team does, in each payer's portal. | refused |
| `go_live_switch` | Fairclaim Practice Go Live never switches a practice live; a person decides go-live. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Provider roster (`roster`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `provider` (required) | text | Provider, Provider Name, Rendering Provider, Name, Clinician | Leistungserbringer, Prestataire, 医師, 医生 |
| `npi` | text | NPI, Individual NPI, Rendering NPI, Provider NPI, Type 1 NPI | - |
| `taxonomy` | text | Taxonomy, Taxonomy Code, Specialty Taxonomy | - |
| `license_state` | text | License State, State License, State | - |
| `license_number` | text | License Number, License #, License No | - |

### Payer enrollment tracker (`enrollments`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `payer` (required) | text | Payer, Payer Name, Insurance, Payor, Plan | Kostenträger, Payeur, 保険者, 付款方 |
| `payer_id` | text | Payer ID, Payor ID, Clearinghouse Payer ID, EDI Payer ID, CPID | - |
| `provider` | text | Provider, Provider Name, Rendering Provider | Leistungserbringer, Prestataire, 医師, 医生 |
| `npi` | text | NPI, Provider NPI | - |
| `edi` | text | EDI, EDI Enrollment, 837 Enrollment, Claims Enrollment, EDI Status | - |
| `era` | text | ERA, ERA Enrollment, 835 Enrollment, ERA Status | - |
| `eft` | text | EFT, EFT Enrollment, EFT Status, Direct Deposit | - |
| `credentialing` | text | Credentialing, Credentialing Status, Participation, Par Status, Contract Status | - |
| `submitted_date` | date | Submitted, Date Submitted, Submitted Date, Application Date | - |
| `effective_date` | date | Effective, Effective Date, Approved Effective | - |

### Fee schedule (`fees`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `code` (required) | text | Code, CPT, CPT Code, HCPCS, Procedure Code, Proc Code | - |
| `modifier` | text | Modifier, Mod | - |
| `fee` (required) | amount | Fee, Charge, Standard Fee, Price, Amount | - |

### Recent charges (837 or export) (`charges`)

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

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-practice-go-live inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-practice-go-live can remember facts about your setup so the next run does not have to be told again. `golive_learn` only proposes a fact; it changes nothing until a named person accepts it with `golive_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_lead_days` | uses that lead time for the payer instead of the default when judging pending enrollments. It never shortens the default. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-practice-go-live memory list
fairclaim-practice-go-live memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-practice-go-live memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-practice-go-live demo
npx -y fairclaim-practice-go-live mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-practice-go-live": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-practice-go-live",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-practice-go-live -- npx -y fairclaim-practice-go-live mcp --root .`, or install the `fairclaim-practice-go-live` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-practice-go-live approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-practice-go-live approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-practice-go-live kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-practice-go-live tools                 # every tool, its policy and arguments
fairclaim-practice-go-live sources               # the columns each input is read from
fairclaim-practice-go-live inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-practice-go-live call golive_check '{"setup":"<setup>","roster":"<roster>","enrollments":"<enrollments>"}'
fairclaim-practice-go-live eval                  # the private eval cases on the fictional fixtures
fairclaim-practice-go-live demo
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
