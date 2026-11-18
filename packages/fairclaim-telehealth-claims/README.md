# Fairclaim Telehealth Claims (`fairclaim-telehealth-claims`)

Telehealth claims coded the way each payer wants: checks place of service 02 or 10 against where the patient was, the 95, GT, 93 or FQ modifiers by payer, audio-only against video codes and the 98000-98015 telemedicine codes, the deleted 99441-99443, the provider's license in the patient's state, consent for virtual check-ins, and same-day in-person visits. Payer rules come from your config; the built-in rule is an example. Patient identifiers are masked before results reach the model.

**Fairclaim Telehealth Claims never sends claims; the practice does, after fixing them. Fairclaim Telehealth Claims never starts or joins patient visits.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-telehealth-claims demo
npx -y fairclaim-telehealth-claims mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-telehealth-claims demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Telehealth Claims demo (fictional practice, patients and example payer rules) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-telehealth-claims-demo-cpcr05

▶ Check February telehealth lines
  status: executed  decision: allow
  12 telehealth line(s) of 13: 7 with errors, 2 with warnings. pos 1, deleted_code 1, audio_only 1, modifier 3, payer_code 1, license 1, originating_site 1, consent 1, same_day 1.
    error    T9002 99214-95 POS 02    The patient was at home: place of service 10 (telehealth in the patient's home), not 02.
    error    T9003 99442 POS 02       99442 (telephone E/M, 11-20 minutes) was deleted for 2025: use the payer's audio-only code (98008-98015, or an office visit code with 93). Demo Medicaid Plan does not cover audio-only visits in your rules.
    error    T9004 99213 POS 10       Audio-only visit: add 93.
    error    T9005 98005-95 POS 10    Sample Mutual Insurance does not take the 98000-98015 telemedicine codes in your rules: bill the office visit code (99202-99215) with its telehealth place of service and modifiers.
    error    T9006 99214-95 POS 10    Alma Reyes MD (fictional) is not licensed in OR in your list (AK, WA): telehealth follows the patient's location.
    error    T9010 Q3014 POS 11       Q3014 (originating site fee) is billed by the facility where the patient is, not for a patient at home.
    error    T9011 99213-GT POS 02    Sample Mutual Insurance wants modifier 95 on telehealth lines. GT is an older telehealth modifier; Sample Mutual Insurance wants 95.
    warning  T9007 98016 POS 02       98016 needs the patient's consent documented (check what form your payer accepts); none is recorded.
    warning  T9008 99213-95 POS 10    The same provider also billed an in-person visit (T9009) on 2026-02-12: check whether this payer pays both, or bill one visit.
    ok       T9001 99213-95 POS 10    
    ok       T9012 99213 POS 02       
    ok       T9013 99214-95 POS 10    

▶ Which rule each payer gets
  status: executed  decision: allow
  3 payer rule(s) from your config; other payers use the example rule (not any payer's policy); 0 learned requirement(s).

▶ Write the list
  status: executed  decision: allow
  Telehealth list written: 12 telehealth line(s) of 13: 7 with errors, 2 with warnings. pos 1, deleted_code 1, audio_only 1, modifier 3, payer_code 1, license 1, originating_site 1, consent 1, same_day 1. Files: remedy-out/telehealth/telehealth.csv, remedy-out/telehealth/telehealth.html.

▶ Agent tries to send a claim
  status: blocked  decision: block
  reason: Fairclaim Telehealth Claims never sends claims; the practice does, after fixing them.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `telehealth_check` | Every telehealth line with the rule it was checked against, status (error, warning, ok) and issues: deleted_code, modality, payer_code, audio_only, pos, modifier, consent, originating_site, license, same_day. | runs |
| `telehealth_explain` | Every telehealth line of one claim with its place of service, modifiers, the payer rule and each issue in plain words. | runs |
| `telehealth_rules` | The rule used for each payer in the config, the default rule for others, and learned payer requirements. | runs |
| `telehealth_write_report` | Write telehealth.csv (one row per issue with blank owner and fixed columns) and telehealth.html (with counts by check) into out_dir (default remedy-out/telehealth). | runs |
| `telehealth_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `telehealth_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `telehealth_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `telehealth_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `claim_submit` | Fairclaim Telehealth Claims never sends claims; the practice does, after fixing them. | refused |
| `visit_start` | Fairclaim Telehealth Claims never starts or joins patient visits. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Telehealth claim lines (`visits`)

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
| `patient_state` | text | Patient State, Patient Location State, State of Patient, Pt State | - |
| `patient_location` | text | Patient Location, Patient Site, Originating Site, Location of Patient | - |
| `modality` | text | Modality, Visit Modality, Telehealth Type, Audio/Video, Connection | - |
| `consent` | yes/no | Consent, Consent on File, Telehealth Consent, Consent Documented | Einwilligung, Consentement, 同意, 同意 |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-telehealth-claims inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-telehealth-claims can remember facts about your setup so the next run does not have to be told again. `telehealth_learn` only proposes a fact; it changes nothing until a named person accepts it with `telehealth_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_telehealth_rule` | adds that requirement for the payer: a modifier, an audio-only modifier, no audio-only, or fewer accepted places of service. It never loosens a rule. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-telehealth-claims memory list
fairclaim-telehealth-claims memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-telehealth-claims memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-telehealth-claims demo
npx -y fairclaim-telehealth-claims mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-telehealth-claims": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-telehealth-claims",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-telehealth-claims -- npx -y fairclaim-telehealth-claims mcp --root .`, or install the `fairclaim-telehealth-claims` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-telehealth-claims approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-telehealth-claims approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-telehealth-claims kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-telehealth-claims tools                 # every tool, its policy and arguments
fairclaim-telehealth-claims sources               # the columns each input is read from
fairclaim-telehealth-claims inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-telehealth-claims call telehealth_check '{"visits":"<visits>"}'
fairclaim-telehealth-claims eval                  # the private eval cases on the fictional fixtures
fairclaim-telehealth-claims demo
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
