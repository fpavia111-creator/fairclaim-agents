import { defineManifest, MODEL_PIN, refusedTools, memoryTools, reportTool, draftPair, page, sectionTitle, LIMITS, today, payerKey, round2 } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { compareRates, contractCalendar } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/laurel';

export const PAYER_FEE_FIELDS = Object.freeze({
  payer: { aliases: ['Payer', 'Payer Name', 'Insurance', 'Plan', 'Carrier'], required: true },
  code: { aliases: ['CPT', 'Code', 'Procedure Code', 'HCPCS', 'CPT/HCPCS', 'Proc Code'], required: true, translate: false },
  modifier: { aliases: ['Modifier', 'Mod'], translate: false },
  allowed: { aliases: ['Allowed', 'Contract Rate', 'Rate', 'Fee', 'Allowed Amount', 'Contracted Amount', 'Payer Fee'], type: 'money', required: true },
});
export const MEDICARE_FIELDS = Object.freeze({
  code: { aliases: ['CPT', 'Code', 'HCPCS', 'Procedure Code'], required: true, translate: false },
  modifier: { aliases: ['Modifier', 'Mod'], translate: false },
  amount: { aliases: ['Medicare', 'Medicare Allowed', 'Medicare Rate', 'Non-Facility Price', 'Amount', 'Allowed'], type: 'money', required: true },
});
export const VOLUME_FIELDS = Object.freeze({
  code: { aliases: ['CPT', 'Code', 'HCPCS', 'Procedure Code'], required: true, translate: false },
  modifier: { aliases: ['Modifier', 'Mod'], translate: false },
  volume: { aliases: ['Units', 'Volume', 'Count', 'Units Billed', 'Times Billed', 'Annual Units'], type: 'number', required: true },
});
export const CONTRACT_FIELDS = Object.freeze({
  payer: { aliases: ['Payer', 'Payer Name', 'Plan', 'Carrier'], required: true },
  effective_date: { aliases: ['Effective Date', 'Start Date', 'Effective'], type: 'date', translate: false },
  end_date: { aliases: ['End Date', 'Term End', 'Expiration Date', 'Expires', 'Renewal Date'], type: 'date', translate: false },
  auto_renew: { aliases: ['Auto Renew', 'Auto-Renew', 'Evergreen', 'Renews Automatically'] },
  notice_days: { aliases: ['Notice Days', 'Notice Period', 'Termination Notice', 'Notice (days)'], type: 'number', translate: false },
  escalator_percent: { aliases: ['Escalator', 'Escalator %', 'Annual Increase', 'Escalator Percent'], type: 'number', translate: false },
  timely_days: { aliases: ['Timely Filing', 'Timely Filing Days', 'Filing Limit'], type: 'number', translate: false },
  appeal_days: { aliases: ['Appeal Days', 'Appeal Limit', 'Appeal Deadline'], type: 'number', translate: false },
});

