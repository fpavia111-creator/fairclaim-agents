# Fairclaim Denial Worklist (`fairclaim-denial-worklist`)

Sorts the denials in your 835 remittances (or ERA exports) by reason code and root cause into a worklist: category, team, next step, appeal deadline and priority, with trends by payer, provider and code. Patient identifiers are masked before results reach the model.

**Fairclaim Denial Worklist never resubmits claims; your billing team corrects and sends them. Fairclaim Denial Worklist never files appeals; fairclaim-denial-appeals drafts them and a person sends them. Fairclaim Denial Worklist never logs in to payer portals.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-denial-worklist demo
npx -y fairclaim-denial-worklist mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-denial-worklist demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Denial Worklist demo (fictional practice, payers and patients) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-denial-worklist-demo-Z4aiwz

▶ Sort the denials in one 835 file
  status: executed  decision: allow
  8 denial line(s) on 7 of 8 claim(s), 1230 denied. Top categories: unknown 260, authorization 200, coordination_of_benefits 200. Unknown codes: CO-989.
    review C2006    Sample Mutual Insurance    CO-989       260  unknown  PT-41a3452a
    medium C2002    Sample Mutual Insurance    CO-197       200  authorization  PT-fe44dfca
    medium C2008    Demo Medicaid Plan         CO-22        200  coordination_of_benefits  PT-641f60b8
    medium C2005    Example Health Plan        CO-29        150  timely_filing  PT-b53964ae
    medium C2007    Example Health Plan        CO-18        150  duplicate  PT-e4b56164
    medium C2002    Sample Mutual Insurance    CO-97        120  bundling  PT-fe44dfca
    low    C2003    Demo Medicaid Plan         CO-16         90  provider_enrollment  PT-c3cb3fff
    low    C2004    Test Medicare Contractor   CO-50         60  medical_necessity  PT-dd8aed21

▶ Explain claim C2002
  status: executed  decision: allow
  C2002: billed 320, paid 0. CO-197 200 (authorization: Find the authorization or referral number; if none was obtained, ask about a retro-authorization or appeal.) CO-97 120 (bundling: Check whether a modifier is supported by the record (for example a distinct procedure); otherwise accept the edit.)

▶ Trends by payer and category
  status: executed  decision: allow
  Trends over 8 denial line(s): 4 payer(s), 1 provider(s), 6 code(s).

▶ Write the worklist (German page)
  status: executed  decision: allow
  Denial worklist written: 8 denial line(s) on 7 of 8 claim(s), 1230 denied. Top categories: unknown 260, authorization 200, coordination_of_benefits 200. Unknown codes: CO-989. Files: remedy-out/denials/denials.csv, remedy-out/denials/denials.html.

▶ Propose what an unknown code means for one payer
  status: executed  decision: allow
  Stored MEM-7bca24706e20 as waiting. It changes nothing until a named person accepts it with denials_accept_learning (id "MEM-7bca24706e20", decision "accept").

▶ Accepting it waits for a named person
  status: needs_approval  decision: ask
  reason: Changing what the agent remembers needs a named person, even in Auto.

▶ Agent tries to resubmit a claim itself
  status: blocked  decision: block
  reason: Fairclaim Denial Worklist never resubmits claims; your billing team corrects and sends them.

