# Fairclaim Patient Registration (`fairclaim-patient-registration`)

Checks patient registration and insurance records before the visit: member id shape per payer and Medicare MBI format, missing or impossible birth dates, subscriber and guarantor gaps, ended coverage, the same plan entered twice, contact formats, and likely duplicate charts. Patient identifiers are masked before results reach the model.

**Fairclaim Patient Registration never merges or deletes charts; a person checks the records and merges in the practice system. Fairclaim Patient Registration never changes registration data; the front desk corrects it with the patient.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-patient-registration demo
npx -y fairclaim-patient-registration mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-patient-registration demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Patient Registration demo (fictional practice, payers and patients) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-patient-registration-demo-BI9CBb

▶ Check registrations before the visits
  status: executed  decision: allow
  11 patient(s): 2 clean, 6 with errors (7 error(s), 8 warning(s)). member_id_pattern 1, missing_member_id 1, mbi_format 1, subscriber_missing 1, coverage_ended 1, same_plan_twice 1, dob_future 1, possible_duplicate 2, zip_format 1, minor_no_guarantor 1, subscriber_mismatch 1, not_verified 1, phone_format 1, state_format 1. 1 likely duplicate pair(s).
    error    member_id_pattern    MRN-934b7e39  The id for Sample Mutual Insurance does not match SMI\d{9}.
    error    missing_member_id    MRN-43239f47  No member id for Demo Medicaid Plan.
    error    mbi_format           MRN-583f5a20  The id for Test Medicare Contractor is not a valid MBI (11 characters, letters except S, L, O, I, B, Z).
    error    subscriber_missing   MRN-20cc09c8  Relationship is "Child" but the subscriber's birth date is missing.
    error    coverage_ended       MRN-319ed1f9  Coverage with Sample Mutual Insurance ended 2026-01-31.
    error    same_plan_twice      MRN-319ed1f9  Secondary is Sample Mutual Insurance with the same id.
    error    dob_future           MRN-34af8fc0  Birth date [DOB] is in the future.
    warning  possible_duplicate   MRN-e4dbf1d0  Chart MRN-dddb93f1 has the same birth date and a name 98% alike.
    warning  zip_format           MRN-43239f47  ZIP "995…" is not 5 or 9 digits: it has probably lost its leading zero (spreadsheets drop it).
    warning  minor_no_guarantor   MRN-20cc09c8  Patient is 13; no guarantor.
    warning  subscriber_mismatch  MRN-3c37fcb3  Relationship is self but the subscriber is a different person.
    warning  not_verified         MRN-3c37fcb3  Insurance last verified 2024-06-01, 624 days ago.
    warning  phone_format         MRN-3c37fcb3  Phone has 9 digit(s).
    warning  state_format         MRN-34af8fc0  State "Alaska" is not a two-letter code.
    warning  possible_duplicate   MRN-dddb93f1  Chart MRN-e4dbf1d0 has the same birth date and a name 98% alike.

▶ Explain one chart (the model only knows its pseudonym)
  status: executed  decision: allow
  MRN-934b7e39: 1 issue(s). member_id_pattern: The id for Sample Mutual Insurance does not match SMI\d{9}.

▶ Write the fix list (French page)
  status: executed  decision: allow
  Registration fix list written: 11 patient(s): 2 clean, 6 with errors (7 error(s), 8 warning(s)). member_id_pattern 1, missing_member_id 1, mbi_format 1, subscriber_missing 1, coverage_ended 1, same_plan_twice 1, dob_future 1, possible_duplicate 2, zip_format 1, minor_no_guarantor 1, subscriber_mismatch 1, not_verified 1, phone_format 1, state_format 1. 1 likely duplicate pair(s). Files: remedy-out/registration/registration.csv, remedy-out/registration/registration.html.

▶ Agent tries to merge two charts itself
  status: blocked  decision: block
  reason: Fairclaim Patient Registration never merges or deletes charts; a person checks the records and merges in the practice system.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `registration_check` | One row per issue with the chart, check, severity, field, message and fix. | runs |
