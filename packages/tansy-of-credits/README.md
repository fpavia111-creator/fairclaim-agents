# Tansy of Credits (`tansy-of-credits`)

Works the credit balance report: tells patient credits from payer overpayments, counts days against each payer's refund deadline (60 days from identification for Medicare by default), finds credits that should go to an open balance first or are nearing unclaimed-property age, and drafts each refund for a person to approve. Patient identifiers are masked before results reach the model.

**Tansy never issues refunds or moves money; a person pays the approved refund. Tansy never posts adjustments or moves a credit between accounts.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y tansy-of-credits demo
npx -y tansy-of-credits mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y tansy-of-credits demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Tansy of Credits demo (fictional practice, payers and patients) in <demo folder>

▶ Review credit balances and refund deadlines
  status: executed  decision: allow
  8 credit(s) totalling 523.5: patient 168.5, payer 355. refund_overdue 1, refund_now 1, escheat_risk 1, apply_to_balance 1, refund 3, small_credit 1. 85 is past a refund deadline.
    refund_overdue        85 to Test Medicare Contractor   Refund deadline 2026-02-08 passed 7 day(s) ago (60 days from identification for Medicare and Medicaid). Refund now and record why it was late.
    refund_now           120 to Example Health Plan        9 day(s) left to refund (deadline 2026-02-24).
    escheat_risk          75 to patient                    Credit is 1021 days old; unclaimed-property rules may apply at 1095 days. Contact the patient or report it as your state requires.
    apply_to_balance      40 to patient                    The account owes 25 elsewhere: apply the credit there first if your policy and the patient allow, then refund what is left.
    refund                60 to Sample Mutual Insurance    Refund to Sample Mutual Insurance; 50 day(s) left.
    refund                90 to Demo Medicaid Plan         Refund to Demo Medicaid Plan; 55 day(s) left.
    refund                50 to patient                    Refund to the patient (or the card used).
    small_credit         3.5 to patient                    Under your small-credit level (5): follow your policy (hold for the next visit or refund on request).

▶ Draft the overdue Medicare refund
  status: executed  decision: allow  (auto)
  refund ACCT-874372b5-T1001 drafted for 85 with 3 open marker(s) ([TO CONFIRM: refund address or the payer's offset instructions], [CHECK: the credit is real: no unposted payment, adjustment or pending appeal on the account], [CHECK: whether the payer wants a check or an offset on a future remittance]). Nothing was sent.

▶ Approving a refund needs a named person, even in Auto
  status: needs_approval  decision: ask
  reason: move_money stays one-click, even in Auto

▶ Agent tries to issue the refund itself
  status: blocked  decision: block
  reason: Tansy never issues refunds or moves money; a person pays the approved refund.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `tansy_review` | Every credit with who it belongs to, the refund deadline and days left, and an action: refund_overdue, refund_now, escheat_risk, apply_to_balance, refund, small_credit. | runs |
| `tansy_draft_refund` | Write a draft refund for one credit: who it goes to, the amount, the claim and service date, why, and what a person must check first. | asks first (Auto can be opted in) |
| `tansy_request_refund` | After one named human click (even in Auto), record that the reviewed refund draft is approved in refund-requests.csv. | one named click, even in Auto (`move_money`) |
| `tansy_write_report` | Write tansy-credits.csv (one row per credit with blank owner, decision and check number columns) and tansy-credits.html into out_dir (default remedy-out/tansy). | runs |
| `tansy_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `tansy_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `tansy_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `tansy_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `refund_issue` | Tansy never issues refunds or moves money; a person pays the approved refund. | refused |
| `credit_adjust` | Tansy never posts adjustments or moves a credit between accounts. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Credit balances (`credits`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `account` (required) | text (masked) | Account, Account Number, Acct #, Patient Account, Guarantor Account, Account No | - |
| `patient_name` | text (masked) | Patient, Patient Name, Guarantor, Guarantor Name | Patient, Patient, 患者名, 患者 |
| `claim_id` | text | Claim #, Claim ID, Claim Number, Encounter, Visit ID | - |
| `payer` | text | Payer, Insurance, Carrier, Plan, Payer Name | Kostenträger, Payeur, 保険者, 付款方 |
| `payment_source` | text | Payment Source, Source, Paid By, Payment Type, Payment Method, From | - |
| `responsible` | text | Responsible Party, Responsibility, Credit Type, Type | - |
| `date_of_service` | date | DOS, Date of Service, Service Date | Leistungsdatum, Date de soins, 診療日, 服务日期 |
| `amount` (required) | amount | Credit, Credit Amount, Credit Balance, Amount, Overpayment, Balance | Betrag, Montant, 金額, 金额 |
| `credit_date` | date | Credit Date, Date, Payment Date, Posted Date, Date Created | - |
| `identified_date` | date | Identified, Identified Date, Date Identified, Found On | - |
| `open_debit` | amount | Open Debit, Other Balance, Account Balance Due, Amount Due Elsewhere, Open Balance | - |
| `reason` | text | Reason, Note, Cause, Comment | Grund, Motif, 理由, 原因 |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx tansy-of-credits inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

tansy-of-credits can remember facts about your setup so the next run does not have to be told again. `tansy_learn` only proposes a fact; it changes nothing until a named person accepts it with `tansy_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_refund_rule` | uses this deadline when it is shorter than the config's or the Medicare default. Memory can only bring a deadline closer. |
| `note` | nothing (shown by recall only) |

```bash
tansy-of-credits memory list
tansy-of-credits memory accept MEM-1a2b3c4d5e6f --as "Your Name"
tansy-of-credits memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y tansy-of-credits demo
npx -y tansy-of-credits mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "tansy-of-credits": {
      "command": "npx",
      "args": [
        "-y",
        "tansy-of-credits",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add tansy-of-credits -- npx -y tansy-of-credits mcp --root .`, or install the `tansy-of-credits` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `tansy-of-credits approve <id> --as "Your Name"` (or on the local approvals page, `tansy-of-credits approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`tansy-of-credits kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
tansy-of-credits tools                 # every tool, its policy and arguments
tansy-of-credits sources               # the columns each input is read from
tansy-of-credits inspect <file>        # how a file would be read (names and shapes, never values)
tansy-of-credits call tansy_review '{"credits":"<credits>"}'
tansy-of-credits eval                  # the private eval cases on the fictional fixtures
tansy-of-credits demo
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
