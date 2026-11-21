# Fairclaim Payer Contract Rates (`fairclaim-payer-contract-rates`)

Compares what each payer pays per code against Medicare and each other, weighted by your volume, flags rates below your floor with the yearly gap, keeps a calendar of contract end dates and notice deadlines (auto-renewal traps included), and drafts a rate request for a person to send.

**Fairclaim Payer Contract Rates never signs, accepts or terminates contracts. Fairclaim Payer Contract Rates never sends notices to payers; a person does after legal review.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-payer-contract-rates demo
npx -y fairclaim-payer-contract-rates mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-payer-contract-rates demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Payer Contract Rates demo (made-up payers, rates and contracts) in <demo folder>

▶ Rank payers against Medicare at your volume
  status: executed  decision: allow
  3 payer(s) by percent of Medicare at your volume: Example Health Plan 120%, Sample Mutual Insurance 107.82%, Demo Medicaid Plan 70%. 6 rate(s) below the floor, 91773 a year to reach it. No Medicare amount for: T1015.

▶ Contract renewal calendar
  status: executed  decision: allow
  4 contract(s): notice_window 1, expired 1, renews_automatically 1, no_end_date 1. Next deadline: Sample Mutual Insurance on 2026-04-01.
    notice_window          Sample Mutual Insurance    45 day(s) left to give notice or ask for new rates (deadline 2026-04-01).
    expired                Demo Medicaid Plan         Ended 2025-12-31 and does not renew by itself: check whether you are still in network and at what rates.
    renews_automatically   Example Health Plan        The notice deadline (2025-12-31) has passed; it renews 2026-04-01 on the same terms. Mark the next deadline now.
    no_end_date            Test Medicare Contractor   No end date recorded: check the contract term and notice clause.

▶ Draft a rate request (markers left for a person)
  status: executed  decision: allow  (auto)
  rate request sample-mutual-insurance drafted with 4 open marker(s) ([TO CONFIRM: proposed effective date], [CHECK: the contract section on rate changes and the notice it requires], [MISSING: one or two sentences on access, quality or growth that matter to this payer], [MISSING: name and phone]). Nothing was sent.

▶ Write the comparison with the calendar (Korean page)
  status: executed  decision: allow
  Payer rate comparison written: 3 payer(s) by percent of Medicare at your volume: Example Health Plan 120%, Sample Mutual Insurance 107.82%, Demo Medicaid Plan 70%. 6 rate(s) below the floor, 91773 a year to reach it. No Medicare amount for: T1015. Files: remedy-out/contracts/contracts-rates.csv, remedy-out/contracts/contracts-rates.html.

▶ Agent tries to sign a contract
  status: blocked  decision: block
  reason: Fairclaim Payer Contract Rates never signs, accepts or terminates contracts.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `contracts_rates` | Each payer's rates against Medicare weighted by your volume, the rates below the floor with the yearly gap, and the codes with the widest spread between payers. | runs |
| `contracts_calendar` | Every contract with its end date, notice deadline, days left and status (notice_window, notice_passed, expired, renews_automatically, no_end_date, active) and the next step. | runs |
| `contracts_draft_rate_request` | Write a draft letter asking one payer to raise the rates below your floor, with each code, the current rate, Medicare and the rate asked for, and your volume. | asks first (Auto can be opted in) |
| `contracts_request_send` | After one named human click (even in Auto), record that the reviewed rate request draft is approved in rate_request-requests.csv. | one named click, even in Auto (`binding_send`) |
| `contracts_write_report` | Write contracts-rates.csv (one row per payer and code with blank owner and decision columns) and contracts-rates.html (payer ranking and, with a contract register, the renewal calendar) into out_dir (default remedy-ou… | runs |
| `contracts_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `contracts_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `contracts_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `contracts_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `contract_sign` | Fairclaim Payer Contract Rates never signs, accepts or terminates contracts. | refused |
| `termination_notice_send` | Fairclaim Payer Contract Rates never sends notices to payers; a person does after legal review. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Payer fee schedules (`payer_fees`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `payer` (required) | text | Payer, Payer Name, Insurance, Plan, Carrier | Kostenträger, Payeur, 保険者, 付款方 |
| `code` (required) | text | CPT, Code, Procedure Code, HCPCS, CPT/HCPCS, Proc Code | - |
| `modifier` | text | Modifier, Mod | - |
| `allowed` (required) | amount | Allowed, Contract Rate, Rate, Fee, Allowed Amount, Contracted Amount | Anerkannt, Montant admis, 許容額, 允许金额 |

### Medicare amounts (`medicare`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `code` (required) | text | CPT, Code, HCPCS, Procedure Code | - |
| `modifier` | text | Modifier, Mod | - |
| `amount` (required) | amount | Medicare, Medicare Allowed, Medicare Rate, Non-Facility Price, Amount, Allowed | Betrag, Montant, 金額, 金额 |

### Volumes (`volumes`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `code` (required) | text | CPT, Code, HCPCS, Procedure Code | - |
| `modifier` | text | Modifier, Mod | - |
| `volume` (required) | number | Units, Volume, Count, Units Billed, Times Billed, Annual Units | - |

### Contract register (`contracts`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `payer` (required) | text | Payer, Payer Name, Plan, Carrier | Kostenträger, Payeur, 保険者, 付款方 |
| `effective_date` | date | Effective Date, Start Date, Effective | - |
| `end_date` | date | End Date, Term End, Expiration Date, Expires, Renewal Date | - |
| `auto_renew` | text | Auto Renew, Auto-Renew, Fairstay, Renews Automatically | Automatische Verlängerung, Renouvellement automatique, 自動更新, 自动续费 |
| `notice_days` | number | Notice Days, Notice Period, Termination Notice, Notice (days) | - |
| `escalator_percent` | number | Escalator, Escalator %, Annual Increase, Escalator Percent | - |
| `timely_days` | number | Timely Filing, Timely Filing Days, Filing Limit | - |
| `appeal_days` | number | Appeal Days, Appeal Limit, Appeal Deadline | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-payer-contract-rates inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-payer-contract-rates can remember facts about your setup so the next run does not have to be told again. `contracts_learn` only proposes a fact; it changes nothing until a named person accepts it with `contracts_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_rate_floor` | flags that payer's rates below this percent of Medicare when it is higher than the config floor. It only adds flags; it never lowers a floor. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-payer-contract-rates memory list
fairclaim-payer-contract-rates memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-payer-contract-rates memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-payer-contract-rates demo
npx -y fairclaim-payer-contract-rates mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-payer-contract-rates": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-payer-contract-rates",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-payer-contract-rates -- npx -y fairclaim-payer-contract-rates mcp --root .`, or install the `fairclaim-payer-contract-rates` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-payer-contract-rates approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-payer-contract-rates approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-payer-contract-rates kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-payer-contract-rates tools                 # every tool, its policy and arguments
fairclaim-payer-contract-rates sources               # the columns each input is read from
fairclaim-payer-contract-rates inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-payer-contract-rates call contracts_rates '{"payer_fees":"<payer_fees>","medicare":"<medicare>"}'
fairclaim-payer-contract-rates eval                  # the private eval cases on the fictional fixtures
fairclaim-payer-contract-rates demo
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
