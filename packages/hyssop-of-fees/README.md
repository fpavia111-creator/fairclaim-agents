# Hyssop of Fees (`hyssop-of-fees`)

Prices each code on your fee schedule from the Medicare RVU and GPCI files (RVU x GPCI x conversion factor), finds fees below the Medicare amount (payers pay the lower of fee and allowed), below your target percent of Medicare or above a ceiling, codes with no Medicare price, and drafts a fee update for a person to approve.

**Hyssop never changes the fee schedule in your practice system; a person loads the approved update.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y hyssop-of-fees demo
npx -y hyssop-of-fees mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y hyssop-of-fees demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Hyssop of Fees demo (made-up RVUs and GPCIs, fictional fee schedule) in <demo folder>

▶ Price the fee schedule against Medicare
  status: executed  decision: allow
  10 code(s) priced at ALASKA (CF 33.4009, nonfacility): below_medicare 1, below_target 2, no_fee 1, above_ceiling 1, no_medicare_price 2, no_rvu 1, ok 2. Yearly gap below Medicare 5994, below target 34902 (where volume is given).
    below_medicare     99214  fee     150  Medicare  159.99  93.76%
    below_target       99213  fee     150  Medicare  112.69  133.11%
    below_target       20610  fee     120  Medicare      82  146.34%
    no_fee             99211  fee       -  Medicare   29.43  -%
    above_ceiling      93000  fee      90  Medicare   19.94  451.35%
    no_medicare_price  36415  fee      25  Medicare       -  -%
    no_medicare_price  99385  fee     260  Medicare       -  -%
    no_rvu             J3490  fee      30  Medicare       -  -%
    ok                 99215  fee     400  Medicare  223.29  179.14%
    ok                 97110  fee      80  Medicare   37.64  212.54%

▶ Show the arithmetic for one code
  status: executed  decision: allow
  99214 nonfacility at ALASKA: 159.99 = (1.92 x 1.5 + 1.66 x 1.1 + 0.14 x 0.6) x 33.4009.

▶ Draft the fee update (checks left for a person)
  status: executed  decision: allow  (auto)
  fee update 2026-02-15 drafted with 4 open marker(s) ([TO CONFIRM: effective date], [CHECK: contracts that pay a percent of charges change with this update], [CHECK: self-pay prices and good-faith estimates use these fees], [CHECK: the conversion factor and GPCIs are for the year you bill in]). Nothing was sent.

▶ Approving it while checks are open is refused
  status: needs_approval  decision: ask
  reason: go_live stays one-click, even in Auto

▶ Agent tries to load fees into the practice system
  status: blocked  decision: block
  reason: Hyssop never changes the fee schedule in your practice system; a person loads the approved update.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `hyssop_review` | Every code on the fee schedule with its Medicare amount, percent of Medicare, target fee, status (below_medicare, below_target, no_fee, above_ceiling, no_medicare_price, no_rvu, ok), the gap per unit and per year. | runs |