const CONTRACT_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    floor_percent: { type: 'number', minimum: 0, maximum: 1000, description: 'Flag rates below this percent of Medicare (for example 100)' },
    warn_days: { type: 'integer', minimum: 1, maximum: 730, description: 'Show notice deadlines this many days ahead (default 120)' },
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1 }, floor_percent: { type: 'number', minimum: 0, maximum: 1000 }, contact: { type: 'string', maxLength: 200 } } } },
    practice_name: { type: 'string', minLength: 1 },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_rate_floor: {
    description: 'A rate floor for one payer that your team agreed, e.g. {"payer": "Sample Mutual Insurance", "percent_of_medicare": 110, "note": "Board decision 2026: leave below 110%"}.',
    effect: 'flags that payer\'s rates below this percent of Medicare when it is higher than the config floor. It only adds flags; it never lowers a floor.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'percent_of_medicare'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, percent_of_medicare: { type: 'number', minimum: 1, maximum: 1000 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('laurel', MEMORY_KINDS);

const rateFiles = {
  payer_fees: { type: 'string', description: 'Payer fee schedules under --root, one row per payer and code with the allowed amount (CSV, Excel, JSON)' },
  medicare: { type: 'string', description: 'Medicare amounts per code under --root (for example from hyssop-of-fees or the CMS look-up)' },
  volumes: { type: 'string', description: 'Optional yearly units per code under --root, to weight payers by what you actually bill' },
  config: { type: 'string', description: 'Optional contract_config JSON: floor percent of Medicare (overall and per payer), warning days, practice name' },
};
const calFiles = {
  contracts: { type: 'string', description: 'Contract register under --root: payer, effective and end dates, auto-renew, notice days, escalator, filing and appeal limits' },
  config: rateFiles.config,
  as_of: { type: 'string', format: 'date', description: 'Date to count from (YYYY-MM-DD, default today)' },
};
const cfg = (a, ctx) => (a.config ? ctx.readJson(a.config, 'contract_config') : {});
const rates = (a, ctx) => { const config = cfg(a, ctx); return { config, out: compareRates(ctx.records(a.payer_fees, 'payer_fees'), { medicare: ctx.records(a.medicare, 'medicare'), volumes: a.volumes ? ctx.records(a.volumes, 'volumes') : [], config, facts: ctx.memoryFacts('payer_rate_floor') }) }; };
const rateLine = (o) => `${o.payers.length} payer(s) by percent of Medicare at your volume: ${o.payers.map((p) => `${p.payer} ${p.percent_of_medicare ?? 'n/a'}%`).join(', ')}. ${o.below_floor} rate(s) below the floor, ${o.gap_to_floor} a year to reach it.${o.no_medicare.length ? ` No Medicare amount for: ${o.no_medicare.join(', ')}.` : ''}`;
const pair = draftPair({
  prefix: 'laurel', noun: 'rate_request', verb: 'send', category: 'binding_send', outDir: OUT, actor: 'your practice manager',
  title: 'Draft a rate request to one payer',
  description: 'Write a draft letter asking one payer to raise the rates below your floor, with each code, the current rate, Medicare and the rate asked for, and your volume. Marked DRAFT; nothing is sent.',
  args: { ...rateFiles, payer: { type: 'string', minLength: 1 } }, required: ['payer_fees', 'medicare', 'payer'],
  build: (a, ctx) => {
    const { out, config } = rates(a, ctx);
    const ls = out.lines.filter((l) => payerKey(l.payer) === payerKey(a.payer) && l.below_floor);
    if (!ls.length) throw new Error(`no ${a.payer} rate is below the floor; nothing to ask for`);
    const P = (config.payers || []).find((x) => payerKey(x.name) === payerKey(a.payer));
    const rows = ls.map((l) => `| ${l.code}${l.modifier ? `-${l.modifier}` : ''} | ${l.allowed} | ${l.medicare} | ${l.percent_of_medicare}% | ${round2(l.medicare * l.floor_percent / 100)} | ${l.volume || ''} |`).join('\n');
    return { id: `${ls[0].payer}`.replace(/\s+/g, '-').toLowerCase(), to: P && P.contact ? P.contact : `${ls[0].payer} provider contracting`, text: `**To:** ${P && P.contact ? P.contact : `${ls[0].payer} provider contracting [TO CONFIRM: contact name and address]`}\n**From:** ${config.practice_name || '[MISSING: practice name]'}\n**Subject:** Request to review reimbursement rates\n\nWe value our participation with ${ls[0].payer}. The rates below are under ${ls[0].floor_percent}% of the current Medicare amount for our area. We ask you to bring them to at least that level from [TO CONFIRM: proposed effective date].\n\n| Code | Your rate | Medicare | Percent | Asked | Our yearly units |\n|---|---|---|---|---|---|\n${rows}\n\n[CHECK: the contract section on rate changes and the notice it requires]\n\n[MISSING: one or two sentences on access, quality or growth that matter to this payer]\n\nContact: [MISSING: name and phone]\n` };
  },
});
const refused = refusedTools([
  { name: 'contract_sign', category: 'binding_send', description: 'Laurel never signs, accepts or terminates contracts.' },
  { name: 'termination_notice_send', category: 'binding_send', description: 'Laurel never sends notices to payers; a person does after legal review.' },
]);

export const manifest = defineManifest({
  name: 'laurel-of-contracts', version: pkg.version,
  description: 'Compares what each payer pays per code against Medicare and each other, weighted by your volume, flags rates below your floor with the yearly gap, keeps a calendar of contract end dates and notice deadlines (auto-renewal traps included), and drafts a rate request for a person to send.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { contract_config: CONTRACT_CONFIG_SCHEMA },
  memory: { prefix: 'laurel', kinds: MEMORY_KINDS },
  sources: {
    payer_fees: { label: 'Payer fee schedules', args: ['payer_fees'], fields: PAYER_FEE_FIELDS },
    medicare: { label: 'Medicare amounts', args: ['medicare'], fields: MEDICARE_FIELDS },
    volumes: { label: 'Volumes', args: ['volumes'], fields: VOLUME_FIELDS },
    contracts: { label: 'Contract register', args: ['contracts'], fields: CONTRACT_FIELDS },
  },
  argDocs: { payer: 'Payer name as it appears in the fee file', limit: 'Most rows to return (the report file always has all of them)', below_floor_only: 'Only rates below the floor' },
  prompts: [{
    name: 'contract_review', title: 'Review payer rates and renewal dates',
    description: 'Walks the host model through a payer contract review with Laurel.',
    arguments: [{ name: 'payer_fees', description: 'payer fee schedules', required: true }, { name: 'medicare', description: 'Medicare amounts', required: true }, { name: 'contracts', description: 'contract register', required: false }],
    text: `You are helping a practice manager with laurel-of-contracts. Payer fees: {{payer_fees}}. Medicare: {{medicare}}. Contracts: {{contracts}}.

Rules: Laurel never signs, accepts or sends anything to payers. Laurel is not legal advice: contract terms need a person (and often a lawyer).

1. Call laurel_rates. Rank payers by percent of Medicare at the practice's volume and name the rates below the floor.
2. Call laurel_calendar if a contract register is given; notice deadlines come first.
3. Offer laurel_draft_rate_request for the payer with the largest gap; the practice manager approves and sends it.
4. Call laurel_write_report for the full comparison.`,
  }],
  tools: [
    { name: 'laurel_rates', kind: 'read', title: 'Compare payer rates',
      description: 'Each payer\'s rates against Medicare weighted by your volume, the rates below the floor with the yearly gap, and the codes with the widest spread between payers.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['payer_fees', 'medicare'], properties: { ...rateFiles, below_floor_only: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = rates(a, ctx); const { lines, ...t } = out; return { summary: rateLine(out), ...t, ...page(a.below_floor_only ? lines.filter((l) => l.below_floor) : lines, a.limit || 200) }; } },
    { name: 'laurel_calendar', kind: 'read', title: 'Contract renewal calendar',
      description: 'Every contract with its end date, notice deadline, days left and status (notice_window, notice_passed, expired, renews_automatically, no_end_date, active) and the next step.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['contracts'], properties: calFiles },
      handler: async (a, ctx) => { const config = cfg(a, ctx); const rows = contractCalendar(ctx.records(a.contracts, 'contracts'), { asOf: a.as_of || today(), warnDays: config.warn_days ?? 120 }); const by = rows.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {}); return { summary: `${rows.length} contract(s): ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}.${rows[0] && rows[0].status === 'notice_window' ? ` Next deadline: ${rows[0].payer} on ${rows[0].notice_deadline}.` : ''}`, by_status: by, contracts: rows }; } },
    ...pair.tools,
    reportTool({
      name: 'laurel_write_report', title: 'Write the payer rate comparison', outDir: OUT, base: 'laurel-rates',
      description: 'Write laurel-rates.csv (one row per payer and code with blank owner and decision columns) and laurel-rates.html (payer ranking and, with a contract register, the renewal calendar) into out_dir (default remedy-out/laurel).',
      properties: { ...rateFiles, contracts: calFiles.contracts, as_of: calFiles.as_of }, required: ['payer_fees', 'medicare'],
      build: (a, ctx) => {
        const { out, config } = rates(a, ctx);
        const rows = out.lines.map((l) => ({ payer: l.payer, code: l.code, modifier: l.modifier || '', allowed: l.allowed, medicare: l.medicare ?? '', percent_of_medicare: l.percent_of_medicare ?? '', floor_percent: l.floor_percent ?? '', below_floor: l.below_floor ? 'yes' : '', volume: l.volume || '', gap_to_floor: l.gap_to_floor, owner: '', decision: '' }));
        const sections = [{ title: sectionTitle('by_payer'), rows: out.payers, columns: ['payer', 'codes', 'percent_of_medicare', 'below_floor', 'gap_to_floor', 'yearly_at_volume'] }];
        if (a.contracts) sections.push({ title: sectionTitle('by_status'), rows: contractCalendar(ctx.records(a.contracts, 'contracts'), { asOf: a.as_of || today(), warnDays: config.warn_days ?? 120 }), columns: ['payer', 'end_date', 'notice_deadline', 'days_to_deadline', 'status', 'next_step'] });
        return {
          title: { en: 'Payer rate comparison', de: 'Vergleich der Kostenträger-Vergütungen', fr: 'Comparaison des tarifs des payeurs', es: 'Comparación de tarifas por pagador', pt: 'Comparação de tarifas por operadora', it: 'Confronto delle tariffe dei pagatori', ja: '支払者別料金比較', zh: '支付方费率比较', ko: '지불자별 수가 비교' },
          intro: rateLine(out), rows, summary: `Payer rate comparison written: ${rateLine(out)}`,
          htmlColumns: ['payer', 'code', 'allowed', 'medicare', 'percent_of_medicare', 'below_floor', 'volume', 'gap_to_floor'], sections,
          limits: [LIMITS.files, LIMITS.contract, 'Not legal advice: notice periods and renewal terms are as entered in your register; the signed contract governs.', LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'laurel_rates', decision: 'allow' },
    { tool: 'laurel_calendar', decision: 'allow' },
    { tool: 'laurel_write_report', decision: 'allow' },
    ...pair.rules,
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Laurel allowlist.' },
  ] },
});
