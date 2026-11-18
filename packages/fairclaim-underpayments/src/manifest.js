import { defineManifest, MODEL_PIN, REMIT_FIELDS, readRemits, refusedTools, memoryTools, reportTool, draftPair, findItem, page, sectionTitle, LIMITS, round2 } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { checkLines, METHODS } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/underpayments';

export const FEE_FIELDS = Object.freeze({
  payer: { aliases: ['Payer', 'Payer Name', 'Insurance', 'Plan', 'Carrier', 'Payor', 'Contract'] },
  code: { aliases: ['CPT', 'CPT Code', 'HCPCS', 'Code', 'Procedure', 'Procedure Code', 'CPT/HCPCS', 'Service Code'], required: true, translate: false },
  modifier: { aliases: ['Modifier', 'Mod', 'Modifier 1'], translate: false },
  fee: { aliases: ['Fee', 'Allowed', 'Allowable', 'Rate', 'Contract Rate', 'Contracted Amount', 'Fee Amount', 'Amount', 'Price', 'Non-Facility Fee', 'Par Amount'], type: 'money', required: true },
  effective_from: { aliases: ['Effective', 'Effective Date', 'Start Date', 'From'], type: 'date', translate: false },
  effective_to: { aliases: ['End Date', 'Termination Date', 'To', 'Expires'], type: 'date', translate: false },
});

const CONTRACT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['payers'],
  properties: {
    payers: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name', 'method'], properties: { name: { type: 'string', minLength: 1 }, method: { type: 'string', enum: METHODS }, percent: { type: 'number', exclusiveMinimum: 0, maximum: 1000 } }, anyOf: [{ properties: { method: { enum: ['fee_schedule'] } } }, { required: ['percent'] }] } },
    modifier_percent: { type: 'object', additionalProperties: { type: 'number', minimum: 0, maximum: 500 }, description: 'Percent of the fee a modifier pays when the fee file has no row for that modifier, e.g. {"26": 40, "TC": 60}' },
    mppr: { type: 'object', additionalProperties: false, required: ['codes', 'percent_after_first'], properties: { codes: { type: 'array', items: { type: 'string', pattern: '^[A-Za-z0-9]{1,5}\\*?$' } }, percent_after_first: { type: 'number', minimum: 0, maximum: 100 } } },
    tolerance: { type: 'number', minimum: 0, maximum: 1000 },
    tolerance_percent: { type: 'number', minimum: 0, maximum: 50 },
    practice_name: { type: 'string', maxLength: 120 },
  },
};

