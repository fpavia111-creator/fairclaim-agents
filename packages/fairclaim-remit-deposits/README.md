# Fairclaim Remit Deposits (`fairclaim-remit-deposits`)

Matches 835 remittances (or ERA exports) to bank deposits: by trace number first, then exact amount and date. Lists payments with no deposit, deposits with no remittance, amount differences and provider-level adjustments (recoveries, interest, levies) with how to post them, and drafts the payer inquiry for a person to send.

**Fairclaim Remit Deposits never posts payments in the practice-management system; your payment poster does. Fairclaim Remit Deposits never moves money.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-remit-deposits demo
npx -y fairclaim-remit-deposits mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-remit-deposits demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Remit Deposits demo (fictional practice, payers and bank lines) in C:\Users\fpavi\AppData\Local\Temp\fairclaim-remit-deposits-demo-lx2Tpr

▶ Match five remittances to the bank
  status: executed  decision: allow
  5 payment(s) totalling 636.68: 2 matched to deposits (402.6), 1 with no deposit (74.88), 1 amount mismatch(es) (10). 1 deposit(s) without a remittance (512.34).
    matched            EFT20260205A   Example Health Plan           192.1 192.1
    matched_by_amount  EFT20260205B   Sample Mutual Insurance       210.5 210.5
    amount_mismatch    EFT20260206C   Demo Medicaid Plan            159.2 149.2
    no_deposit         00184412       Test Medicare Contractor      74.88 
    no_money_expected  EFT20260207E   Example Health Plan               0 

▶ Explain provider-level adjustments
  status: executed  decision: allow
  2 provider-level adjustment(s): 40 taken from payments, 2.1 added.

▶ Draft an inquiry for the paper check that never arrived
  status: executed  decision: allow  (auto)
  inquiry 00184412 drafted for 74.88 with 3 open marker(s) ([MISSING: payee NPI], [MISSING: last 4 digits], [MISSING: name and phone]). Nothing was sent.

▶ Approving it is one named click, even in Auto
  status: needs_approval  decision: ask
  reason: binding_send stays one-click, even in Auto

▶ Write the reconciliation (Spanish page)
  status: executed  decision: allow
  Reconciliation written: 5 payment(s) totalling 636.68: 2 matched to deposits (402.6), 1 with no deposit (74.88), 1 amount mismatch(es) (10). 1 deposit(s) without a remittance (512.34). Files: remedy-out/remits/remits-reconciliation.csv, remedy-out/remits/remits-reconciliation.html.

▶ Agent tries to post the payment itself
  status: blocked  decision: block
  reason: Fairclaim Remit Deposits never posts payments in the practice-management system; your payment poster does.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `remits_match` | Match each remittance payment to a bank deposit (trace number, then exact amount within the date window) and list the unmatched on both sides with what to do. | runs |
| `remits_plb` | List the PLB (provider-level) adjustments in the 835s: reason, meaning, reference, whether it reduced or added to the payment, and how to post it. | runs |
| `remits_write_report` | Write remits-reconciliation.csv (one row per payment and per unmatched deposit, with blank owner and notes columns) and remits-reconciliation.html into out_dir (default remedy-out/remits). | runs |
| `remits_draft_inquiry` | Write a draft letter to a payer about one remittance with no deposit (pass its trace number) or one deposit with no remittance (pass its deposit id). | asks first (Auto can be opted in) |
| `remits_request_send` | After one named human click (even in Auto), record that the reviewed inquiry draft is approved in inquiry-requests.csv. | one named click, even in Auto (`binding_send`) |
| `remits_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `remits_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `remits_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `remits_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `payment_post` | Fairclaim Remit Deposits never posts payments in the practice-management system; your payment poster does. | refused |
| `bank_transfer` | Fairclaim Remit Deposits never moves money. | refused |

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

### Bank deposits (`deposits`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `date` (required) | date | Posting Date, Date, Deposit Date, Transaction Date, Post Date, Value Date | Datum, Date, 日付, 日期 |
| `amount` (required) | amount | Amount, Credit, Deposit Amount, Credit Amount, Deposits, Transaction Amount | Betrag, Montant, 金額, 金额 |
| `description` | text | Description, Memo, Details, Narrative, Transaction Description, Payee | Beschreibung, Description, 摘要, 摘要 |
| `trace_number` | text | Trace Number, Reference, TRN, Addenda, EFT Trace, Reference Number | - |
| `payer` | text | Originator, Company Name, Originator Name, Payer, Company | - |
| `deposit_id` | text | Transaction ID, Deposit ID, ID, Bank Reference | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-remit-deposits inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-remit-deposits can remember facts about your setup so the next run does not have to be told again. `remits_learn` only proposes a fact; it changes nothing until a named person accepts it with `remits_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_deposit_name` | labels a deposit that has no remittance with the payer it likely came from, so the inquiry goes to the right place. It never matches a deposit to a payment. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-remit-deposits memory list
fairclaim-remit-deposits memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-remit-deposits memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-remit-deposits demo
npx -y fairclaim-remit-deposits mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-remit-deposits": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-remit-deposits",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-remit-deposits -- npx -y fairclaim-remit-deposits mcp --root .`, or install the `fairclaim-remit-deposits` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-remit-deposits approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-remit-deposits approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-remit-deposits kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-remit-deposits tools                 # every tool, its policy and arguments
fairclaim-remit-deposits sources               # the columns each input is read from
fairclaim-remit-deposits inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-remit-deposits call remits_match '{"remits":"<remits>","deposits":"<deposits>"}'
fairclaim-remit-deposits eval                  # the private eval cases on the fictional fixtures
fairclaim-remit-deposits demo
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
