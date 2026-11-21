# Fairclaim Patient Statements (`fairclaim-patient-statements`)

Plans each patient statement cycle: who gets a first, second or final statement, who is held (insurance still pending, payment plan, dispute, estate or bankruptcy, hardship, bad address, small balance, recent payment) and who reaches collections review, and drafts a plain-language statement for a person to send. Patient identifiers are masked before results reach the model.

**Fairclaim Patient Statements never mails, emails or texts patients; your statement vendor or a person sends approved statements. Fairclaim Patient Statements never sends accounts to a collection agency or credit bureau.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-patient-statements demo
npx -y fairclaim-patient-statements mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-patient-statements demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Patient Statements demo (fictional practice and guarantors) in <demo folder>

▶ Plan the statement run
  status: executed  decision: allow
  13 account(s) with a balance: 4 statement(s) to send (535), 8 held, 1 for collections review. final_notice 1, collections_review 1, second_statement 1, first_statement 2, hold:on_payment_plan 1, hold:recent_payment 1, hold:legal_hold 1, hold:not_due 1, hold:bad_address 1, hold:dispute_hold 1, hold:insurance_pending 1, hold:small_balance 1.
    final_notice               240  Final notice: say plainly what happens next and how to ask for help.
    collections_review         310  Final notice sent 49 day(s) ago with no payment. A person decides: check financial assistance first, then your collections policy and current credit-reporting rules.
    second_statement            85  Statement 2.
    first_statement            120  Statement 1.
    first_statement             90  Statement 1.
    hold:on_payment_plan       400  On a payment plan: the plan sends its own reminders.
    hold:recent_payment        220  Paid 8 day(s) ago. Paid recently: skip this cycle.
    hold:legal_hold            180  Estate, bankruptcy or attorney on file: stop statements and route to the manager.
    hold:not_due               130  Last statement 10 day(s) ago; next after 28.
    hold:bad_address            95  Mail came back or the address is marked bad: fix it before printing.
    hold:dispute_hold           75  The patient disputes the bill: answer the dispute before another statement.
    hold:insurance_pending      60  150 is still with insurance. Part of the balance still sits with insurance: wait for the payer before billing the patient.
    hold:small_balance           3  Balance under your minimum of 5.

▶ Draft the final notice
  status: executed  decision: allow  (auto)
  statement ACCT-f97605eb drafted for 240 with 3 open marker(s) ([CHECK: mailing address on file], [TO CONFIRM: due date], [ATTACH: itemized bill]). Nothing was sent.

▶ Agent tries to send an account to collections
  status: blocked  decision: block
  reason: Fairclaim Patient Statements never sends accounts to a collection agency or credit bureau.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `statements_cycle` | Each account with a balance: the action (first_statement, second_statement, final_notice, collections_review, hold), the hold reason and the message. | runs |
| `statements_draft_statement` | Write a plain-language statement for one account at its stage (first, second or final), with the balance, how to pay and your financial assistance sentence. | asks first (Auto can be opted in) |
| `statements_request_send` | After one named human click (even in Auto), record that the reviewed statement draft is approved in statement-requests.csv. | one named click, even in Auto (`binding_send`) |
| `statements_write_report` | Write statements.csv (one row per account with blank owner and sent columns) and statements.html into out_dir (default remedy-out/statements). | runs |
| `statements_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `statements_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `statements_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `statements_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `statement_send` | Fairclaim Patient Statements never mails, emails or texts patients; your statement vendor or a person sends approved statements. | refused |
| `collections_assign` | Fairclaim Patient Statements never sends accounts to a collection agency or credit bureau. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Patient balances (`accounts`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `account` (required) | text (masked) | Account, Account Number, Acct #, Guarantor Account, Patient Account, Account No | - |
| `patient_name` | text (masked) | Guarantor, Guarantor Name, Patient, Patient Name, Responsible Party | Patient, Patient, 患者名, 患者 |
| `balance` (required) | amount | Patient Balance, Balance, Amount Due, Pt Balance, Guarantor Balance, Self-Pay Balance | Saldo, Solde, 残高, 余额 |
| `insurance_pending` | amount | Insurance Pending, Insurance Balance, Ins Balance, Pending Insurance | - |
| `statements_sent` | number | Statements Sent, Statement Count, # Statements, Dunning Level, Statements | - |
| `last_statement` | date | Last Statement, Last Statement Date, Last Billed, Last Stmt | - |
| `last_payment` | date | Last Payment, Last Payment Date, Last Pmt Date | - |
| `on_plan` | text | Payment Plan, On Plan, Plan Active, Installment Plan | - |
| `address_status` | text | Address Status, Bad Address, Mail Returned, Returned Mail | - |
| `flags` | text | Flags, Account Flags, Alerts, Hold Reason, Status | - |
| `notes` | text | Notes, Comments, Last Note | - |
| `oldest_service` | date | Oldest DOS, Oldest Service Date, First DOS, Oldest Date of Service | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-patient-statements inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-patient-statements can remember facts about your setup so the next run does not have to be told again. `statements_learn` only proposes a fact; it changes nothing until a named person accepts it with `statements_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `hold_word` | holds statements for accounts whose flags or notes contain the word. It only adds holds; it never sends a statement the built-in holds would stop. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-patient-statements memory list
fairclaim-patient-statements memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-patient-statements memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-patient-statements demo
npx -y fairclaim-patient-statements mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-patient-statements": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-patient-statements",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-patient-statements -- npx -y fairclaim-patient-statements mcp --root .`, or install the `fairclaim-patient-statements` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-patient-statements approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-patient-statements approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-patient-statements kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-patient-statements tools                 # every tool, its policy and arguments
fairclaim-patient-statements sources               # the columns each input is read from
fairclaim-patient-statements inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-patient-statements call statements_cycle '{"accounts":"<accounts>"}'
fairclaim-patient-statements eval                  # the private eval cases on the fictional fixtures
fairclaim-patient-statements demo
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
