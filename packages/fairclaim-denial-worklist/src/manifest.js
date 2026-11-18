import { defineManifest, MODEL_PIN, REMIT_FIELDS, readRemits, refusedTools, memoryTools, reportTool, findItem, LIMITS, CODE_TABLES_NOTE, GROUP_CODES, DENIAL_CATEGORIES, today } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { sortDenials, trends, CATEGORY_NAMES } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/denials';
const LEARNABLE = CATEGORY_NAMES.filter((c) => c !== 'not_denial');

const DENIAL_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    appeal_days: { type: 'integer', minimum: 1, maximum: 730, description: 'Days after the remittance date to file an appeal, when a payer has no entry of its own' },
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1 }, appeal_days: { type: 'integer', minimum: 1, maximum: 730 } } } },
    reason_codes: { type: 'object', additionalProperties: { type: 'object', additionalProperties: false, required: ['category'], properties: { category: { type: 'string', enum: CATEGORY_NAMES }, text: { type: 'string', maxLength: 300 } } } },
    payer_codes: { type: 'array', maxItems: 2000, items: { type: 'object', additionalProperties: false, required: ['payer', 'code', 'category'], properties: { payer: { type: 'string', minLength: 1 }, code: { type: 'string', pattern: '^[A-Za-z0-9]{1,5}$' }, group: { type: 'string', enum: ['CO', 'PR', 'OA', 'PI'] }, category: { type: 'string', enum: CATEGORY_NAMES }, text: { type: 'string', maxLength: 300 } } } },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_code_category: {
    description: 'How one payer uses one reason code, e.g. {"payer": "Example Health Plan", "code": "16", "group": "CO", "category": "authorization"} when that payer sends CO-16 for a missing authorization number.',
    effect: 'sorts that payer\'s denials with this code into the category (the config\'s payer_codes win). It can never turn a denial into an expected adjustment.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'code', 'category'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, code: { type: 'string', pattern: '^[A-Za-z0-9]{1,5}$' }, group: { type: 'string', enum: ['CO', 'PR', 'OA', 'PI'] }, category: { type: 'string', enum: LEARNABLE }, text: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('denials', MEMORY_KINDS);

const files = {
  remits: { type: 'string', description: 'Remittances under --root: an X12 835 file (.835, .edi, .x12, .txt) or a payment/ERA export (CSV, Excel, JSON) with claim, reason-code and amount columns' },
  config: { type: 'string', description: 'Optional denial_config JSON: appeal days per payer, reason-code overrides, payer-specific code meanings' },
  as_of: { type: 'string', format: 'date', description: 'Date to count appeal days left from (YYYY-MM-DD, default today)' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'denial_config') : {};
  const r = readRemits(ctx, a.remits);
  const facts = ctx.memoryFacts('payer_code_category');
  return { r, out: sortDenials(r.claims, { config, facts, asOf: a.as_of || today() }) };
};
const sumLine = (o) => `${o.denials} denial line(s) on ${o.claims_with_denials} of ${o.claims_in_file} claim(s), ${o.denied_amount} denied. Top categories: ${Object.entries(o.by_category).slice(0, 3).map(([k, v]) => `${k} ${v.amount}`).join(', ') || 'none'}.${o.unknown_codes.length ? ` Unknown codes: ${o.unknown_codes.join(', ')}.` : ''}${o.deadlines_set ? '' : ' No appeal deadlines (set appeal_days in the config).'}`;
const refused = refusedTools([
  { name: 'claim_resubmit', category: 'binding_send', description: 'Fairclaim Denial Worklist never resubmits claims; your billing team corrects and sends them.' },
  { name: 'appeal_submit', category: 'binding_send', description: 'Fairclaim Denial Worklist never files appeals; fairclaim-denial-appeals drafts them and a person sends them.' },
  { name: 'payer_portal_submit', category: 'binding_send', description: 'Fairclaim Denial Worklist never logs in to payer portals.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-denial-worklist', version: pkg.version,
  description: 'Sorts the denials in your 835 remittances (or ERA exports) by reason code and root cause into a worklist: category, team, next step, appeal deadline and priority, with trends by payer, provider and code. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { denial_config: DENIAL_CONFIG_SCHEMA },
  memory: { prefix: 'denials', kinds: MEMORY_KINDS },
  sources: { remits: { label: 'Remittances (ERA / payment export)', args: ['remits'], fields: REMIT_FIELDS } },
  argDocs: { claim_id: 'Claim number (patient control number) from denials_sort; a pseudonym in strict masking mode', limit: 'Most items to return (the report file always has all of them)' },
  prompts: [{
    name: 'denial_worklist', title: 'Work the denials in a remittance',
    description: 'Walks the host model through sorting denials with Fairclaim Denial Worklist and handing each group to the right team.',
    arguments: [{ name: 'remits', description: '835 file or ERA export under --root', required: true }, { name: 'config', description: 'denial_config JSON (optional)', required: false }],
    text: `You are helping a billing lead work denials with fairclaim-denial-worklist. Remittances: {{remits}}. Config: {{config}}.

Rules: Fairclaim Denial Worklist never resubmits, appeals or logs in anywhere; claim_resubmit, appeal_submit and payer_portal_submit are blocked. Patient names and member ids in results are pseudonyms (PT-..., MBR-...): never ask the person for the real values in chat; the local report file has them.

1. Call denials_sort. Report the denied amount, the top three categories and any unknown codes.
2. For unknown codes, ask the person what the payer means by them. If they say, call denials_learn with kind payer_code_category, then tell them a named person must accept it (denials_accept_learning) before it applies.
3. Call denials_write_report and share the file paths. Suggest who should take each category (the team column).
4. For a high-priority claim, call denials_explain and summarise what to fix. Offer fairclaim-denial-appeals for appeals.`,
  }],
  tools: [
    { name: 'denials_sort', kind: 'read', title: 'Sort denials into a worklist',
      description: 'Read the remittances and list every denying adjustment (skipping contractual write-downs and deductible/coinsurance/copay) with its reason and remark codes, root-cause category, team, next step, appeal deadline and priority. Totals by category, payer and team; unknown codes listed.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits'], properties: { ...files, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { r, out } = run(a, ctx); const lim = a.limit || 100; return { summary: sumLine(out), source: r.source, ...(r.x12 ? { x12_problems: r.x12.problems.slice(0, 20) } : {}), ...out, items: out.items.slice(0, lim), ...(out.items.length > lim ? { items_truncated: out.items.length - lim } : {}), group_codes: GROUP_CODES, note: CODE_TABLES_NOTE }; } },
    { name: 'denials_explain', kind: 'read', title: 'Explain one claim\'s denials',
      description: 'Show one claim from the remittance: every line, every adjustment with its group and reason, the remark codes, and why each denial was put in its category.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits', 'claim_id'], properties: { ...files, claim_id: { type: 'string' } } },
      handler: async (a, ctx) => {
        const { r, out } = run(a, ctx);
        const c = findItem(r.claims, 'claim_id', a.claim_id, ctx, { label: 'claim' });
        const d = out.items.filter((i) => i.claim_id === c.claim_id);
        return { summary: `${c.claim_id}: billed ${c.charge}, paid ${c.paid}. ${d.length ? d.map((x) => `${x.group}-${x.reason} ${x.amount} (${x.category}: ${x.next_step})`).join(' ') : 'No denials, only expected adjustments.'}`, claim: c, denials: d, categories: Object.fromEntries([...new Set(d.map((x) => x.category))].map((k) => [k, DENIAL_CATEGORIES[k]])) };
      } },
    { name: 'denials_trends', kind: 'read', title: 'Denial trends',
      description: 'Denied count and amount by payer and category, by rendering provider, by procedure code and by month of payment, to find the causes worth fixing at the front end.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['remits'], properties: files },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const t = trends(out); return { summary: `Trends over ${out.denials} denial line(s): ${Object.keys(t.payer_by_category).length} payer(s), ${Object.keys(t.provider_by_category).length} provider(s), ${Object.keys(t.code_by_category).length} code(s).`, by_category: out.by_category, ...t }; } },
    reportTool({
      name: 'denials_write_report', title: 'Write the denial worklist', outDir: OUT, base: 'denials',
      description: 'Write denials.csv (one row per denial with blank owner, action and decision columns) and denials.html (totals by category, payer and team) into out_dir (default remedy-out/denials). The files hold real patient names for the people working the claims.',
      properties: files, required: ['remits'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.items.map((i) => ({ priority: i.priority, claim_id: i.claim_id, payer: i.payer, patient_name: i.patient_name, member_id: i.member_id, date_of_service: i.date_of_service, code: i.code, modifiers: i.modifiers.join(' '), billed: i.billed, paid: i.paid, amount: i.amount, reason: `${i.group}-${i.reason}`, remarks: i.remarks.join(' '), category: i.category, team: i.team, next_step: i.next_step, deadline: i.appeal_by, days_left: i.days_left, decision: '', decided_by: '', notes: '' }));
        const sec = (o) => Object.entries(o).map(([k, v]) => ({ name: k, count: v.count, claims: v.claims, amount: v.amount }));
        return {
          title: { en: 'Denial worklist', de: 'Arbeitsliste Ablehnungen', fr: 'Liste de travail des refus', es: 'Lista de trabajo de denegaciones', pt: 'Lista de trabalho de glosas', it: 'Elenco di lavoro dei rifiuti', ja: '拒否対応ワークリスト', zh: '拒付处理工作清单', ko: '거절 처리 작업 목록' },
          intro: sumLine(out), rows, summary: `Denial worklist written: ${sumLine(out)}`,
          htmlColumns: ['priority', 'claim_id', 'payer', 'date_of_service', 'code', 'amount', 'reason', 'category', 'team', 'next_step', 'deadline'],
          sections: [
            { title: { en: 'By category', de: 'Nach Kategorie', fr: 'Par catégorie', es: 'Por categoría', pt: 'Por categoria', it: 'Per categoria', ja: '分類別', zh: '按类别', ko: '분류별' }, rows: sec(out.by_category).map((x) => ({ ...x, category: x.name })), columns: ['category', 'count', 'claims', 'amount'] },
            { title: { en: 'By payer', de: 'Nach Kostenträger', fr: 'Par payeur', es: 'Por pagador', pt: 'Por operadora', it: 'Per pagatore', ja: '支払者別', zh: '按付款方', ko: '지급자별' }, rows: sec(out.by_payer).map((x) => ({ ...x, payer: x.name })), columns: ['payer', 'count', 'claims', 'amount'] },
            { title: { en: 'By team', de: 'Nach Team', fr: 'Par équipe', es: 'Por equipo', pt: 'Por equipe', it: 'Per team', ja: 'チーム別', zh: '按团队', ko: '팀별' }, rows: sec(out.by_team).map((x) => ({ ...x, team: x.name })), columns: ['team', 'count', 'claims', 'amount'] },
          ],
          limits: [LIMITS.files, LIMITS.codes, CODE_TABLES_NOTE, LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'denials_sort', decision: 'allow' },
    { tool: 'denials_explain', decision: 'allow' },
    { tool: 'denials_trends', decision: 'allow' },
    { tool: 'denials_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Denial Worklist allowlist.' },
  ] },
});
