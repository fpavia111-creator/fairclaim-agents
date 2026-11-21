# Fairclaim DME Claims (`fairclaim-dme-claims`)

DME claims and rentals kept straight: checks HCPCS codes, rental and purchase modifiers, the capped-rental month (KH, KI, KJ) and the 13-month cap, oxygen months past 36, right and left on paired items, prior authorization, the written order before delivery, units and duplicates, and tracks every rental to its next month and modifier. Patient identifiers are masked before results reach the model.

**Fairclaim DME Claims never sends claims; the supplier does, after fixing them. Only the treating practitioner signs an order.**

MIT · Node 20 or newer · local files only · patient identifiers masked before results reach the model · built on [`fairclaim-core`](../fairclaim-core)

```bash
npx -y fairclaim-dme-claims demo
npx -y fairclaim-dme-claims mcp --root ./billing-files
```

<!-- generated:start -->

## A demo run

`npx -y fairclaim-dme-claims demo` runs the agent on the fictional files in [`fixtures/`](fixtures) in a temporary folder. Captured output:

```text
Fairclaim DME Claims demo (fictional supplier and patients) in <demo folder>

▶ Check February DME claims
  status: executed  decision: allow
  11 claim(s), 11 line(s): 5 with errors, 3 with warnings. cap 2, rental_month 1, side 1, prior_auth 1, order 1, duplicate 1, units 1, gap 1. 7 rental(s): 4 renting, 1 capped (patient owns), 1 at the oxygen cap.
    error    M6002 E0260-RR-KJ month 14  Rental month 14: the 13-month cap was reached in 2026-01. The patient owns the item; do not bill further rental (maintenance and servicing, if covered, bills with MS).
    error    M6003 E0570-RR-KH month 2  Rental month 2 is billed with KH; it should be KI (KH month 1, KI months 2-3, KJ months 4-13).
    error    M6005 L1833-NU  L1833 needs RT or LT (for both sides, two lines: one RT, one LT).
    error    M6006 K0823-RR-KH month 1  K0823 needs a prior authorization number on the claim. The order (2026-02-10) is dated after delivery (2026-02-03).
    error    M6008 A4253  A4253 is billed twice for 2026-02-02.
    warning  M6004 E1390-RR month 38  Oxygen rental month 38: equipment rental is paid for 36 months; months 37 to 60 are not paid, but the supplier must keep furnishing it.
    warning  M6007 A4253  10 unit(s) of A4253 is over your limit of 6 per claim line: keep the order and usage notes.
    warning  M6010 K0001-RR-KH month 1  A new rental period starts after a 123-day gap: document the break in need, or the payer may continue the old count.

▶ Rentals and next month
  status: executed  decision: allow
  7 rental period(s). renting 4, capped_owned 1, oxygen_cap_reached 1, stopped 1.
    renting             E0601 12 month(s)  next 2026-03-01 RR KJ
    capped_owned        E0260 14 month(s)
    renting             E0570  2 month(s)  next 2026-03-01 RR KI
    oxygen_cap_reached  E1390 38 month(s)
    stopped             K0001  5 month(s)
    renting             K0001  1 month(s)  next 2026-03-01 RR KI
    renting             K0823  1 month(s)  next 2026-03-03 RR KI

▶ Write the list
  status: executed  decision: allow
  DME list written: 11 claim(s), 11 line(s): 5 with errors, 3 with warnings. cap 2, rental_month 1, side 1, prior_auth 1, order 1, duplicate 1, units 1, gap 1. 7 rental(s): 4 renting, 1 capped (patient owns), 1 at the oxygen cap. Files: remedy-out/dme/dme.csv, remedy-out/dme/dme.html.

▶ Agent tries to sign an order
  status: blocked  decision: block
  reason: Only the treating practitioner signs an order.
```

## Tools

