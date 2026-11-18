# Fairclaim Payment Plans (`fairclaim-payment-plans`)

Tracks patient payment plans against your policy: installments due after a grace period, missed payments and plans to review for default, plans paid off or ahead, monthly amounts and terms outside your policy, plan options for a new balance, and a draft plan agreement for a person to send. Patient identifiers are masked before results reach the model.

**Fairclaim Payment Plans never charges cards or bank accounts. Fairclaim Payment Plans never cancels plans or tells a patient a plan has ended; a person decides.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-payment-plans demo
npx -y fairclaim-payment-plans mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-payment-plans demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Payment Plans demo (fictional practice and guarantors) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-payment-plans-demo-ksyneV

▶ Review payment plans
  status: executed  decision: allow
  6 plan(s): default_review 1, missed_payment 1, current 2, ahead 1, paid_off 1. 550 behind, 4110 left to collect. 1 plan(s) outside your policy.
    default_review  PL3  4 installment(s) missed (400 behind). Your policy reviews a plan after 2: call the patient before anything else; a person decides.
    missed_payment  PL2  1 installment(s) missed (150 behind) after a 10-day grace period: send a friendly reminder.
    current         PL1  Current.
    current         PL5  Current. Policy: Monthly 20 is below your minimum 25. Term of 120 months is over your 24-month limit for this balance.
    ahead           PL6  Ahead by 100.
    paid_off        PL4  Paid in full: close the plan and send a paid-in-full letter.

▶ Options for a new 1,250 balance
  status: executed  decision: allow
  1250: 3 x 416.67, 6 x 208.34, 12 x 104.17 (minimum 25, up to 12 months).

▶ Draft a 12-month agreement
  status: executed  decision: allow  (auto)
  plan agreement demo-1250 drafted for 1250 with 5 open marker(s) ([MISSING: guarantor name and account], [CHECK: keep it that way or have counsel review lending rules], [CHECK: matches your written policy], [TO CONFIRM: card or bank authorization, or pay by statement], [MISSING: guarantor signature and date]). Nothing was sent.

▶ Agent tries to charge a card
  status: blocked  decision: block
  reason: Fairclaim Payment Plans never charges cards or bank accounts.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `plans_review` | Each plan with installments due, expected and actual paid, missed installments, remaining balance, status (default_review, missed_payment, current, ahead, paid_off) and policy issues. | runs |
| `plans_options` | Monthly amounts for 3 to 60 months that fit your minimum payment and term limit for this balance. | runs |
| `plans_draft_plan_agreement` | Write a draft plan agreement for one balance: monthly amount, number of payments, first due date and the last payment, within your policy. | asks first (Auto can be opted in) |
| `plans_request_send` | After one named human click (even in Auto), record that the reviewed plan agreement draft is approved in plan_agreement-requests.csv. | one named click, even in Auto (`binding_send`) |
| `plans_write_report` | Write plans.csv (one row per plan with blank owner and outcome columns) and plans.html into out_dir (default remedy-out/plans). | runs |
| `plans_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `plans_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `plans_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `plans_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `card_charge` | Fairclaim Payment Plans never charges cards or bank accounts. | refused |
| `plan_cancel` | Fairclaim Payment Plans never cancels plans or tells a patient a plan has ended; a person decides. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Payment plans (`plans`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `plan_id` (required) | text | Plan ID, Plan #, Plan Number, Arrangement ID | - |
| `account` | text (masked) | Account, Account Number, Acct #, Guarantor Account | - |
| `patient_name` | text (masked) | Guarantor, Guarantor Name, Patient, Patient Name | Patient, Patient, 患者名, 患者 |
| `start_date` | date | Start Date, Plan Start, First Payment Date, Created | - |
| `original_balance` (required) | amount | Original Balance, Plan Balance, Plan Amount, Amount Financed, Starting Balance | - |
| `monthly_amount` (required) | amount | Monthly Amount, Monthly Payment, Installment, Payment Amount, Monthly | - |
| `day_of_month` | number | Due Day, Day of Month, Payment Day | - |
| `autopay` | text | Autopay, Auto Pay, Card on File | - |

### Plan payments (`payments`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `plan_id` | text | Plan ID, Plan #, Plan Number | - |
| `account` | text (masked) | Account, Account Number, Acct # | - |
| `date` | date | Payment Date, Date, Posted, Posted Date | - |
| `amount` (required) | amount | Amount, Payment, Paid, Payment Amount | Betrag, Montant, 金額, 金额 |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-payment-plans inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-payment-plans can remember facts about your setup so the next run does not have to be told again. `plans_learn` only proposes a fact; it changes nothing until a named person accepts it with `plans_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `plan_grace` | uses this grace period when it is shorter than the config's, so missed payments show sooner. It never lengthens the grace period. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-payment-plans memory list
fairclaim-payment-plans memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-payment-plans memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-payment-plans demo
npx -y fairclaim-payment-plans mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-payment-plans": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-payment-plans",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-payment-plans -- npx -y fairclaim-payment-plans mcp --root .`, or install the `fairclaim-payment-plans` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-payment-plans approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-payment-plans approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-payment-plans kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-payment-plans tools                 # every tool, its policy and arguments
fairclaim-payment-plans sources               # the columns each input is read from
fairclaim-payment-plans inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-payment-plans call plans_review '{"plans":"<plans>","payments":"<payments>"}'
fairclaim-payment-plans eval                  # the private eval cases on the fictional fixtures
fairclaim-payment-plans demo
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
