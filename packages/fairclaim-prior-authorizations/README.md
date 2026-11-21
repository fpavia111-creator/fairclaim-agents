# Fairclaim Prior Authorizations (`fairclaim-prior-authorizations`)

Matches claims or scheduled services to your prior-authorization log and 278 responses: flags services with no authorization, a cancelled, pended or denied one, dates outside the authorization, codes not on it, units used up, or a different number on the claim, and authorizations about to run out. Patient identifiers are masked before results reach the model.

**Fairclaim Prior Authorizations never submits authorization requests (278 or portal); the authorization team does. Fairclaim Prior Authorizations never logs in to payer portals.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-prior-authorizations demo
npx -y fairclaim-prior-authorizations mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-prior-authorizations demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Prior Authorizations demo (fictional practice, payers and patients) in <demo folder>

▶ Check eleven service lines against the authorization log and 278s
  status: executed  decision: allow
  11 service line(s) need authorization: 2 covered, 8 at risk (5610 in charges). running_out 1, missing 1, expired 1, units_exceeded 1, pending 1, code_not_on_auth 1, denied 1, not_in_log 1, number_mismatch 1
    missing           M5   20610 -           Example Health Plan needs prior authorization for 20610; none on file for this patient.
    denied            M9   70553 AUTH-309    Authorization AUTH-309 was not certified.
    expired           M6   72148 AUTH-305    AUTH-305 ended 2026-01-31; the service is 2026-02-04.
    units_exceeded    M4   97110 AUTH-302    5 units used of 4 on AUTH-302.
    code_not_on_auth  M8   97530 AUTH-308    97530 is not one of the codes on AUTH-308 (97110).
    number_mismatch   M11  97110 AUTH-301    The claim carries AUTH-3O1; the log has AUTH-301 for this service.
    pending           M7   29881 278:REQ-M7  Authorization 278:REQ-M7 is pended with the payer.
    not_in_log        M10  99213 -           The claim carries authorization AUTH-999, which is not in the log for this patient.
    running_out       M3   97110 AUTH-302    AUTH-302: 2 unit(s) left, ends 2026-02-15.
    covered           M1   97110 AUTH-301    AUTH-301 covers it.
    covered           M2   97140 AUTH-301    AUTH-301 covers it.

▶ List the authorizations
  status: executed  decision: allow
  6 authorization(s): approved 4, denied 1, pending 1.

▶ Write the coordinator's list (Chinese page)
  status: executed  decision: allow
  Authorization work list written: 11 service line(s) need authorization: 2 covered, 8 at risk (5610 in charges). running_out 1, missing 1, expired 1, units_exceeded 1, pending 1, code_not_on_auth 1, denied 1, not_in_log 1, number_mismatch 1 Files: remedy-out/authorizations/authorizations.csv, remedy-out/authorizations/authorizations.html.

▶ Teach a payer rule from a denial
  status: executed  decision: allow
  Stored MEM-a6e2040e32a8 as waiting. It changes nothing until a named person accepts it with authorizations_accept_learning (id "MEM-a6e2040e32a8", decision "accept").

▶ Agent tries to request an authorization itself
  status: blocked  decision: block
  reason: Fairclaim Prior Authorizations never submits authorization requests (278 or portal); the authorization team does.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `authorizations_check` | For each service line that needs (or carries) a prior authorization: the authorization it uses, units used so far, and a status (covered, running_out, missing, denied, pending, expired, not_started, code_not_on_auth, … | runs |
| `authorizations_authorizations` | List the authorizations from the log and the 278 responses with dates, codes, approved units and status. | runs |
| `authorizations_write_report` | Write authorizations.csv (one row per service line with blank owner and decision columns) and authorizations.html into out_dir (default remedy-out/authorizations). | runs |
| `authorizations_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `authorizations_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `authorizations_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `authorizations_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `auth_request_submit` | Fairclaim Prior Authorizations never submits authorization requests (278 or portal); the authorization team does. | refused |
| `payer_portal_login` | Fairclaim Prior Authorizations never logs in to payer portals. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Services (837 or claim export) (`services`)

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

### Prior-authorization log (`auths`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `auth_number` (required) | text | Auth Number, Authorization Number, Auth #, Authorization #, Prior Auth, PA Number | - |
| `patient_name` | text (masked) | Patient, Patient Name, Member Name | Patient, Patient, 患者名, 患者 |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insurance ID, Policy Number | - |
| `payer` | text | Payer, Insurance, Plan, Carrier, Payer Name | Kostenträger, Payeur, 保険者, 付款方 |
| `codes` | text | CPT, CPT Codes, Codes, Procedure Codes, Services, Service Codes | - |
| `units` | number | Units, Approved Units, Visits, Approved Visits, Units Approved, Visits Approved | Anzahl, Quantité, 回数, 数量 |
| `from` | date | Start Date, From, Effective Date, Valid From, Begin Date, Start | - |
| `to` | date | End Date, To, Expiration Date, Valid To, Expires, Thru Date | - |
| `status` | text | Status, Auth Status, Decision | Status, Statut, ステータス, 状态 |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-prior-authorizations inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-prior-authorizations can remember facts about your setup so the next run does not have to be told again. `authorizations_learn` only proposes a fact; it changes nothing until a named person accepts it with `authorizations_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_auth_rule` | checks those codes for that payer even when the rules file does not list them. It only adds checks. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-prior-authorizations memory list
fairclaim-prior-authorizations memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-prior-authorizations memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-prior-authorizations demo
npx -y fairclaim-prior-authorizations mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-prior-authorizations": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-prior-authorizations",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-prior-authorizations -- npx -y fairclaim-prior-authorizations mcp --root .`, or install the `fairclaim-prior-authorizations` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-prior-authorizations approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-prior-authorizations approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-prior-authorizations kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-prior-authorizations tools                 # every tool, its policy and arguments
fairclaim-prior-authorizations sources               # the columns each input is read from
fairclaim-prior-authorizations inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-prior-authorizations call authorizations_check '{"services":"<services>","auths":"<auths>"}'
fairclaim-prior-authorizations eval                  # the private eval cases on the fictional fixtures
fairclaim-prior-authorizations demo
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
