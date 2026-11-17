import { defineManifest, MODEL_PIN, CLAIM_FIELDS, readClaims, groupClaims, looksX12, isoDate, str, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, LIMITS, today } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { checkDme } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/cumin';
const HCPCS = { type: 'string', pattern: '^[A-Va-v]\\d{4}$' };

export const DME_CLAIM_FIELDS = Object.freeze({
  ...CLAIM_FIELDS,
  order_date: { aliases: ['Order Date', 'Written Order Date', 'WOPD Date', 'Prescription Date', 'Rx Date', 'SWO Date'], type: 'date', translate: false },
  delivery_date: { aliases: ['Delivery Date', 'Delivered', 'Date Delivered', 'POD Date', 'Proof of Delivery Date'], type: 'date', translate: false },
});
export const HISTORY_FIELDS = Object.freeze({
  patient_name: { aliases: ['Patient', 'Patient Name'] },
  member_id: { aliases: ['Member ID', 'Medicare ID', 'MBI', 'Subscriber ID', 'Insurance ID'], translate: false },
  date_of_service: { aliases: ['Date of Service', 'DOS', 'Service Date', 'From Date', 'Billed Month'], type: 'date', required: true, translate: false },
  code: { aliases: ['HCPCS', 'Code', 'Item Code', 'Procedure Code'], required: true, translate: false },
  modifiers: { aliases: ['Modifiers', 'Modifier', 'Mods'], translate: false },
});

const ITEM = { type: 'object', additionalProperties: false, required: ['code'], properties: {
  code: HCPCS, label: { type: 'string', maxLength: 120 }, category: { type: 'string', enum: ['capped_rental', 'oxygen', 'purchase', 'supply', 'rental'] },
  paired: { type: 'boolean' }, prior_auth: { type: 'boolean' }, kx: { type: 'boolean' }, order_before_delivery: { type: 'boolean' }, max_units: { type: 'integer', minimum: 1, maximum: 10000 },
  payer: { type: 'string', maxLength: 120 }, note: { type: 'string', maxLength: 300 },
} };
const { category: _category, ...RULE_PROPS } = ITEM.properties; // memory adds checks; it cannot change an item's category
const DME_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    items: { type: 'array', maxItems: 2000, items: { ...ITEM, required: ['code', 'category'] }, description: 'Your item table: category, pairing, prior authorization, KX, order-before-delivery and unit limits per HCPCS code (overrides the small built-in table code by code)' },
    gap_days: { type: 'integer', minimum: 31, maximum: 365, description: 'Days between rental months that start a new rental period (default 60)' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  dme_item_rule: {
    description: 'A rule for one item (and optionally one payer) learned from a denial, e.g. {"code": "E0601", "payer": "Example Health Plan", "kx": true, "note": "Adherence download needed after 90 days (fictional)"}.',
    effect: 'adds checks for that item: prior authorization, KX, order before delivery, pairing, or a lower unit limit. It never removes a check.',
    schema: { ...ITEM, properties: RULE_PROPS },
  },
});
const MEMORY = memoryTools('cumin', MEMORY_KINDS);

