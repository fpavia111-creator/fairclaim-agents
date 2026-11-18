# Fairclaim AR Aging (`fairclaim-ar-aging`)

Ages open insurance A/R by payer and bucket, warns before each payer's timely-filing limit passes on unbilled claims, finds claims submitted after the limit or with no payer response, and ranks the follow-up queue by balance and age. Patient identifiers are masked before results reach the model.

**Fairclaim AR Aging never writes off balances; a person decides by your write-off policy. Fairclaim AR Aging never calls or messages payers.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-ar-aging demo
npx -y fairclaim-ar-aging mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-ar-aging demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim AR Aging demo (fictional practice, payers and patients) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-ar-aging-demo-6yXMkQ

▶ Age open A/R and rank the follow-up queue
  status: executed  decision: allow
  9 open claim(s): insurance 1690 (36.09% over 90 days), patient 40. At risk of timely filing: 610. waiting 2, file_now 1, past_filing_limit 1, filed_late 1, follow_up 2, patient_balance 1, unbilled 1. No filing limit set for: Sample Auto Insurance (fictional).
    file_now           A1002      320  Sample Mutual Insurance  Not billed and 8 day(s) left to file: send it now.
    filed_late         A1004      200  Sample Mutual Insurance  Submitted 105 days after service; the limit is 90. Expect a timely-filing denial unless you have proof of an earlier submission.
    follow_up          A1008      500  Sample Auto Insurance (fictional)  No payment 65 days after submission: check claim status with the payer.
    follow_up          A1005      260  Example Health Plan  No payment 102 days after submission and no activity since 2025-12-01: check claim status with the payer.
    past_filing_limit  A1003       90  Demo Medicaid Plan  Past the filing limit and never billed: check for proof of timely filing; otherwise review for write-off by policy.
    waiting            A1006       60  Test Medicare Contractor  Within the payer's normal time.
    waiting            A1001      150  Example Health Plan  Within the payer's normal time.
    unbilled           A1010      110  Demo Medicaid Plan  Not billed yet.
    patient_balance    A1007       40  Example Health Plan  Patient balance: send a statement or set up a plan (fairclaim-patient-statements, fairclaim-payment-plans).

▶ Explain a claim submitted after the limit
  status: executed  decision: allow
  A1004: 200 with Sample Mutual Insurance, 167 days old, filed_late. Submitted 105 days after service; the limit is 90. Expect a timely-filing denial unless you have proof of an earlier submission.

▶ Write the call queue (Spanish page)
  status: executed  decision: allow
  A/R queue written: 9 open claim(s): insurance 1690 (36.09% over 90 days), patient 40. At risk of timely filing: 610. waiting 2, file_now 1, past_filing_limit 1, filed_late 1, follow_up 2, patient_balance 1, unbilled 1. No filing limit set for: Sample Auto Insurance (fictional). Files: remedy-out/ar/ar.csv, remedy-out/ar/ar.html.

▶ Agent tries to write off a balance itself
  status: blocked  decision: block
  reason: Fairclaim AR Aging never writes off balances; a person decides by your write-off policy.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `ar_age` | Every open claim with its age, bucket, filing limit and days left, a flag (file_now, past_filing_limit, filed_late, follow_up, waiting, unbilled, patient_balance) and the next step, ranked by balance and age; aging gr… | runs |
| `ar_filing_limit` | The filing limit Fairclaim AR Aging uses for one payer and where it comes from (config, memory or default). | runs |
| `ar_explain` | Show one open claim with its age, filing limit and why it got its flag. | runs |
| `ar_write_report` | Write ar.csv (the ranked follow-up queue with blank owner, call reference and notes columns) and ar.html (aging grid by payer) into out_dir (default remedy-out/ar). | runs |
| `ar_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `ar_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `ar_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `ar_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `write_off_post` | Fairclaim AR Aging never writes off balances; a person decides by your write-off policy. | refused |
| `payer_call` | Fairclaim AR Aging never calls or messages payers. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Open A/R (`ar`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `claim_id` (required) | text | Claim ID, Claim Number, Claim #, Claim No, Encounter ID, Visit ID | - |
| `patient_name` | text (masked) | Patient, Patient Name, Pt Name | Patient, Patient, 患者名, 患者 |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insurance ID, Policy Number | - |
| `payer` | text | Payer, Primary Payer, Insurance, Insurance Name, Carrier, Primary Insurance | Kostenträger, Payeur, 保険者, 付款方 |
| `provider` | text | Provider, Rendering Provider, Provider Name | Leistungserbringer, Prestataire, 医師, 医生 |
| `date_of_service` | date | DOS, Date of Service, Service Date, From Date, Visit Date | Leistungsdatum, Date de soins, 診療日, 服务日期 |
| `submitted_date` | date | Submitted, Submit Date, Date Submitted, Billed Date, First Billed, Claim Date | - |
| `last_activity` | date | Last Activity, Last Follow-up, Last Followup, Last Touched, Last Worked, Follow Up Date | - |
| `charge` | amount | Charge, Charges, Billed, Total Charge, Claim Amount | Betrag, Montant, 請求額, 金额 |
| `balance` (required) | amount | Balance, Outstanding, Open Balance, Insurance Balance, Ins Balance, Claim Balance | Saldo, Solde, 残高, 余额 |
| `status` | text | Status, Claim Status, Current Status | Status, Statut, ステータス, 状态 |
| `responsible` | text | Responsible Party, Responsibility, Bucket, Financial Responsibility, Balance Type | - |

Named exports recognised by their column names:

| System | Export | Recognised by | Layout checked against vendor docs |
|---|---|---|---|
| athenaOne | Claim worklist export (CSV) | Claim ID, Primary Payer, Claim Status, Outstanding | no |
| eClinicalWorks | Claim status report (Excel) | Claim No, Insurance Name, Claim Status, Balance | no |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates, the pfs.data.cms.gov column lists and Open Dental's published procedure log fields). The NCCI, MUE and RVU file headers and the other practice-management and clearinghouse layouts were written from knowledge of the export and were not checked; where the vendor's public help says something about the export, the layout's note says what. None was tested against a live account.

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-ar-aging inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-ar-aging can remember facts about your setup so the next run does not have to be told again. `ar_learn` only proposes a fact; it changes nothing until a named person accepts it with `ar_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `timely_filing` | uses this limit when it is shorter than the config's; the shortest limit always wins, so memory can only make the warning come sooner. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-ar-aging memory list
fairclaim-ar-aging memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-ar-aging memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-ar-aging demo
npx -y fairclaim-ar-aging mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-ar-aging": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-ar-aging",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-ar-aging -- npx -y fairclaim-ar-aging mcp --root .`, or install the `fairclaim-ar-aging` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-ar-aging approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-ar-aging approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-ar-aging kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-ar-aging tools                 # every tool, its policy and arguments
fairclaim-ar-aging sources               # the columns each input is read from
fairclaim-ar-aging inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-ar-aging call ar_age '{"ar":"<ar>"}'
fairclaim-ar-aging eval                  # the private eval cases on the fictional fixtures
fairclaim-ar-aging demo
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
