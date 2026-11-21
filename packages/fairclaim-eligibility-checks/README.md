# Fairclaim Eligibility Checks (`fairclaim-eligibility-checks`)

Reads 271 eligibility responses against your appointment list and sorts every visit: active, inactive, member not found (with the AAA reason), plan ending before the visit, another payer primary, or no response. Shows copay, coinsurance and deductible left to collect. Patient identifiers are masked before results reach the model.

**Fairclaim Eligibility Checks never sends 270 inquiries; your clearinghouse or practice system does. Fairclaim Eligibility Checks never changes the schedule; the front desk talks to the patient.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-eligibility-checks demo
npx -y fairclaim-eligibility-checks mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-eligibility-checks demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Eligibility Checks demo (fictional practice, payers and patients) in <demo folder>

▶ Check tomorrow's visits against the 271 responses
  status: executed  decision: allow
  8 visit(s): 3 ready, 5 need action (inactive 1, not_found 1, other_payer 1, plan_ended 1, no_response 1). Copays to collect at check-in: 50.
    not_found    A1003 Demo Medicaid Plan         copay   -  AAA 75: Subscriber not found
    inactive     A1002 Sample Mutual Insurance    copay   -  The 271 says coverage is inactive (plan ended 2025-12-31).
    plan_ended   A1005 Example Health Plan        copay  25  Plan ends 2026-01-31, visit is 2026-02-03.
    other_payer  A1004 Test Medicare Contractor   copay   -  Other payer on file: EXAMPLE EMPLOYER PLAN.
    no_response  A1006 Sample Mutual Insurance    copay   -  
    active       A1001 Example Health Plan        copay  25  
    active       A1007 Example Health Plan        copay  25  The plan lists a primary care provider: a specialist visit may need a referral.
    active       A1008 Demo Medicaid Plan         copay   0  

▶ Explain visit A1003
  status: executed  decision: allow
  A1003 on 2026-02-03: not_found. AAA 75: Subscriber not found The payer could not find the member: check the member id, name and birth date against the card and send the inquiry again.

▶ Write the front-desk call list (Japanese page)
  status: executed  decision: allow
  Eligibility call list written: 8 visit(s): 3 ready, 5 need action (inactive 1, not_found 1, other_payer 1, plan_ended 1, no_response 1). Copays to collect at check-in: 50. Files: remedy-out/eligibility/eligibility.csv, remedy-out/eligibility/eligibility.html.

▶ Teach a visit type to double-check
  status: executed  decision: allow
  Stored MEM-8b11713855b4 as waiting. It changes nothing until a named person accepts it with eligibility_accept_learning (id "MEM-8b11713855b4", decision "accept").

▶ Agent tries to send an inquiry itself
  status: blocked  decision: block
  reason: Fairclaim Eligibility Checks never sends 270 inquiries; your clearinghouse or practice system does.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `eligibility_check` | Sort every scheduled visit by eligibility status with the reason, the fix, plan dates, copay, coinsurance and deductible left. | runs |
| `eligibility_explain` | Show one visit with the 271 it matched (or why none matched), its status, reasons and benefits. | runs |
| `eligibility_write_report` | Write eligibility.csv (every visit with status, reason, fix and amounts, plus blank called-by and notes columns) and eligibility.html into out_dir (default remedy-out/eligibility). | runs |
| `eligibility_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `eligibility_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `eligibility_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `eligibility_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `eligibility_inquiry_send` | Fairclaim Eligibility Checks never sends 270 inquiries; your clearinghouse or practice system does. | refused |
| `appointment_cancel` | Fairclaim Eligibility Checks never changes the schedule; the front desk talks to the patient. | refused |

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

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-eligibility-checks inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-eligibility-checks can remember facts about your setup so the next run does not have to be told again. `eligibility_learn` only proposes a fact; it changes nothing until a named person accepts it with `eligibility_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `visit_type_review` | moves matching active visits to review with your note. It only adds a check; it never marks a visit as ready. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-eligibility-checks memory list
fairclaim-eligibility-checks memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-eligibility-checks memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-eligibility-checks demo
npx -y fairclaim-eligibility-checks mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-eligibility-checks": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-eligibility-checks",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-eligibility-checks -- npx -y fairclaim-eligibility-checks mcp --root .`, or install the `fairclaim-eligibility-checks` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-eligibility-checks approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-eligibility-checks approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-eligibility-checks kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-eligibility-checks tools                 # every tool, its policy and arguments
fairclaim-eligibility-checks sources               # the columns each input is read from
fairclaim-eligibility-checks inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-eligibility-checks call eligibility_check '{"appointments":"<appointments>","eligibility":"<eligibility>"}'
fairclaim-eligibility-checks eval                  # the private eval cases on the fictional fixtures
fairclaim-eligibility-checks demo
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