const files = {
  claims: { type: 'string', description: 'DME claims under --root: an 837P or a claim export with HCPCS, modifiers, units, and order and delivery dates' },
  history: { type: 'string', description: 'Optional earlier claim lines under --root (patient or member id, date, HCPCS, modifiers) to count rental months' },
  config: { type: 'string', description: 'Optional dme_config JSON: your item table and the rental gap that starts a new period' },
  as_of: { type: 'string', format: 'date', description: 'Date to judge rentals from (YYYY-MM-DD, default today)' },
};
/** Claims with the order and delivery dates kept on each line (groupClaims keeps only the standard fields). */
function readDmeClaims(ctx, path) {
  const text = (() => { try { return ctx.readText(path).slice(0, 200); } catch { return ''; } })();
  if (looksX12(text)) return readClaims(ctx, path, 'claims').claims;
  const rows = ctx.records(path, 'claims');
  const claims = groupClaims(rows);
  // Each claim line takes the first unused row with the same claim, code and date (indexed once).
  const queue = new Map();
  rows.forEach((r, n) => { const k = `${str(r.claim_id)}|${str(r.code).toUpperCase()}|${isoDate(r.date_of_service) || null}`; if (!queue.has(k)) queue.set(k, []); queue.get(k).push(n); });
  for (const c of claims) for (const l of c.lines) {
    const q = queue.get(`${c.claim_id}|${l.code}|${l.date_from}`); const i = q && q.length ? q.shift() : -1;
    if (i >= 0) { l.order_date = isoDate(rows[i].order_date); l.delivery_date = isoDate(rows[i].delivery_date); }
  }
  return claims;
}
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'dme_config') : {};
  return checkDme(readDmeClaims(ctx, a.claims), a.history ? ctx.records(a.history, 'history') : [], { config, facts: ctx.memoryFacts('dme_item_rule'), asOf: a.as_of || today() });
};
const sumLine = (o) => `${o.claims} claim(s), ${o.lines} line(s): ${o.errors} with errors, ${o.warnings} with warnings. ${Object.entries(o.by_check).filter(([k]) => k !== 'unknown_item').map(([k, v]) => `${k} ${v}`).join(', ') || 'No issues'}. ${o.rentals.length} rental(s): ${o.rentals.filter((r) => r.status === 'renting').length} renting, ${o.rentals.filter((r) => r.status === 'capped_owned').length} capped (patient owns), ${o.rentals.filter((r) => r.status === 'oxygen_cap_reached').length} at the oxygen cap.`;
const refused = refusedTools([
  { name: 'claim_submit', category: 'binding_send', description: 'Cumin never sends claims; the supplier does, after fixing them.' },
  { name: 'order_sign', category: 'binding_send', description: 'Only the treating practitioner signs an order.' },
]);