export const MEMORY_KINDS = Object.freeze({
  contract_fee: {
    description: 'A fee a person found in a contract that is missing from the fee file, e.g. {"payer": "Example Health Plan", "code": "99395", "fee": 145.00, "note": "Amendment 3, page 2"}.',
    effect: 'prices that code for that payer when the fee file has no row for it, so the line is checked instead of skipped. A fee-file row always wins.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'code', 'fee'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, code: { type: 'string', pattern: '^[A-Za-z0-9]{4,5}$' }, modifier: { type: 'string', pattern: '^[A-Za-z0-9]{2}$' }, fee: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('underpayments', MEMORY_KINDS);

const files = {
  remits: { type: 'string', description: 'Remittances under --root: an X12 835 file or an ERA export with allowed and paid amounts per line' },
  contract: { type: 'string', description: 'contract JSON under --root: method per payer (fee_schedule, percent_of_medicare, percent_of_charge), modifier percents, multiple-procedure rule, tolerance' },
  fees: { type: 'string', description: 'Optional contract fee file (CSV, Excel, JSON): payer, code, modifier, fee, effective dates. A blank payer applies to every fee_schedule payer' },
  medicare_fees: { type: 'string', description: 'Optional Medicare fee file (code, modifier, fee) for percent_of_medicare payers, e.g. the output of fairclaim-fee-schedule' },
};
const run = (a, ctx) => {
  const config = ctx.readJson(a.contract, 'contract');
  const r = readRemits(ctx, a.remits);
  const fees = a.fees ? ctx.records(a.fees, 'fees') : [];
  const medicare = a.medicare_fees ? ctx.records(a.medicare_fees, 'fees') : [];
  return { r, config, out: checkLines(r.claims, { config, fees, medicare, facts: ctx.memoryFacts('contract_fee') }) };
};
const sumLine = (o) => `${o.lines_checked} line(s), ${o.priced} priced: ${o.underpaid_lines} underpaid by ${o.underpaid_amount}, ${o.overpaid_lines} overpaid by ${o.overpaid_amount}.${o.missing_fees.length ? ` No fee for ${o.missing_fees.length} code(s): ${o.missing_fees.slice(0, 5).join(', ')}.` : ''}`;

const pair = draftPair({
  prefix: 'underpayments', noun: 'reprocessing_request', verb: 'send', category: 'binding_send', outDir: OUT, actor: 'your billing lead',
  title: 'Draft a reprocessing request',
  description: 'Write a draft request asking one payer to reprocess the underpaid lines of one claim at the contracted rate, listing each line, the allowed amount, the contract amount and the basis. Marked DRAFT; nothing is sent.',
  args: { ...files, claim_id: { type: 'string' } }, required: ['remits', 'contract', 'claim_id'],
  build: (a, ctx) => {
    const { out, config, r } = run(a, ctx);
    const c = findItem(r.claims, 'claim_id', a.claim_id, ctx, { label: 'claim' });
    const ls = out.lines.filter((x) => x.claim_id === c.claim_id && x.status === 'underpaid');
    if (!ls.length) throw new Error(`claim ${a.claim_id} has no underpaid lines`);
    const owed = round2(-ls.reduce((s, x) => s + x.variance, 0));
    const rows = ls.map((x) => `| ${x.date_of_service} | ${x.code}${x.modifiers.length ? `-${x.modifiers.join('-')}` : ''} | ${x.units} | ${x.allowed} | ${x.expected} | ${round2(-x.variance)} | ${x.basis} |`).join('\n');
    return { id: c.claim_id, to: c.payer, amount: owed, text: `**To:** ${c.payer}\n**From:** ${config.practice_name || '[MISSING: practice name]'}\n**Subject:** Reprocessing request, claim ${c.claim_id}${c.payer_claim_id ? `, payer claim ${c.payer_claim_id}` : ''}\n\nPatient: ${c.patient_name || '[MISSING: patient]'}, member ${c.member_id || '[MISSING: member id]'}. Paid ${c.payment_date || ''} under ${c.check_number || ''}.\n\nThe lines below were allowed below our contracted rate. Please reprocess them at the contract amounts.\n\n| Date | Code | Units | Allowed | Contract | Short | Basis |\n|---|---|---|---|---|---|---|\n${rows}\n\nTotal short: ${owed}.\n\nContract reference: [CHECK: contract name, section and effective date]\n\nContact: [MISSING: name and phone]\n` };
  },
});
const refused = refusedTools([
  { name: 'payer_portal_submit', category: 'binding_send', description: 'Fairclaim Underpayments never logs in to payer portals or files requests; a person sends the approved draft.' },
  { name: 'payment_post', category: 'move_money', description: 'Fairclaim Underpayments never posts payments or adjustments.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-underpayments', version: pkg.version,
  description: 'Finds underpaid (and overpaid) lines on your 835s by pricing each line from your contract: fee schedule, percent of Medicare or percent of charge, with modifier percents and the multiple-procedure rule. Lists missing fees, totals by payer, and drafts the reprocessing request for a person to send.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { contract: CONTRACT_SCHEMA },
  memory: { prefix: 'underpayments', kinds: MEMORY_KINDS },
  sources: { remits: { label: 'Remittances (ERA / payment export)', args: ['remits'], fields: REMIT_FIELDS }, fees: { label: 'Fee schedule', args: ['fees', 'medicare_fees'], fields: FEE_FIELDS } },
  argDocs: { claim_id: 'Claim number from underpayments_check; a pseudonym in strict masking mode', limit: 'Most lines to return (the report file always has all of them)', status: 'Only lines with this status' },
  prompts: [{
    name: 'underpayment_review', title: 'Find underpayments in a remittance',
    description: 'Walks the host model through pricing remittance lines against the contract with Fairclaim Underpayments.',
    arguments: [{ name: 'remits', description: '835 or ERA export', required: true }, { name: 'contract', description: 'contract JSON', required: true }, { name: 'fees', description: 'fee file', required: false }],
    text: `You are helping a revenue analyst find underpayments with fairclaim-underpayments. Remittances: {{remits}}. Contract: {{contract}}. Fees: {{fees}}.

Rules: Fairclaim Underpayments never files requests or posts payments. A drafted reprocessing request is sent by a person after underpayments_request_send.

1. Call underpayments_check. Report the underpaid total by payer and any missing fees.
2. For missing fees, ask whether the contract lists them; if the person gives a fee and its source, call underpayments_learn (kind contract_fee).
3. Offer underpayments_draft_reprocessing_request for the largest underpaid claims.
4. Overpaid lines: tell the person they may be taken back; do not suggest keeping them quietly.`,
  }],
  tools: [
    { name: 'underpayments_check', kind: 'read', title: 'Check payments against the contract',
      description: 'Price every paid remittance line from the contract and compare with what the payer allowed. Each line: expected, allowed, variance, basis and status (underpaid, overpaid, as_contracted, no_fee, no_contract, denied).',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits', 'contract'], properties: { ...files, status: { type: 'string', enum: ['underpaid', 'overpaid', 'as_contracted', 'no_fee', 'no_contract', 'denied'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { r, out } = run(a, ctx); const { lines, ...t } = out; const list = (a.status ? lines.filter((l) => l.status === a.status) : lines).sort((x, y) => (x.variance ?? 0) - (y.variance ?? 0)); return { summary: sumLine(out), source: r.source, ...(r.x12 ? { x12_problems: r.x12.problems.slice(0, 20) } : {}), ...t, ...page(list, a.limit || 200) }; } },
    { name: 'underpayments_explain', kind: 'read', title: 'Explain one claim',
      description: 'Show how each line of one claim was priced: method, fee, modifier and multiple-procedure steps, allowed and variance.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits', 'contract', 'claim_id'], properties: { ...files, claim_id: { type: 'string' } } },
      handler: async (a, ctx) => { const { r, out } = run(a, ctx); const c = findItem(r.claims, 'claim_id', a.claim_id, ctx, { label: 'claim' }); const ls = out.lines.filter((x) => x.claim_id === c.claim_id); return { summary: `${c.claim_id} (${c.payer}): ${ls.map((x) => `${x.code} ${x.status}${x.variance !== null ? ` ${x.variance}` : ''}`).join('; ')}.`, lines: ls }; } },
    reportTool({
      name: 'underpayments_write_report', title: 'Write the underpayment report', outDir: OUT, base: 'underpayments',
      description: 'Write underpayments.csv (every line with expected, allowed, variance, basis and blank decision columns) and underpayments.html (totals by payer, missing fees) into out_dir (default remedy-out/underpayments).',
      properties: files, required: ['remits', 'contract'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.lines.map((x) => ({ status: x.status, claim_id: x.claim_id, payer: x.payer, patient_name: x.patient_name, date_of_service: x.date_of_service, code: x.code, modifiers: x.modifiers.join(' '), units: x.units, billed: x.billed, allowed: x.allowed, expected: x.expected ?? '', variance: x.variance ?? '', rule: x.basis || '', notes: x.notes.join(' '), decision: '', decided_by: '' }));
        return {
          title: { en: 'Underpayments against contract', de: 'Minderzahlungen gegenüber Vertrag', fr: 'Sous-paiements par rapport au contrat', es: 'Pagos inferiores al contrato', pt: 'Pagamentos abaixo do contrato', it: 'Pagamenti inferiori al contratto', ja: '契約に対する過少支払い', zh: '低于合同的付款', ko: '계약 대비 과소 지급' },
          intro: sumLine(out), rows, summary: `Underpayment report written: ${sumLine(out)}`,
          htmlColumns: ['status', 'claim_id', 'payer', 'date_of_service', 'code', 'modifiers', 'units', 'allowed', 'expected', 'variance', 'rule'],
          sections: [
            { title: sectionTitle('by_payer'), rows: out.by_payer, columns: ['payer', 'count', 'claims', 'amount'] },
            { title: sectionTitle('by_status'), rows: Object.entries(out.by_status).map(([k, v]) => ({ status: k, count: v })), columns: ['status', 'count'] },
          ],
          limits: [LIMITS.files, LIMITS.contract, 'Allowed comes from AMT*B6 when the payer sends it, otherwise paid plus the patient share.', LIMITS.advice],
        };
      },
    }),
    ...pair.tools,
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'underpayments_check', decision: 'allow' },
    { tool: 'underpayments_explain', decision: 'allow' },
    { tool: 'underpayments_write_report', decision: 'allow' },
    ...pair.rules,
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Underpayments allowlist.' },
  ] },
});
