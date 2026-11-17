# Angelica of Prices (`angelica-of-prices`)

Hospital price transparency without the guesswork: checks a machine-readable file against the CMS tall CSV template v3.0 (general headers, attestation, code pairs, valid values and the twelve conditional rules), compares it with the chargemaster, and computes the median, 10th and 90th percentile allowed amounts and counts from 835s the way CMS describes. No patient data is needed; remittance patients are masked anyway.

**Angelica never posts the file to your website; a person does, after the attester signs off. Angelica never changes prices in the chargemaster.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y angelica-of-prices demo
npx -y angelica-of-prices mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y angelica-of-prices demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Angelica of Prices demo (fictional hospital) in <demo folder>

▶ Check the v3.0 machine-readable file
  status: executed  decision: allow
  Example Community Hospital (fictional): template 3.0.0, last updated 2026-01-02, 13 data row(s), 3 payer/plan pair(s). 11 error(s), 2 warning(s) (required_code 1, type_2_npi 1, number_format 1, rule_4 1, rule_7 1, rule_10 1). Chargemaster: 1 item(s) missing from the file, 1 gross charge(s) differ.
    error         required_code    74177 is on your required list (CMS shoppable: CT abdomen and pelvis with contrast) but is not in the file.
    error      2  type_2_npi       NPI 2990000013 fails the check digit.
    error      7  number_format    standard_charge|negotiated_dollar "$455.00" must be a plain number (no $, % or thousands separator).
    error      8  rule_4           Methodology "other" needs an explanation in additional_generic_notes.
    error      8  rule_7           A percentage or algorithm needs the count of allowed amounts.
    error      9  rule_10          An NDC needs the drug unit and drug type of measurement.
    error     10  setting          Setting "Outpatient surgery" is not inpatient, outpatient or both.
    error     10  rule_6           A negotiated dollar amount needs the de-identified minimum and maximum.
    error     13  rule_1           Example Health Plan is named but no negotiated dollar amount, percentage or algorithm is given.
    error     14  count_format     Count "1,204" must be 0, "1 through 10", or a whole number of 11 or more with no thousands separator.
    error     15  code_type        Code type "CPT4" is not a CMS valid value.
    warning   12  duplicate        Same item, setting, payer and plan as row 4.
    warning   16  cash_over_gross  Cash price 12.00 is above the gross charge 10.00.

▶ Check last year's v2.2 file
  status: executed  decision: allow
  Example Community Hospital (fictional): template 2.2.0, last updated 2025-06-30, 1 data row(s), 1 payer/plan pair(s). 1 error(s), 1 warning(s) (placeholder 1, version 1).

▶ Allowed amounts from 12 months of 835s
  status: executed  decision: allow
  3 payer/code row(s) from 21 remittance line(s), 2025-04-01 to 2026-03-31 (left out: 1 reversal(s), 1 $0 line(s), 1 outside the period).
    Example Health Plan      70450  count 1 through 10  10th 615  median 615  90th 640
    Example Health Plan      99213  count 14            10th 92  median 100  90th 110
    Sample Mutual Insurance  99213  count 1 through 10  10th 85  median 90  90th 93

▶ Write the file check
  status: executed  decision: allow
  File check written: Example Community Hospital (fictional): template 3.0.0, last updated 2026-01-02, 13 data row(s), 3 payer/plan pair(s). 11 error(s), 2 warning(s) (required_code 1, type_2_npi 1, number_format 1, rule_4 1, rule_7 1, rule_10 1). Chargemaster: 1 item(s) missing from the file, 1 gross charge(s) differ. Files: remedy-out/angelica/angelica-file-check.csv, remedy-out/angelica/angelica-file-check.html.

▶ Agent tries to publish the file
  status: blocked  decision: block
  reason: Angelica never posts the file to your website; a person does, after the attester signs off.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `angelica_check_file` | Every error and warning with its row, column and CMS rule: general headers, attestation, placeholders, column headers, code and code type pairs, valid values, number formats, the conditional rules, file age and requir… | runs |
