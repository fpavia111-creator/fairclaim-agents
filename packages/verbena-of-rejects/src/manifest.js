import { defineManifest, MODEL_PIN, readX12File, readClaims, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, LIMITS } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { rejections, IK3_CODES, IK4_CODES, STATUS_CODES, ENTITY_CODES } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/verbena';

export const MEMORY_KINDS = Object.freeze({
  rejection_fix: {
    description: 'What fixed a front-end rejection last time, e.g. {"status_code": "562", "entity": "82", "payer": "Demo Medicaid Plan", "fix": "Rendering NPI must be enrolled with the plan; use the group NPI until enrolment is done"}.',
    effect: 'shows your team\'s fix next to matching 277CA rejections (status code, and entity and payer when given). It adds guidance only; the rejection is always listed.',
    schema: { type: 'object', additionalProperties: false, required: ['status_code', 'fix'], properties: { status_code: { type: 'string', pattern: '^\\d{1,4}$' }, entity: { type: 'string', pattern: '^[A-Z0-9]{2,3}$' }, payer: { type: 'string', maxLength: 120 }, fix: { type: 'string', minLength: 5, maxLength: 400 } } },
  },
});
const MEMORY = memoryTools('verbena', MEMORY_KINDS);

const files = {
  acks: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' }, description: 'Acknowledgement files under --root: X12 999 and/or 277CA files (one file may hold both)' },
  claims: { type: 'string', description: 'Optional: the 837 file you sent (or a claim export), to tie 999 segment errors to claims and to find claims with no 277CA' },
};
const run = (a, ctx) => {
  const acks = a.acks.map((p) => readX12File(ctx, p));
  const claims = a.claims ? readClaims(ctx, a.claims).claims : [];
  return { claims, out: rejections({ acks, claims, facts: ctx.memoryFacts('rejection_fix') }) };
};
const sumLine = (o) => `${o.transactions} transaction(s) acknowledged by 999 (${o.transactions_rejected} rejected); ${o.claims_rejected} claim(s) rejected${o.claims_sent ? ` of ${o.claims_sent} sent` : ''}, ${o.charges_rejected} in charges.${o.not_acknowledged ? ` ${o.not_acknowledged} claim(s) have no 277CA.` : ''}`;
const refused = refusedTools([
  { name: 'claim_resubmit', category: 'binding_send', description: 'Verbena never resends claims; the billing team corrects and sends them.' },
  { name: 'clearinghouse_login', category: 'binding_send', description: 'Verbena never logs in to a clearinghouse.' },
]);