| `registration_explain` | All issues for one chart with the fixes. | runs |
| `registration_write_report` | Write registration.csv (one row per issue with blank owner and done columns) and registration.html into out_dir (default remedy-out/registration). | runs |
| `registration_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `registration_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `registration_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `registration_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `patient_merge` | Fairclaim Patient Registration never merges or deletes charts; a person checks the records and merges in the practice system. | refused |
| `registration_update` | Fairclaim Patient Registration never changes registration data; the front desk corrects it with the patient. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Patient registrations (`patients`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `mrn` (required) | text (masked) | MRN, Chart Number, Chart #, Patient ID, Medical Record Number, Patient Number | - |
| `patient_name` | text (masked) | Patient, Patient Name, Name, Pt Name | Patient, Patient, 患者名, 患者 |
| `first_name` | text (masked) | First Name, Patient First Name, First | - |
| `last_name` | text (masked) | Last Name, Patient Last Name, Last | - |
| `dob` | date (masked) | DOB, Date of Birth, Birth Date, Birthdate, Patient DOB | - |
| `gender` | text | Gender, Sex | - |
| `address` | text (masked) | Address, Street, Address 1, Address Line 1, Street Address | Adresse, Adresse, 住所, 地址 |
| `city` | text | City, Town | - |
| `state` | text | State, ST, Province | - |
| `zip` | text (masked) | ZIP, Zip Code, Postal Code, Zip | - |
| `phone` | text (masked) | Phone, Home Phone, Mobile, Cell Phone, Phone Number, Primary Phone | - |
| `payer` | text | Primary Insurance, Insurance, Payer, Primary Payer, Insurance Name, Carrier | Kostenträger, Payeur, 保険者, 付款方 |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insurance ID, Policy Number, Policy #, Primary Member ID | - |
| `group_number` | text | Group Number, Group #, Group ID, Group | - |
| `relationship` | text | Relationship, Relationship to Subscriber, Patient Relationship, Rel to Insured, Relation | - |
| `subscriber_name` | text (masked) | Subscriber, Subscriber Name, Insured Name, Policy Holder, Policyholder | - |
| `subscriber_dob` | date (masked) | Subscriber DOB, Insured DOB, Policy Holder DOB, Subscriber Date of Birth | - |
| `coverage_start` | date | Effective Date, Coverage Start, Eff Date, Start Date | - |
| `coverage_end` | date | Termination Date, Coverage End, Term Date, End Date, Expiration Date | - |
| `secondary_payer` | text | Secondary Insurance, Secondary Payer, Secondary Carrier | - |
| `secondary_member_id` | text (masked) | Secondary Member ID, Secondary Subscriber ID, Secondary Policy Number | - |
| `guarantor` | text (masked) | Guarantor, Guarantor Name, Responsible Party, Parent/Guardian | - |
| `verified` | date | Last Verified, Insurance Verified, Verified Date, Eligibility Checked, Card Scanned | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-patient-registration inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-patient-registration can remember facts about your setup so the next run does not have to be told again. `registration_learn` only proposes a fact; it changes nothing until a named person accepts it with `registration_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_member_id_pattern` | checks member ids for that payer against the pattern too. It only adds a check; it never passes an id the config would flag. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-patient-registration memory list
fairclaim-patient-registration memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-patient-registration memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-patient-registration demo
npx -y fairclaim-patient-registration mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-patient-registration": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-patient-registration",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-patient-registration -- npx -y fairclaim-patient-registration mcp --root .`, or install the `fairclaim-patient-registration` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-patient-registration approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-patient-registration approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-patient-registration kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-patient-registration tools                 # every tool, its policy and arguments
fairclaim-patient-registration sources               # the columns each input is read from
fairclaim-patient-registration inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-patient-registration call registration_check '{"patients":"<patients>"}'
fairclaim-patient-registration eval                  # the private eval cases on the fictional fixtures
fairclaim-patient-registration demo
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