| `hyssop_price` | The Medicare amount for one code in one locality and setting, with the RVUs, GPCIs, conversion factor and the arithmetic. | runs |
| `hyssop_explain` | One code from the review with why it got its status. | runs |
| `hyssop_draft_fee_update` | Write a draft fee update: every fee below Medicare or below the target, the proposed new fee (rounded up to a whole dollar) and the yearly effect where volume is given. | asks first (Auto can be opted in) |
| `hyssop_request_go_live` | After one named human click (even in Auto), record that the reviewed fee update draft is approved in fee_update-requests.csv. | one named click, even in Auto (`go_live`) |
| `hyssop_write_report` | Write hyssop-fees.csv (one row per code with blank owner and decision columns) and hyssop-fees.html into out_dir (default remedy-out/hyssop). | runs |
| `hyssop_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `hyssop_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `hyssop_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `hyssop_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `fee_schedule_publish` | Hyssop never changes the fee schedule in your practice system; a person loads the approved update. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Fee schedule (`fees`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `code` (required) | text | CPT, Code, Procedure Code, HCPCS, CPT/HCPCS, Proc Code | - |
| `modifier` | text | Modifier, Mod | - |
| `description` | text | Description, Procedure, Service, Short Description | Beschreibung, Description, 摘要, 摘要 |
| `fee` (required) | amount | Fee, Charge, Standard Charge, Price, Gross Charge, Amount | - |
| `volume` | number | Volume, Units Billed, Units Last Year, Annual Units, Count, Times Billed | - |

### Medicare RVU file (`rvu`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `code` (required) | text | HCPCS, hcpc, HCPCS Code, CPT, Code | - |
| `modifier` | text | MOD, modifier, Modifier | - |
| `description` | text | DESCRIPTION, sdesc, Short Description, Description | Beschreibung, Description, 摘要, 摘要 |
| `status` | text | STATUS CODE, proc_stat, Status Code, Status | - |
| `work_rvu` | number | WORK RVU, rvu_work, Work RVU, Work | - |
| `pe_nonfac` | number | NON-FAC PE RVU, NON- FAC PE RVU, full_nfac_pe, Non-Facility PE RVU, Fully Implemented Non-Facility PE RVU | - |
| `pe_fac` | number | FACILITY PE RVU, full_fac_pe, Facility PE RVU, Fully Implemented Facility PE RVU | - |
| `mp_rvu` | number | MP RVU, rvu_mp, Malpractice RVU, Mp | - |
| `conv_factor` | number | CONV FACTOR, conv_fact, Conversion Factor | - |

Named exports recognised by their column names:

| System | Export | Recognised by | Layout checked against vendor docs |
|---|---|---|---|
| CMS Physician Fee Schedule | PPRRVU relative value file | HCPCS, MOD, WORK RVU, MP RVU | no |
| CMS Physician Fee Schedule | pfs.data.cms.gov indicators file (CSV) | hcpc, modifier, rvu_work, full_nfac_pe, rvu_mp, conv_fact | against pfs.data.cms.gov indicators2026-09-01.csv column list on 2026-11-16 |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates, the pfs.data.cms.gov column lists and Open Dental's published procedure log fields). The NCCI, MUE and RVU file headers and the other practice-management and clearinghouse layouts were written from knowledge of the export and were not checked; where the vendor's public help says something about the export, the layout's note says what. None was tested against a live account.

### Medicare GPCI file (`gpci`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `locality` (required) | text | Locality Name, locality_name, Locality, locality, Area | - |
| `work_gpci` | number | PW GPCI, Work GPCI, gpci_work, PW GPCI (with 1.0 Floor), 2026 PW GPCI (with 1.0 Floor) | - |
| `pe_gpci` | number | PE GPCI, gpci_pe, 2026 PE GPCI | - |
| `mp_gpci` | number | MP GPCI, gpci_mp, 2026 MP GPCI | - |

Named exports recognised by their column names:

| System | Export | Recognised by | Layout checked against vendor docs |
|---|---|---|---|
| CMS Physician Fee Schedule | Geographic practice cost index file | Locality Name, PE GPCI, MP GPCI | no |
| CMS Physician Fee Schedule | pfs.data.cms.gov localities file (CSV) | gpci_work, gpci_pe, gpci_mp, locality | against pfs.data.cms.gov localities2026-01-01-2026.csv column list on 2026-11-16 |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates, the pfs.data.cms.gov column lists and Open Dental's published procedure log fields). The NCCI, MUE and RVU file headers and the other practice-management and clearinghouse layouts were written from knowledge of the export and were not checked; where the vendor's public help says something about the export, the layout's note says what. None was tested against a live account.

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx hyssop-of-fees inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

hyssop-of-fees can remember facts about your setup so the next run does not have to be told again. `hyssop_learn` only proposes a fact; it changes nothing until a named person accepts it with `hyssop_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `fee_target` | raises the target percent for those codes when it is higher than the config target. It only adds checks; it never lowers a target. |
| `note` | nothing (shown by recall only) |

```bash
hyssop-of-fees memory list
hyssop-of-fees memory accept MEM-1a2b3c4d5e6f --as "Your Name"
hyssop-of-fees memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y hyssop-of-fees demo
npx -y hyssop-of-fees mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "hyssop-of-fees": {
      "command": "npx",
      "args": [
        "-y",
        "hyssop-of-fees",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add hyssop-of-fees -- npx -y hyssop-of-fees mcp --root .`, or install the `hyssop-of-fees` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `hyssop-of-fees approve <id> --as "Your Name"` (or on the local approvals page, `hyssop-of-fees approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`hyssop-of-fees kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
hyssop-of-fees tools                 # every tool, its policy and arguments
hyssop-of-fees sources               # the columns each input is read from
hyssop-of-fees inspect <file>        # how a file would be read (names and shapes, never values)
hyssop-of-fees call hyssop_review '{"fees":"<fees>","rvu":"<rvu>","gpci":"<gpci>"}'
hyssop-of-fees eval                  # the private eval cases on the fictional fixtures
hyssop-of-fees demo
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