export const manifest = defineManifest({
  name: 'verbena-of-rejects', version: pkg.version,
  description: 'Reads 999 and 277CA acknowledgements, ties each 999 segment error to the claim and loop in the 837 you sent (a billing-provider error marks every claim in the transaction), explains 277CA rejection codes with what to fix, and lists claims that never got a 277CA. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  memory: { prefix: 'verbena', kinds: MEMORY_KINDS },
  argDocs: { claim_id: 'Claim number from verbena_rejections; a pseudonym in strict masking mode', limit: 'Most items to return (the report file always has all of them)', code: 'A 999 IK3/IK4 code or a claim status code', list: 'Which list to look the code up in' },
  prompts: [{
    name: 'work_rejections', title: 'Work the front-end rejections',
    description: 'Walks the host model through 999 and 277CA rejections with Verbena.',
    arguments: [{ name: 'acks', description: '999 / 277CA files', required: true }, { name: 'claims', description: 'the 837 sent', required: false }],
    text: `You are helping a biller clear front-end rejections with verbena-of-rejects. Acknowledgements: {{acks}}. Claims sent: {{claims}}.

Rules: Verbena never resends claims; claim_resubmit is blocked. A rejected claim never reached adjudication: it is resent as a new original claim, not a corrected one.

1. Call verbena_rejections. Report rejected transactions, rejected claims and charges, and claims with no 277CA.
2. For each rejection, say what to fix in the billing system (the fix column).
3. When the person explains a fix that worked, offer verbena_learn with kind rejection_fix.
4. Call verbena_write_report for the work list.`,
  }],
  tools: [
    { name: 'verbena_rejections', kind: 'read', title: 'List rejections',
      description: 'Every 999 error (with the claim and loop it falls in, when the 837 is given) and every 277CA rejection, with the code meanings and what to fix; plus claims with no 277CA.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['acks'], properties: { ...files, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { items, ...t } = out; return { summary: sumLine(out), ...t, ...page(items, a.limit || 200) }; } },
    { name: 'verbena_explain', kind: 'read', title: 'Explain one claim',
      description: 'Show every acknowledgement item for one claim, and the 837 segments it spans.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['acks', 'claim_id'], properties: { ...files, claim_id: { type: 'string' } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const hit = findItem(out.items.filter((i) => i.claim_id), 'claim_id', a.claim_id, ctx, { label: 'claim' }); const items = out.items.filter((i) => i.claim_id === hit.claim_id); return { summary: `${hit.claim_id}: ${items.map((i) => `${i.source} ${i.message}`).join(' ')}`, items }; } },
    { name: 'verbena_codes', kind: 'read', title: 'Look up a code',
      description: 'Meaning of a 999 segment (IK3) or element (IK4) error code, a claim status code or an entity code.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['list', 'code'], properties: { list: { type: 'string', enum: ['ik3', 'ik4', 'status', 'entity'] }, code: { type: 'string', maxLength: 6 } } },
      handler: async (a) => { const t = { ik3: IK3_CODES, ik4: IK4_CODES, status: STATUS_CODES, entity: ENTITY_CODES }[a.list]; const k = a.code.toUpperCase(); return { summary: t[k] ? `${a.list} ${k}: ${t[k]}` : `${a.list} ${k} is not in Verbena's list; check the X12 code list.`, meaning: t[k] || null, note: 'Short paraphrases of the X12 code lists; not the official text.' }; } },
    reportTool({
      name: 'verbena_write_report', title: 'Write the rejection work list', outDir: OUT, base: 'verbena-rejections',
      description: 'Write verbena-rejections.csv (one row per rejection with blank owner and decision columns) and verbena-rejections.html into out_dir (default remedy-out/verbena).',
      properties: files, required: ['acks'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.items.map((i) => ({ severity: i.severity, source: i.source, claim_id: i.claim_id || '', payer: i.payer || '', patient_name: i.patient_name || '', charge: i.charge ?? '', segment: i.segment ? `${i.segment}@${i.position}` : '', issue: i.codes.join(' '), message: i.message, fix: i.fix, owner: '', decision: '' }));
        return {
          title: { en: 'Front-end rejections', de: 'Eingangsabweisungen', fr: 'Rejets à la réception', es: 'Rechazos de recepción', pt: 'Rejeições na recepção', it: 'Scarti in accettazione', ja: '受付時の差し戻し', zh: '前端拒收', ko: '접수 단계 반송' },
          intro: sumLine(out), rows, summary: `Rejection work list written: ${sumLine(out)}`,
          htmlColumns: ['severity', 'source', 'claim_id', 'payer', 'charge', 'segment', 'issue', 'message', 'fix'],
          sections: [{ title: sectionTitle('by_status'), rows: out.sets.map((s) => ({ segment: `ST ${s.control}`, status: s.status, count: s.errors })), columns: ['segment', 'status', 'count'] }],
          limits: [LIMITS.files, 'Code meanings are short paraphrases of the X12 code lists, not the official text.', LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'verbena_rejections', decision: 'allow' },
    { tool: 'verbena_explain', decision: 'allow' },
    { tool: 'verbena_codes', decision: 'allow' },
    { tool: 'verbena_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Verbena allowlist.' },
  ] },
});