| `angelica_allowed_amounts` | Median, 10th and 90th percentile allowed amounts and the count per payer, plan and code from remittances, using the CMS rule (next highest observed amount between two values; $0 and reversals left out; count as 0, "1 … | runs |
| `angelica_write_report` | Write angelica-file-check.csv (one row per issue with blank owner and fixed columns) and angelica-file-check.html (with the chargemaster comparison) into out_dir (default remedy-out/angelica). | runs |
| `angelica_write_allowed` | Write angelica-allowed-amounts.csv with the CMS column names (payer_name, plan_name, code, code_type, median_amount, 10th_percentile, 90th_percentile, count) and an HTML page into out_dir (default remedy-out/angelica). | runs |
| `angelica_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `angelica_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `angelica_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `angelica_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `mrf_publish` | Angelica never posts the file to your website; a person does, after the attester signs off. | refused |
| `chargemaster_update` | Angelica never changes prices in the chargemaster. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Machine-readable file (CMS tall CSV; read row by row, three header rows) (`file`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `description` (required) | text | description | Beschreibung, Description, 摘要, 摘要 |
| `setting` | text | setting | - |
| `gross` | amount | standard_charge\|gross | - |
| `discounted_cash` | amount | standard_charge\|discounted_cash | - |
| `payer_name` | text | payer_name | - |
| `plan_name` | text | plan_name | - |

Named exports recognised by their column names:

| System | Export | Recognised by | Layout checked against vendor docs |
|---|---|---|---|
| CMS hospital price transparency | Machine-readable file, CSV tall template v3.0 | description, setting, standard_charge\|gross, median_amount, 10th_percentile | against github.com/CMSgov/hospital-price-transparency V3.0.0_Tall_CSV_Format_Template.csv and UPDATE_GUIDE.md on 2026-11-16 |
| CMS hospital price transparency | Machine-readable file, CSV tall template v2.x | description, setting, standard_charge\|gross, standard_charge\|discounted_cash, payer_name | against github.com/CMSgov/hospital-price-transparency V2.0.0_Tall_CSV_Format_Template.csv on 2026-11-16 |

Where a layout says "checked", its column names were compared with the publisher's template or documentation on that date (the CMS price-transparency templates, the pfs.data.cms.gov column lists and Open Dental's published procedure log fields). The NCCI, MUE and RVU file headers and the other practice-management and clearinghouse layouts were written from knowledge of the export and were not checked; where the vendor's public help says something about the export, the layout's note says what. None was tested against a live account.

### Chargemaster (`chargemaster`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `code` (required) | text | Code, CPT, HCPCS, CPT/HCPCS, Procedure Code, Charge Code | - |
| `description` | text | Description, Charge Description, Item Description, Service | Beschreibung, Description, 摘要, 摘要 |
| `price` (required) | amount | Price, Charge, Gross Charge, Standard Charge, Unit Price, Amount | - |
| `revenue_code` | text | Revenue Code, Rev Code, UB Rev Code | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx angelica-of-prices inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

angelica-of-prices can remember facts about your setup so the next run does not have to be told again. `angelica_learn` only proposes a fact; it changes nothing until a named person accepts it with `angelica_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `required_code` | adds an error when the code is missing from the file. It only adds a check. |
| `note` | nothing (shown by recall only) |

```bash
angelica-of-prices memory list
angelica-of-prices memory accept MEM-1a2b3c4d5e6f --as "Your Name"
angelica-of-prices memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y angelica-of-prices demo
npx -y angelica-of-prices mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "angelica-of-prices": {
      "command": "npx",
      "args": [
        "-y",
        "angelica-of-prices",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add angelica-of-prices -- npx -y angelica-of-prices mcp --root .`, or install the `angelica-of-prices` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `angelica-of-prices approve <id> --as "Your Name"` (or on the local approvals page, `angelica-of-prices approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`angelica-of-prices kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
angelica-of-prices tools                 # every tool, its policy and arguments
angelica-of-prices sources               # the columns each input is read from
angelica-of-prices inspect <file>        # how a file would be read (names and shapes, never values)
angelica-of-prices call angelica_check_file '{"file":"<file>"}'
angelica-of-prices eval                  # the private eval cases on the fictional fixtures
angelica-of-prices demo
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
