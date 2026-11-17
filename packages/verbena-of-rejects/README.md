# Verbena of Rejects (`verbena-of-rejects`)

Reads 999 and 277CA acknowledgements, ties each 999 segment error to the claim and loop in the 837 you sent (a billing-provider error marks every claim in the transaction), explains 277CA rejection codes with what to fix, and lists claims that never got a 277CA. Patient identifiers are masked before results reach the model.

**Verbena never resends claims; the billing team corrects and sends them. Verbena never logs in to a clearinghouse.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`remedy-core`](../remedy-core)

```bash
npx -y verbena-of-rejects demo
npx -y verbena-of-rejects mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y verbena-of-rejects demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Verbena of Rejects demo (fictional practice, payers and patients) in <demo folder>

▶ Read a 999 and a 277CA against the 837 sent
  status: executed  decision: allow
  2 transaction(s) acknowledged by 999 (1 rejected); 4 claim(s) rejected of 7 sent, 690 in charges. 1 claim(s) have no 277CA.
    999    V1002  claim             DMG at segment 28 (loop 2010BA): Segment has element errors. DMG-2: Invalid date ("20270101").
    999    V1005  billing_provider  NM1 at segment 6 (loop 2010AA): Segment has element errors. NM1-9: Required element missing.
    999    V1006  billing_provider  NM1 at segment 6 (loop 2010AA): Segment has element errors. NM1-9: Required element missing.
    277CA  V1003  claim             A7 rejected_invalid_info: Entity's National Provider Identifier (NPI) (rendering provider).
    277CA  V1007  claim             A6 rejected_missing_info: Entity's contract or member number (subscriber).
    none   V1004  claim             No 277CA line for this claim.

▶ Explain claim V1007
  status: executed  decision: allow
  V1007: 277CA A6 rejected_missing_info: Entity's contract or member number (subscriber).

▶ Write the work list (Korean page)
  status: executed  decision: allow
  Rejection work list written: 2 transaction(s) acknowledged by 999 (1 rejected); 4 claim(s) rejected of 7 sent, 690 in charges. 1 claim(s) have no 277CA. Files: remedy-out/verbena/verbena-rejections.csv, remedy-out/verbena/verbena-rejections.html.

▶ Remember a fix that worked
  status: executed  decision: allow
  Stored MEM-5e2cda13b801 as waiting. It changes nothing until a named person accepts it with verbena_accept_learning (id "MEM-5e2cda13b801", decision "accept").

▶ Agent tries to resend a claim itself
  status: blocked  decision: block
  reason: Verbena never resends claims; the billing team corrects and sends them.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `verbena_rejections` | Every 999 error (with the claim and loop it falls in, when the 837 is given) and every 277CA rejection, with the code meanings and what to fix; plus claims with no 277CA. | runs |
| `verbena_explain` | Show every acknowledgement item for one claim, and the 837 segments it spans. | runs |
| `verbena_codes` | Meaning of a 999 segment (IK3) or element (IK4) error code, a claim status code or an entity code. | runs |
| `verbena_write_report` | Write verbena-rejections.csv (one row per rejection with blank owner and decision columns) and verbena-rejections.html into out_dir (default remedy-out/verbena). | runs |
| `verbena_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `verbena_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `verbena_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `verbena_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `claim_resubmit` | Verbena never resends claims; the billing team corrects and sends them. | refused |
| `clearinghouse_login` | Verbena never logs in to a clearinghouse. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Memory

verbena-of-rejects can remember facts about your setup so the next run does not have to be told again. `verbena_learn` only proposes a fact; it changes nothing until a named person accepts it with `verbena_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `rejection_fix` | shows your team's fix next to matching 277CA rejections (status code, and entity and payer when given). It adds guidance only; the rejection is always listed. |
| `note` | nothing (shown by recall only) |

```bash
verbena-of-rejects memory list
verbena-of-rejects memory accept MEM-1a2b3c4d5e6f --as "Your Name"
verbena-of-rejects memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y verbena-of-rejects demo
npx -y verbena-of-rejects mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "verbena-of-rejects": {
      "command": "npx",
      "args": [
        "-y",
        "verbena-of-rejects",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add verbena-of-rejects -- npx -y verbena-of-rejects mcp --root .`, or install the `verbena-of-rejects` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `verbena-of-rejects approve <id> --as "Your Name"` (or on the local approvals page, `verbena-of-rejects approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`verbena-of-rejects kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
verbena-of-rejects tools                 # every tool, its policy and arguments
verbena-of-rejects sources               # the columns each input is read from
verbena-of-rejects inspect <file>        # how a file would be read (names and shapes, never values)
verbena-of-rejects call verbena_rejections '{"acks":"<acks>"}'
verbena-of-rejects eval                  # the private eval cases on the fictional fixtures
verbena-of-rejects demo
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
