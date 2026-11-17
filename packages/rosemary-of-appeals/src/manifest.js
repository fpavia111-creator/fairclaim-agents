import { defineManifest, MODEL_PIN, REMIT_FIELDS, readRemits, denialLines, refusedTools, memoryTools, reportTool, draftPair, findItem, page, sectionTitle, LIMITS, today, addDays, daysBetween, payerKey } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { findCitations, appealLetter, trackAppeals } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/rosemary';

export const APPEAL_FIELDS = Object.freeze({
  claim_id: { aliases: ['Claim ID', 'Claim Number', 'Claim #', 'Patient Control Number'], required: true, translate: false },
  payer: { aliases: ['Payer', 'Insurance', 'Payer Name'] },
  patient_name: { aliases: ['Patient', 'Patient Name'], phi: 'name' },
  level: { aliases: ['Level', 'Appeal Level'], type: 'number' },
  filed: { aliases: ['Filed', 'Filed Date', 'Date Filed', 'Submitted', 'Sent Date'], type: 'date' },
  status: { aliases: ['Status', 'Outcome', 'Decision'] },
  amount: { aliases: ['Amount', 'Amount Appealed', 'Denied Amount', 'Balance'], type: 'money' },
});

const APPEAL_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    appeal_days: { type: 'integer', minimum: 1, maximum: 730, description: 'Days from the remittance date to file a first-level appeal, unless a payer has its own' },
    response_days: { type: 'integer', minimum: 1, maximum: 365, description: 'Days a payer has to decide an appeal (default 60)' },
    max_levels: { type: 'integer', minimum: 1, maximum: 5 },
    practice_name: { type: 'string', maxLength: 120 },
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1 }, appeal_days: { type: 'integer', minimum: 1, maximum: 730 }, response_days: { type: 'integer', minimum: 1, maximum: 365 } } } },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_appeal_address: {
    description: 'Where one payer takes appeals, e.g. {"payer": "Sample Mutual Insurance", "level": 1, "text": "Appeals Unit, PO Box 0000, Exampleton AK 99501 (fax 907-555-0100)"}.',
    effect: 'puts the address on that payer\'s appeal drafts, still marked [CHECK] so a person confirms it is current.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'text'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, level: { type: 'integer', minimum: 1, maximum: 5 }, text: { type: 'string', minLength: 5, maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('rosemary', MEMORY_KINDS);

const base = {
  remits: { type: 'string', description: 'Remittances under --root: an X12 835 file or an ERA export, holding the denied claim' },
  config: { type: 'string', description: 'Optional appeal_config JSON: appeal and response days per payer, number of levels, practice name' },
};
const policyArg = { type: 'array', maxItems: 30, items: { type: 'string' }, description: 'Payer policy files under --root (.txt or .md, one passage per line works best) to quote from' };
const denied = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'appeal_config') : {};
  const r = readRemits(ctx, a.remits);
  const c = findItem(r.claims, 'claim_id', a.claim_id, ctx, { label: 'claim' });
  const ds = denialLines([c]);
  if (!ds.length) throw new Error(`claim ${a.claim_id} has no denial to appeal (only expected adjustments)`);
  const p = (config.payers || []).find((x) => payerKey(x.name) === payerKey(c.payer));
  const days = p && p.appeal_days ? p.appeal_days : config.appeal_days || null;
  const deadline = days && c.payment_date ? addDays(c.payment_date, days) : null;
  const docs = (a.policies || []).map((f) => ({ file: f, text: ctx.readText(f) }));
  const citations = findCitations(docs, { codes: [...new Set(ds.map((d) => d.code).filter(Boolean))], category: ds[0].category });
  return { config, claim: c, denials: ds, deadline, citations };
};