| Tool | What it does | Policy |
|---|---|---|
| `dme_check` | Every line with its status (error, warning, ok), rental month and issues: code, rental_modifier, rental_month, cap, gap, side, prior_auth, kx, units, order, delivery, duplicate, unknown_item. | runs |
| `dme_rentals` | Every rental period per patient and item: start, months billed, cap, status (renting, capped_owned, oxygen_cap_reached, stopped, rental) and the next month's date and modifiers. | runs |
| `dme_explain` | Every line of one claim with its item, modifiers, rental month and each issue in plain words. | runs |
| `dme_write_report` | Write dme.csv (one row per issue with blank owner and fixed columns) and dme.html (with every rental and its next month) into out_dir (default remedy-out/dme). | runs |
| `dme_recall` | Search this agent's own memory of the customer's setup: accepted facts (in use) and facts waiting for a person. | runs |
| `dme_learn` | Propose one fact about the customer's setup for this agent to remember. | runs |
| `dme_accept_learning` | A named person accepts or rejects a fact waiting in this agent's memory. | one named click, even in Auto (`accept_learning`) |
| `dme_retire_memory` | A named person stops an accepted fact from applying. | one named click, even in Auto (`accept_learning`) |
| `claim_submit` | Fairclaim DME Claims never sends claims; the supplier does, after fixing them. | refused |
| `order_sign` | Only the treating practitioner signs an order. | refused |

Any tool name not in this table is blocked, including names a model invents. `refused` tools are listed so a model can see they exist and are refused.

## Columns it reads

Table inputs can be CSV, TSV, semicolon- or pipe-separated text, Excel `.xlsx`, JSON or JSONL; claims and remittances can also be X12 837 and 835 files. Columns are matched by the agent's own name, then by the English names below, then by their names in German, French, Spanish, Portuguese, Italian, Japanese, Chinese and Korean. Dates become `YYYY-MM-DD`; amounts are read with either decimal mark. Every result lists under `sources` how each file was read. Columns marked *masked* hold patient identifiers: the model sees a pseudonym, a birth year or nothing (see Patient data).