export const manifest = defineManifest({
  name: 'cumin-of-dme', version: pkg.version,
  description: 'DME claims and rentals kept straight: checks HCPCS codes, rental and purchase modifiers, the capped-rental month (KH, KI, KJ) and the 13-month cap, oxygen months past 36, right and left on paired items, prior authorization, the written order before delivery, units and duplicates, and tracks every rental to its next month and modifier. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { dme_config: DME_CONFIG_SCHEMA },
  memory: { prefix: 'cumin', kinds: MEMORY_KINDS },
  sources: {
    claims: { label: 'DME claims (837P or claim export)', args: ['claims'], fields: DME_CLAIM_FIELDS },
    history: { label: 'Earlier DME claim lines', args: ['history'], fields: HISTORY_FIELDS },
  },
  argDocs: { ref: 'Claim id from cumin_check', limit: 'Most rows to return (the report file always has all of them)', status: 'Only rows with this status', check: 'Only lines with an issue of this kind' },
  prompts: [{
    name: 'dme_claim_check', title: 'Check DME claims and rentals',
    description: 'Walks the host model through a DME claim and rental check with Cumin.',
    arguments: [{ name: 'claims', description: 'DME claims for the month', required: true }, { name: 'history', description: 'earlier rental lines', required: false }],
    text: `You are helping a DME billing lead with cumin-of-dme. Claims: {{claims}}. History: {{history}}.

Rules: Cumin never sends claims or signs orders. Patient names are pseudonyms in results. The item table is the supplier's config or a small built-in example, not any MAC's policy.

1. Call cumin_check. Fix errors first: rental month modifiers, caps, sides, prior authorization, orders after delivery.
2. Call cumin_rentals for what to bill next month and which rentals are capped.
3. If a payer denied for a rule the table missed, offer cumin_learn (kind dme_item_rule).
4. Call cumin_write_report for the list with real names.`,
  }],
  tools: [
    { name: 'cumin_check', kind: 'read', title: 'Check DME claim lines',
      description: 'Every line with its status (error, warning, ok), rental month and issues: code, rental_modifier, rental_month, cap, gap, side, prior_auth, kx, units, order, delivery, duplicate, unknown_item.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims'], properties: { ...files, status: { type: 'string', enum: ['error', 'warning', 'ok'] }, check: { type: 'string', enum: ['code', 'rental_modifier', 'rental_month', 'cap', 'gap', 'side', 'prior_auth', 'kx', 'units', 'order', 'delivery', 'duplicate', 'unknown_item'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const { items, rentals, ...t } = o; let list = a.status ? items.filter((i) => i.status === a.status) : items; if (a.check) list = list.filter((i) => i.issues.some((x) => x.check === a.check)); return { summary: sumLine(o), ...t, rentals: rentals.length, ...page(list, a.limit || 200) }; } },
    { name: 'cumin_rentals', kind: 'read', title: 'Track rentals',
      description: 'Every rental period per patient and item: start, months billed, cap, status (renting, capped_owned, oxygen_cap_reached, stopped, rental) and the next month\'s date and modifiers.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims'], properties: { ...files, status: { type: 'string', enum: ['renting', 'capped_owned', 'oxygen_cap_reached', 'stopped', 'rental'] } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const list = a.status ? o.rentals.filter((r) => r.status === a.status) : o.rentals; return { summary: `${o.rentals.length} rental period(s). ${['renting', 'capped_owned', 'oxygen_cap_reached', 'stopped'].map((s) => `${s} ${o.rentals.filter((r) => r.status === s).length}`).join(', ')}.`, ...page(list, 500) }; } },
    { name: 'cumin_explain', kind: 'read', title: 'Explain one DME claim',
      description: 'Every line of one claim with its item, modifiers, rental month and each issue in plain words.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['claims', 'ref'], properties: { ...files, ref: { type: 'string' } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const hit = findItem(o.items, 'claim_id', a.ref, ctx, { label: 'claim' }); const lines = o.items.filter((i) => i.claim_id === hit.claim_id).sort((x, y) => x.line - y.line); return { summary: `${hit.claim_id}: ${lines.map((l) => `${l.code}${l.modifiers ? `-${l.modifiers.replace(/ /g, '-')}` : ''}${l.rental_month ? ` (rental month ${l.rental_month})` : ''} ${l.status}${l.issues.length ? `: ${l.issues.map((i) => i.message).join(' ')}` : ''}`).join('; ')}`, lines }; } },
    reportTool({
      name: 'cumin_write_report', title: 'Write the DME claim and rental list', outDir: OUT, base: 'cumin-dme',
      description: 'Write cumin-dme.csv (one row per issue with blank owner and fixed columns) and cumin-dme.html (with every rental and its next month) into out_dir (default remedy-out/cumin).',
      properties: files, required: ['claims'],
      build: (a, ctx) => {
        const o = run(a, ctx);
        const rows = o.items.flatMap((i) => (i.issues.length ? i.issues : [{ check: '', severity: 'ok', message: '' }]).map((x) => ({ status: i.status, claim_id: i.claim_id, line: i.line, patient_name: i.patient_name, payer: i.payer || '', date_of_service: i.date_of_service, code: i.code, modifiers: i.modifiers, rental_month: i.rental_month ?? '', check: x.check, severity: x.severity, message: x.message, owner: '', fixed: '' })));
        return {
          title: { en: 'DME claims and rentals', de: 'Hilfsmittel: Abrechnungen und Mietverläufe', fr: 'Équipements médicaux : demandes et locations', es: 'Equipo médico: reclamaciones y alquileres', pt: 'Equipamentos médicos: cobranças e locações', it: 'Ausili medici: richieste e noleggi', ja: '医療機器の請求とレンタル', zh: '耐用医疗设备的索赔与租赁', ko: '의료기기 청구 및 대여' },
          intro: sumLine(o), rows, summary: `DME list written: ${sumLine(o)}`,
          htmlColumns: ['status', 'claim_id', 'date_of_service', 'code', 'modifiers', 'rental_month', 'check', 'message'],
          sections: [{ title: sectionTitle('by_status'), rows: o.rentals, columns: ['patient_name', 'code', 'item', 'start', 'months_billed', 'cap', 'status', 'next_date', 'next_modifiers'] }],
          limits: [LIMITS.files, 'Rental months are counted from the lines you supply; a payer counts from its own records. The item table is your config or a small built-in example, not any contractor\'s medical policy.', LIMITS.codes, LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'cumin_check', decision: 'allow' },
    { tool: 'cumin_rentals', decision: 'allow' },
    { tool: 'cumin_explain', decision: 'allow' },
    { tool: 'cumin_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Cumin allowlist.' },
  ] },
});