const pair = draftPair({
  prefix: 'rosemary', noun: 'appeal', verb: 'send', category: 'binding_send', outDir: OUT, actor: 'your billing lead',
  title: 'Draft an appeal',
  description: 'Write a draft first-level (or later) appeal for one denied claim: the denial lines, what to argue for its category, quotes from the policy files with file and line, and the enclosures. Marked DRAFT with [MISSING]/[ATTACH] markers for what only a person can add; nothing is sent.',
  args: { ...base, policies: policyArg, claim_id: { type: 'string' }, level: { type: 'integer', minimum: 1, maximum: 5 } },
  required: ['remits', 'claim_id'],
  build: (a, ctx) => {
    const d = denied(a, ctx);
    const addr = ctx.memoryFacts('payer_appeal_address').find((f) => payerKey(f.value.payer) === payerKey(d.claim.payer) && (!f.value.level || f.value.level === (a.level || 1)));
    return { id: d.claim.claim_id, to: d.claim.payer, amount: Math.round(d.denials.reduce((s, x) => s + x.amount, 0) * 100) / 100, text: appealLetter({ claim: d.claim, denials: d.denials, citations: d.citations, practice: d.config.practice_name, address: addr ? addr.value : null, level: a.level || 1, deadline: d.deadline }), extra: { citations: d.citations.length, deadline: d.deadline, ...(addr ? { fact_id: addr.id } : {}) } };
  },
});
const refused = refusedTools([
  { name: 'appeal_submit', category: 'binding_send', description: 'Rosemary never files appeals; a person sends the approved draft by mail, fax or portal.' },
  { name: 'medical_record_attach', category: 'binding_send', description: 'Rosemary never reads or attaches medical records; a person adds them.' },
]);