### DME claims (837P or claim export) (`claims`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `claim_id` (required) | text | Claim ID, Claim Number, Claim #, Claim No, Patient Control Number, Encounter ID | - |
| `line` | number | Line, Line Number, Line #, Service Line, Line No | - |
| `patient_name` | text (masked) | Patient, Patient Name, Patient Full Name, Pt Name, Patient (Last, First) | Patient, Patient, 患者名, 患者 |
| `patient_first` | text (masked) | Patient First Name, First Name, Patient First | - |
| `patient_last` | text (masked) | Patient Last Name, Last Name, Patient Last | - |
| `patient_dob` | date (masked) | DOB, Date of Birth, Patient DOB, Birth Date, Birthdate | Geburtsdatum, Date de naissance, 生年月日, 出生日期 |
| `patient_gender` | text | Gender, Sex, Patient Sex, Patient Gender | - |
| `member_id` | text (masked) | Member ID, Subscriber ID, Insured ID, Policy Number, Policy #, Insurance ID | - |
| `account` | text (masked) | Account Number, Patient Account, Acct #, Account #, Account No, Patient Acct | - |
| `mrn` | text (masked) | MRN, Chart Number, Chart #, Medical Record Number, Chart No | - |
| `payer` | text | Payer, Payer Name, Insurance, Primary Insurance, Insurance Company, Insurance Name | Kostenträger, Payeur, 保険者, 付款方 |
| `payer_id` | text | Payer ID, Payor ID, Electronic Payer ID, EDI Payer ID, Insurance Payer ID | - |
| `filing_indicator` | text | Financial Class, Claim Filing Indicator, Insurance Type, Plan Type, Fin Class | - |
| `billing_npi` | text | Billing NPI, Group NPI, Billing Provider NPI, Practice NPI | - |
| `rendering_npi` | text | Rendering NPI, Provider NPI, Rendering Provider NPI, NPI, Servicing NPI | - |
| `referring_npi` | text | Referring NPI, Referring Provider NPI, Ordering NPI | - |
| `provider` | text | Provider, Rendering Provider, Provider Name, Physician, Doctor, Clinician | Leistungserbringer, Prestataire, 医師, 医生 |
| `pos` | text | POS, Place of Service, Place Of Service Code, POS Code | - |
| `facility_code` | text | Bill Type, Type of Bill, TOB, Facility Type | - |
| `frequency` | text | Frequency, Claim Frequency, Frequency Code, Resubmission Code, Claim Frequency Code | - |
| `date_of_service` | date | DOS, Date of Service, Service Date, From Date, Service From, Visit Date | Leistungsdatum, Date de soins, 診療日, 服务日期 |
| `date_to` | date | To Date, Service To, DOS To, Thru Date, Through Date | - |
| `code` | text | CPT, CPT Code, Procedure, Procedure Code, HCPCS, CPT/HCPCS | - |
| `modifiers` | text | Modifiers, Modifier, Mod, Mods | - |
| `modifier_1` | text | Modifier 1, Mod 1, Modifier1, Mod1, M1 | - |
| `modifier_2` | text | Modifier 2, Mod 2, Modifier2, Mod2, M2 | - |
| `modifier_3` | text | Modifier 3, Mod 3, Modifier3, Mod3, M3 | - |
| `modifier_4` | text | Modifier 4, Mod 4, Modifier4, Mod4, M4 | - |
| `units` | number | Units, Qty, Quantity, Days/Units, Service Units, Days or Units | Anzahl, Quantité, 回数, 数量 |
| `charge` | amount | Charge, Charges, Charge Amount, Billed, Billed Amount, Line Charge | Betrag, Montant, 請求額, 金额 |
| `total_charge` | amount | Total Charge, Claim Total, Total Billed, Claim Charge, Total Charges, Claim Amount | - |
| `diagnoses` | text | Diagnoses, Diagnosis Codes, ICD-10 Codes, ICD10 Codes, Dx Codes, ICD Codes | - |
| `dx_1` | text | Dx 1, Diagnosis 1, ICD 1, Primary Diagnosis, Dx1, ICD-10 1 | - |
| `dx_2` | text | Dx 2, Diagnosis 2, ICD 2, Dx2, ICD-10 2, Diag 2 | - |
| `dx_3` | text | Dx 3, Diagnosis 3, ICD 3, Dx3, ICD-10 3, Diag 3 | - |
| `dx_4` | text | Dx 4, Diagnosis 4, ICD 4, Dx4, ICD-10 4, Diag 4 | - |
| `dx_pointer` | text | Dx Pointer, Diagnosis Pointer, Pointer, Dx Ptr, Diag Pointer | - |
| `prior_auth` | text | Prior Auth, Authorization, Auth Number, Auth #, Prior Authorization Number, Authorization Number | - |
| `referral` | text | Referral, Referral Number, Referral # | - |
| `original_ref` | text | Original Claim Number, Original Reference, Original ICN, Original Claim ID, Replaces Claim | - |
| `revenue_code` | text | Revenue Code, Rev Code, UB Rev Code, Rev | - |
| `tooth` | text | Tooth, Tooth Number, Tooth #, Tooth No | - |
| `surfaces` | text | Surface, Surfaces, Tooth Surface | - |
| `quadrant` | text | Quadrant, Area of Oral Cavity, Arch, Oral Cavity | - |
| `clia` | text | CLIA, CLIA Number, CLIA # | - |
| `submitted_date` | date | Submitted, Submit Date, Date Submitted, Billed Date, First Billed, Claim Date | - |
| `status` | text | Status, Claim Status, Current Status | Status, Statut, ステータス, 状态 |
| `minutes` | number | Minutes, Anesthesia Minutes, Time (min), Anesthesia Time, Total Minutes | - |
| `start_time` | date and time | Start Time, Anesthesia Start, Start, Time In | - |
| `end_time` | date and time | End Time, Anesthesia End, End, Time Out | - |
| `balance` | amount | Balance, Claim Balance, Open Balance, Outstanding, Insurance Balance, Ins Balance | Saldo, Solde, 残高, 余额 |
| `order_date` | date | Order Date, Written Order Date, WOPD Date, Prescription Date, Rx Date, SWO Date | - |
| `delivery_date` | date | Delivery Date, Delivered, Date Delivered, POD Date, Proof of Delivery Date | - |