Patient names above are pseudonyms; the worklist files under C:\Users\fpavi\AppData\Local\Temp\fairclaim-denial-worklist-demo-Z4aiwz/remedy-out keep the real names.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `denials_sort` | Read the remittances and list every denying adjustment (skipping contractual write-downs and deductible/coinsurance/copay) with its reason and remark codes, root-cause category, team, next step, appeal deadline and pr… | runs |
| `denials_explain` | Show one claim from the remittance: every line, every adjustment with its group and reason, the remark codes, and why each denial was put in its category. | runs |
| `denials_trends` | Denied count and amount by payer and category, by rendering provider, by procedure code and by month of payment, to find the causes worth fixing at the front end. | runs |
| `denials_write_report` | Write denials.csv (one row per denial with blank owner, action and decision columns) and denials.html (totals by category, payer and team) into out_dir (default remedy-out/denials). | runs |
| `denials_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `denials_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `denials_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `denials_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `claim_resubmit` | Fairclaim Denial Worklist never resubmits claims; your billing team corrects and sends them. | refused |
| `appeal_submit` | Fairclaim Denial Worklist never files appeals; fairclaim-denial-appeals drafts them and a person sends them. | refused |
| `payer_portal_submit` | Fairclaim Denial Worklist never logs in to payer portals. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Remittances (ERA / payment export) (`remits`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `claim_id` (required) | text | Claim ID, Patient Control Number, Claim Number, Claim #, Encounter ID, Encounter | - |
| `payer_claim_id` | text | Payer Claim Number, ICN, Payer Claim ID, Claim Control Number, Payer ICN, Payer Claim Control Number | - |
| `patient_name` | text (masked) | Patient, Patient Name, Pt Name | Patient, Patient, 患者名, 患者 |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insured ID, Policy Number | - |
| `account` | text (masked) | Account Number, Patient Account, Acct #, Account # | - |
| `payer` | text | Payer, Payer Name, Insurance, Payor, Carrier, Insurance Company | Kostenträger, Payeur, 保険者, 付款方 |
| `payer_id` | text | Payer ID, Payor ID | - |
| `check_number` | text | Check Number, Check #, EFT Number, EFT Trace, Trace Number, Payment Reference | - |
| `payment_date` | date | Payment Date, Check Date, Paid Date, Remit Date, EFT Date, Check/EFT Date | - |
| `claim_status` | text | Claim Status Code, Status Code, CLP02, Claim Status | - |
| `date_of_service` | date | DOS, Date of Service, Service Date, From Date | Leistungsdatum, Date de soins, 診療日, 服务日期 |
| `code` | text | CPT, CPT Code, Procedure, Procedure Code, HCPCS, Proc Code | - |
| `modifiers` | text | Modifiers, Modifier, Mod | - |
| `units` | number | Units, Qty, Paid Units, Units Paid | Anzahl, Quantité, 回数, 数量 |
| `billed` | amount | Billed, Charge, Billed Amount, Charges, Submitted Charge, Charge Amount | Rechnungsbetrag, Montant facturé, 請求額, 账单金额 |
| `allowed` | amount | Allowed, Allowed Amount, Allowable, Allowed Amt | Anerkannt, Montant admis, 許容額, 允许金额 |
| `paid` | amount | Paid, Paid Amount, Payment, Insurance Paid, Payer Paid, Ins Paid | Bezahlt, Payé, 支払額, 已付 |
| `patient_responsibility` | amount | Patient Responsibility, Pt Resp, PR Amount, Patient Portion, Patient Resp | - |
| `adjustment_group` | text | Group Code, Adj Group, Adjustment Group, CAS Group, Group | - |
| `adjustment_reason` | text | Reason Code, CARC, Adj Reason, Adjustment Reason, Adjustment Code, Denial Code | - |
| `adjustment_amount` | amount | Adjustment, Adj Amount, Adjustment Amount, Adj Amt, Write Off, Contractual | - |
| `adjustments` | text | Adjustments, Adjustment Codes, CARC Codes, CAS, Adjustment Detail | - |
| `remarks` | text | Remark Codes, RARC, Remarks, Remark, Remark Code, RARC Codes | - |
| `rendering_npi` | text | Rendering NPI, Provider NPI, NPI | - |
| `provider` | text | Provider, Rendering Provider, Provider Name | Leistungserbringer, Prestataire, 医師, 医生 |
| `received_date` | date | Received Date, Date Received, Payer Received | - |
| `submitted_date` | date | Submitted, Submit Date, Date Submitted, Billed Date, Claim Date | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-denial-worklist inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-denial-worklist can remember facts about your setup so the next run does not have to be told again. `denials_learn` only proposes a fact; it changes nothing until a named person accepts it with `denials_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_code_category` | sorts that payer's denials with this code into the category (the config's payer_codes win). It can never turn a denial into an expected adjustment. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-denial-worklist memory list
fairclaim-denial-worklist memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-denial-worklist memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-denial-worklist demo
npx -y fairclaim-denial-worklist mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-denial-worklist": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-denial-worklist",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-denial-worklist -- npx -y fairclaim-denial-worklist mcp --root .`, or install the `fairclaim-denial-worklist` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-denial-worklist approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-denial-worklist approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-denial-worklist kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-denial-worklist tools                 # every tool, its policy and arguments
fairclaim-denial-worklist sources               # the columns each input is read from
fairclaim-denial-worklist inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-denial-worklist call denials_sort '{"remits":"<remits>"}'
fairclaim-denial-worklist eval                  # the private eval cases on the fictional fixtures
fairclaim-denial-worklist demo
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
