# Fairclaim Provider Credentialing (`fairclaim-provider-credentialing`)

Keeps provider credentialing and payer enrollment on track: license, DEA, board and malpractice expirations, CAQH re-attestation every 120 days, NPI check digits, enrollments pending too long, denied, not started or not yet effective, and revalidation dates, with a work list and a calendar (.ics) of every due date.

**Fairclaim Provider Credentialing never submits applications or attests in CAQH or payer portals. Only the provider (or their delegate) attests in CAQH.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-provider-credentialing demo
npx -y fairclaim-provider-credentialing mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-provider-credentialing demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim Provider Credentialing demo (fictional providers and payers) in <demo folder>

▶ Credentialing and enrollment tasks
  status: executed  decision: allow
  4 provider(s), 7 enrollment(s): 11 task(s) need action. error 1, expired 1, denied 1, not_started 1, follow_up 1, missing 1, due_soon 5, not_yet_effective 1.
    error              Ruth Vance MD (fictional)    NPI check digit is wrong.
    expired            Felix Brandt DO (fictional)  CAQH re-attestation was due 2025-12-30: re-attest now; payers may stop claims.
    denied             Felix Brandt DO (fictional)  Demo Medicaid Plan: Enrollment denied: read the letter, fix the reason and reapply or appeal.
    not_started        Ines Moreau NP (fictional)   Test Medicare Contractor: Not enrolled and no application sent: claims to this payer will deny (or pay out of network).
    follow_up          Felix Brandt DO (fictional)  Sample Mutual Insurance: Pending 62 days since 2025-12-15: call the payer and record the reference.
    missing            Ines Moreau NP (fictional)   Malpractice insurance: no date on file.
    due_soon           Felix Brandt DO (fictional)  State license expires 2026-02-28 (13 day(s)): start the renewal.
    due_soon           Ines Moreau NP (fictional)   CAQH re-attestation is due 2026-04-19 (63 day(s)): start the renewal.
    due_soon           Alma Reyes MD (fictional)    DEA registration expires 2026-04-30 (74 day(s)): start the renewal.
    due_soon           Alma Reyes MD (fictional)    Test Medicare Contractor: Revalidation due 2026-04-30 (74 day(s); 90-day lead).
    due_soon           Alma Reyes MD (fictional)    CAQH re-attestation is due 2026-05-15 (89 day(s)): start the renewal.
    not_yet_effective  Ines Moreau NP (fictional)   Example Health Plan: Effective 2026-03-01: do not bill this payer for this provider's visits before then.

▶ Write the work list and the due-date calendar
  status: executed  decision: allow
  Credentialing work list and calendar written: 4 provider(s), 7 enrollment(s): 11 task(s) need action. error 1, expired 1, denied 1, not_started 1, follow_up 1, missing 1, due_soon 5, not_yet_effective 1. Files: remedy-out/credentialing/credentialing.csv, remedy-out/credentialing/credentialing.html.

▶ Agent tries to submit an enrollment
  status: blocked  decision: block
  reason: Fairclaim Provider Credentialing never submits applications or attests in CAQH or payer portals.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `credentialing_tasks` | Every document and enrollment with its due date, days left and status (error, expired, denied, not_started, follow_up, missing, due_soon, not_yet_effective, pending, ok). | runs |
| `credentialing_write_report` | Write credentialing.csv (one row per task with blank owner and done columns), credentialing.html and credentialing-due-dates.ics (every future due date with reminders 30 and 7 days before) into out_dir (default remedy… | runs |
| `credentialing_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `credentialing_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `credentialing_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `credentialing_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `enrollment_submit` | Fairclaim Provider Credentialing never submits applications or attests in CAQH or payer portals. | refused |
| `caqh_attest` | Only the provider (or their delegate) attests in CAQH. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### Provider roster (`roster`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `provider` (required) | text | Provider, Provider Name, Name, Clinician, Practitioner | Leistungserbringer, Prestataire, 医師, 医生 |
| `npi` | text | NPI, Individual NPI, Type 1 NPI | - |
| `taxonomy` | text | Taxonomy, Taxonomy Code, Specialty Code | - |
| `license_state` | text | License State, State | - |
| `license_expires` | date | License Expires, License Expiration, State License Expiration, License Exp | - |
| `dea_expires` | date | DEA Expires, DEA Expiration, DEA Exp | - |
| `board_expires` | date | Board Expires, Board Certification Expiration, Board Cert Exp | - |
| `malpractice_expires` | date | Malpractice Expires, Malpractice Expiration, COI Expiration, Liability Insurance Expiration | - |
| `caqh_attested` | date | CAQH Attested, CAQH Attestation Date, Last Attestation, CAQH Last Attested | - |

### Payer enrollments (`enrollments`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `provider` (required) | text | Provider, Provider Name, Name | Leistungserbringer, Prestataire, 医師, 医生 |
| `npi` | text | NPI | - |
| `payer` (required) | text | Payer, Plan, Payer Name, Insurance | Kostenträger, Payeur, 保険者, 付款方 |
| `status` | text | Status, Enrollment Status, Credentialing Status | Status, Statut, ステータス, 状态 |
| `submitted_date` | date | Submitted, Date Submitted, Application Sent, Applied | - |
| `effective_date` | date | Effective Date, Effective, Par Date, Participation Date | - |
| `revalidation_due` | date | Revalidation Due, Recredentialing Due, Revalidation Date, Recred Due | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-provider-credentialing inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-provider-credentialing can remember facts about your setup so the next run does not have to be told again. `credentialing_learn` only proposes a fact; it changes nothing until a named person accepts it with `credentialing_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `payer_lead_days` | warns that many days ahead when it is longer than the config lead. It only brings warnings earlier. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-provider-credentialing memory list
fairclaim-provider-credentialing memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-provider-credentialing memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-provider-credentialing demo
npx -y fairclaim-provider-credentialing mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-provider-credentialing": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-provider-credentialing",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-provider-credentialing -- npx -y fairclaim-provider-credentialing mcp --root .`, or install the `fairclaim-provider-credentialing` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-provider-credentialing approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-provider-credentialing approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-provider-credentialing kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-provider-credentialing tools                 # every tool, its policy and arguments
fairclaim-provider-credentialing sources               # the columns each input is read from
fairclaim-provider-credentialing inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-provider-credentialing call credentialing_tasks '{"roster":"<roster>"}'
fairclaim-provider-credentialing eval                  # the private eval cases on the fictional fixtures
fairclaim-provider-credentialing demo
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