### Earlier DME claim lines (`history`)

| Column | Type | Also read as | For example, in other languages |
|---|---|---|---|
| `patient_name` | text (masked) | Patient, Patient Name | Patient, Patient, 患者名, 患者 |
| `member_id` | text (masked) | Member ID, Medicare ID, MBI, Subscriber ID, Insurance ID | - |
| `date_of_service` (required) | date | Date of Service, DOS, Service Date, From Date, Billed Month | - |
| `code` (required) | text | HCPCS, Code, Item Code, Procedure Code | - |
| `modifiers` | text | Modifiers, Modifier, Mods | - |

### Files from other countries

A German export in Windows-1252 with semicolons, `1.234,56` and `03.11.2026`, or a Japanese one in Shift_JIS with `2026/11/03`, is read the same way as the English file: `npm run intl` in the repository rewrites every eval fixture the way a German, French, Spanish, Brazilian, Italian, Japanese, Chinese and Korean export would write it and requires the same results. Columns named differently? Run `npx fairclaim-dme-claims inspect <file>` (names and shapes only, never values) and name them in `remedy-sources.json`:

```json
{ "files": { "exports/claims.csv": { "columns": { "claim_id": "Fallnummer" }, "date_order": "dmy" } } }
```

## Memory

fairclaim-dme-claims can remember facts about your setup so the next run does not have to be told again. `dme_learn` only proposes a fact; it changes nothing until a named person accepts it with `dme_accept_learning`, which is one click even in Auto. Facts live in one hash-chained file per agent under `.remedy/memory/`; if the chain does not verify, no fact is used. Credentials, personal identifiers and text that reads like instructions to an AI are refused. Run without memory with `--no-memory`.

| Kind | What an accepted fact changes |
|---|---|
| `dme_item_rule` | adds checks for that item: prior authorization, KX, order before delivery, pairing, or a lower unit limit. It never removes a check. |
| `note` | nothing (shown by recall only) |

```bash
fairclaim-dme-claims memory list
fairclaim-dme-claims memory accept MEM-1a2b3c4d5e6f --as "Your Name"
fairclaim-dme-claims memory retire MEM-1a2b3c4d5e6f --as "Your Name" --reason "payer renamed"
```

## Install

Node 20 or newer. No other dependencies.

```bash
npx -y fairclaim-dme-claims demo
npx -y fairclaim-dme-claims mcp --root /path/to/your/files
```

Claude Desktop, Cursor and other MCP hosts:

```json
{
  "mcpServers": {
    "fairclaim-dme-claims": {
      "command": "npx",
      "args": [
        "-y",
        "fairclaim-dme-claims",
        "mcp",
        "--root",
        "/path/to/your/files"
      ]
    }
  }
}
```

Claude Code: `claude mcp add fairclaim-dme-claims -- npx -y fairclaim-dme-claims mcp --root .`, or install the `fairclaim-dme-claims` plugin from this repository's marketplace (`remedy-medical-billing`).

## Modes and approvals

- **Review** (`--mode review`): reads and reports only.
- **Assist** (default): the policy above. A tool that asks returns an `approval_id`; a person approves it once with `fairclaim-dme-claims approve <id> --as "Your Name"` (or on the local approvals page, `fairclaim-dme-claims approvals`), and the same call is repeated.
- **Auto** (`--mode auto --auto <tool,...>`): opt-in per tool, with step caps and a kill switch (`fairclaim-dme-claims kill`). Sending, moving money, going live and accepting a learned fact stay **one named click even in Auto**; an approval is tied to the sha256 of the reviewed draft, so a changed draft needs a new click.

## CLI

```bash
fairclaim-dme-claims tools                 # every tool, its policy and arguments
fairclaim-dme-claims sources               # the columns each input is read from
fairclaim-dme-claims inspect <file>        # how a file would be read (names and shapes, never values)
fairclaim-dme-claims call dme_check '{"claims":"<claims>"}'
fairclaim-dme-claims eval                  # the private eval cases on the fictional fixtures
fairclaim-dme-claims demo
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