export const manifest = defineManifest({
  name: 'rosemary-of-appeals', version: pkg.version,
  description: 'Drafts appeals for denied claims from your 835s, quoting the payer policy files you supply by file and line, with the argument for the denial category, the deadline and the enclosures to attach; tracks appeals against the payer\'s response time and the next level. Nothing is sent: a named person approves each draft.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { appeal_config: APPEAL_CONFIG_SCHEMA },
  memory: { prefix: 'rosemary', kinds: MEMORY_KINDS },
  sources: { remits: { label: 'Remittances (ERA / payment export)', args: ['remits'], fields: REMIT_FIELDS }, appeals: { label: 'Appeal log', args: ['appeals'], fields: APPEAL_FIELDS } },
  argDocs: { claim_id: 'Denied claim number (from yarrow-of-denials or the remittance); a pseudonym in strict masking mode', level: 'Appeal level (1 for the first appeal)', limit: 'Most appeals to return (the report file always has all of them)', as_of: 'Date to measure response times from (YYYY-MM-DD, default today)' },
  prompts: [{
    name: 'appeal_one_claim', title: 'Appeal a denied claim',
    description: 'Walks the host model through drafting an appeal with Rosemary.',
    arguments: [{ name: 'remits', description: '835 or ERA export', required: true }, { name: 'claim_id', description: 'denied claim', required: true }, { name: 'policies', description: 'policy files', required: false }],
    text: `You are helping a billing lead appeal claim {{claim_id}} from {{remits}} with rosemary-of-appeals. Policies: {{policies}}.

Rules: Rosemary never files appeals or reads medical records; appeal_submit is blocked. Never invent clinical facts: the [MISSING] markers are for a person who has the record. Quote only the policy passages Rosemary returns, with file and line.

1. Call rosemary_policy_search to see the passages that match the denial.
2. Call rosemary_draft_appeal. Show the draft path, the deadline and the open markers.
3. Tell the person what to add and attach; after they fix the markers, they approve with rosemary_request_send (one named click).
4. For a list of open appeals, call rosemary_track with the appeal log.`,
  }],
  tools: [
    { name: 'rosemary_policy_search', kind: 'read', title: 'Find policy passages for a denial',
      description: 'Show the denial lines of one claim, its category and filing deadline, and the policy lines that mention its codes or the words of its category, best first, with file and line. Lines that read like instructions to an AI are flagged and never quoted.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits', 'claim_id', 'policies'], properties: { ...base, policies: policyArg, claim_id: { type: 'string' }, as_of: { type: 'string', format: 'date' } } },
      handler: async (a, ctx) => { const d = denied(a, ctx); return { summary: `${d.claim.claim_id}: ${d.denials.map((x) => `${x.group}-${x.reason} (${x.category}) ${x.amount}`).join(', ')}. ${d.citations.filter((c) => !c.flagged).length} policy passage(s) found.${d.deadline ? ` File by ${d.deadline}${daysBetween(a.as_of || today(), d.deadline) < 0 ? ': the deadline has passed' : ` (${daysBetween(a.as_of || today(), d.deadline)} days left)`}.` : ''}`, denials: d.denials, deadline: d.deadline, days_left: d.deadline ? daysBetween(a.as_of || today(), d.deadline) : null, citations: d.citations }; } },
    ...pair.tools,
    { name: 'rosemary_track', kind: 'read', title: 'Track appeals',
      description: 'Read the appeal log and say for each appeal: waiting, overdue (past the payer\'s response time), next level, exhausted or won, with the next step.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['appeals'], properties: { appeals: { type: 'string', description: 'Appeal log under --root (CSV, Excel, JSON): claim, payer, level, filed date, status, amount' }, config: base.config, as_of: { type: 'string', format: 'date' }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const config = a.config ? ctx.readJson(a.config, 'appeal_config') : {}; const t = trackAppeals(ctx.records(a.appeals, 'appeals'), { config, asOf: a.as_of || today() }); const { items, ...rest } = t; return { summary: `${t.appeals} appeal(s): ${t.open} open (${t.open_amount}), ${t.by_status.overdue || 0} overdue, ${t.won_amount} won.`, ...rest, ...page(items, a.limit || 200) }; } },
    reportTool({
      name: 'rosemary_write_report', title: 'Write the appeal tracker', outDir: OUT, base: 'rosemary-appeals',
      description: 'Write rosemary-appeals.csv and rosemary-appeals.html (every appeal with status, response due and next step, and blank owner and notes columns) into out_dir (default remedy-out/rosemary).',
      properties: { appeals: { type: 'string', description: 'Appeal log under --root' }, config: base.config, as_of: { type: 'string', format: 'date' } }, required: ['appeals'],
      build: (a, ctx) => {
        const config = a.config ? ctx.readJson(a.config, 'appeal_config') : {};
        const t = trackAppeals(ctx.records(a.appeals, 'appeals'), { config, asOf: a.as_of || today() });
        const line = `${t.appeals} appeal(s): ${t.open} open (${t.open_amount}), ${t.by_status.overdue || 0} overdue, ${t.won_amount} won.`;
        return {
          title: { en: 'Appeal tracker', de: 'Widerspruchsübersicht', fr: 'Suivi des recours', es: 'Seguimiento de apelaciones', pt: 'Acompanhamento de recursos', it: 'Monitoraggio dei ricorsi', ja: '異議申立て管理表', zh: '申诉跟踪表', ko: '이의 신청 추적표' },
          intro: line, summary: `Appeal tracker written: ${line}`,
          rows: t.items.map((i) => ({ status: i.status, claim_id: i.claim_id, payer: i.payer, patient_name: i.patient_name, level: i.level, filed: i.filed, due: i.response_due, days: i.days_overdue, amount: i.amount, next_step: i.next_step, owner: '', notes: '' })),
          htmlColumns: ['status', 'claim_id', 'payer', 'level', 'filed', 'due', 'days', 'amount', 'next_step'],
          sections: [{ title: sectionTitle('by_status'), rows: Object.entries(t.by_status).map(([k, v]) => ({ status: k, count: v })), columns: ['status', 'count'] }],
          limits: [LIMITS.files, 'Response times are the ones in your config (default 60 days); the payer\'s contract or the law may set others.', LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'rosemary_policy_search', decision: 'allow' },
    { tool: 'rosemary_track', decision: 'allow' },
    { tool: 'rosemary_write_report', decision: 'allow' },
    ...pair.rules,
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Rosemary allowlist.' },
  ] },
});
