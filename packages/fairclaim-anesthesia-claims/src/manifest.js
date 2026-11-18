import { defineManifest, MODEL_PIN, CLAIM_FIELDS, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, LIMITS, str, num } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { anesthesiaClaims, checkAnesthesia } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/anesthesia';

export const ANES_FIELDS = Object.freeze({
  ...CLAIM_FIELDS,
  case_id: { aliases: ['Case ID', 'Case Number', 'Case #', 'Anesthesia Case', 'Encounter Case'], translate: false },
});
export const BASE_UNIT_FIELDS = Object.freeze({
  code: { aliases: ['Code', 'CPT Code', 'Anesthesia Code', 'ASA Code', 'HCPCS'], required: true, translate: false },
  base_units: { aliases: ['Base Units', 'Base Unit', 'Base Unit Value', 'Base', 'Anesthesia Base Units'], type: 'number', required: true, translate: false },
  description: { aliases: ['Description', 'Descriptor', 'Short Descriptor'] },
});

const ANES_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    unit_minutes: { type: 'integer', minimum: 1, maximum: 60, description: 'Minutes per time unit (default 15)' },
    rounding: { type: 'string', enum: ['tenth', 'up', 'nearest'], description: 'Time unit rounding: tenth (minutes / 15 to one decimal, as Medicare counts), up or nearest (default tenth)' },
    max_minutes: { type: 'integer', minimum: 60, maximum: 2880, description: 'Warn when a case is longer than this (default 720)' },
    payers: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: false, required: ['name'], properties: {
      name: { type: 'string', minLength: 1 }, conversion_factor: { type: 'number', minimum: 0, maximum: 1000 }, unit_minutes: { type: 'integer', minimum: 1, maximum: 60 },
      rounding: { type: 'string', enum: ['tenth', 'up', 'nearest'] }, ps_qc_units: { type: 'boolean' },
    } }, description: 'Per payer: conversion factor, time unit and rounding, and whether physical status and qualifying circumstance units are paid' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_ps_required: {
    description: 'A payer that denies anesthesia claims without a physical status modifier, e.g. {"payer": "Sample Mutual Insurance", "note": "Denied CO-4 without P1-P6 (fictional)"}.',
    effect: 'turns a missing P1-P6 for that payer from a warning into an error. It only makes the check stricter.',
    schema: { type: 'object', additionalProperties: false, required: ['payer'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('anesthesia', MEMORY_KINDS);

const files = {
  cases: { type: 'string', description: 'Anesthesia claims under --root, one row per line: claim and case id, patient, payer, provider, date, anesthesia code, modifiers, start and stop times, minutes, units; qualifying circumstance codes (99100, 99116, 99135, 99140) as extra lines' },
  base_units: { type: 'string', description: 'Base unit table under --root (code, base units): the CMS anesthesia base units file for the year, or your payer\'s table' },
  config: { type: 'string', description: 'Optional anesthesia_config JSON: time unit, rounding, case length check and per-payer conversion factors' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'anesthesia_config') : {};
  const base = new Map(ctx.records(a.base_units, 'base_units').map((r) => [str(r.code).toUpperCase(), num(r.base_units)]).filter(([k, v]) => k && v !== null));
  return checkAnesthesia(anesthesiaClaims(ctx.records(a.cases, 'cases')), base, { config, facts: ctx.memoryFacts('payer_ps_required') });
};
const sumLine = (o) => `${o.claims} anesthesia claim(s): ${o.errors} with errors, ${o.warnings} with warnings. ${Object.entries(o.by_check).map(([k, v]) => `${k} ${v}`).join(', ') || 'No issues'}.`;
const refused = refusedTools([
  { name: 'claim_submit', category: 'binding_send', description: 'Fairclaim Anesthesia Claims never sends claims; the billing team does, after fixing them.' },
  { name: 'record_edit', category: 'binding_send', description: 'Fairclaim Anesthesia Claims never changes anesthesia times in the record; the clinician corrects the record.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-anesthesia-claims', version: pkg.version,
  description: 'Anesthesia claims priced and paired right: computes base, time, physical-status and qualifying-circumstance units per payer, checks start and stop times against reported minutes, checks AA, QK, QY, QX, QZ and AD against how many cases the anesthesiologist covered at once, pairs each CRNA claim with its medical direction, and flags overlapping cases. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { anesthesia_config: ANES_CONFIG_SCHEMA },
  memory: { prefix: 'anesthesia', kinds: MEMORY_KINDS },
  sources: {
    cases: { label: 'Anesthesia claims', args: ['cases'], fields: ANES_FIELDS },
    base_units: { label: 'Anesthesia base units', args: ['base_units'], fields: BASE_UNIT_FIELDS },
  },
  argDocs: { ref: 'Claim id from anesthesia_check', limit: 'Most claims to return (the report file always has all of them)', status: 'Only claims with this status', check: 'Only claims with an issue of this kind' },
  prompts: [{
    name: 'anesthesia_check', title: 'Check anesthesia claims',
    description: 'Walks the host model through anesthesia claims with Fairclaim Anesthesia Claims.',
    arguments: [{ name: 'cases', description: 'anesthesia claim export', required: true }, { name: 'base_units', description: 'base unit table', required: true }],
    text: `You are helping an anesthesia billing lead with fairclaim-anesthesia-claims. Claims: {{cases}}. Base units: {{base_units}}.

Rules: Fairclaim Anesthesia Claims never sends claims or edits the record. Patient names are pseudonyms in results. Times come from the record; never suggest changing a time to fit a modifier.

1. Call anesthesia_check. Report concurrency and pairing errors first (they change the modifier), then time errors, then units.
2. For a concurrency error, say which modifier the number of cases supports; the record must show the medical direction steps.
3. Call anesthesia_explain for any claim the person asks about.
4. Call anesthesia_write_report for the list with real names.`,
  }],
  tools: [
    { name: 'anesthesia_check', kind: 'read', title: 'Check anesthesia claims',
      description: 'Every claim with minutes, base, time and extra units, total units, the expected allowed amount when a conversion factor is set, the peak number of concurrent cases, and issues: code, base_units, time, pricing_modifier, physical_status, qualifying, concurrency, pairing, overlap, units.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['cases', 'base_units'], properties: { ...files, status: { type: 'string', enum: ['error', 'warning', 'ok'] }, check: { type: 'string', enum: ['code', 'base_units', 'time', 'pricing_modifier', 'physical_status', 'qualifying', 'concurrency', 'pairing', 'overlap', 'units'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const { items, ...t } = o; let list = a.status ? items.filter((i) => i.status === a.status) : items; if (a.check) list = list.filter((i) => i.issues.some((x) => x.check === a.check)); return { summary: sumLine(o), ...t, ...page(list, a.limit || 200) }; } },
    { name: 'anesthesia_explain', kind: 'read', title: 'Explain one anesthesia claim',
      description: 'One claim with its times, unit arithmetic, modifiers, concurrency and each issue in plain words.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['cases', 'base_units', 'ref'], properties: { ...files, ref: { type: 'string' } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const c = findItem(o.items, 'claim_id', a.ref, ctx, { label: 'claim' }); return { summary: `${c.claim_id}: ${c.code} ${c.modifiers}, ${c.start || '?'}-${c.stop || '?'} (${c.minutes ?? '?'} min). Units: base ${c.base_units ?? '?'} + time ${c.time_units ?? '?'}${c.extra_units ? ` + ${c.extra_units}` : ''} = ${c.units ?? '?'}${c.units_billed !== null ? ` (billed ${c.units_billed})` : ''}.${c.concurrency ? ` Peak concurrent cases: ${c.concurrency}.` : ''} ${c.issues.map((i) => i.message).join(' ')}`.trim(), claim: c }; } },
    reportTool({
      name: 'anesthesia_write_report', title: 'Write the anesthesia claim list', outDir: OUT, base: 'anesthesia',
      description: 'Write anesthesia.csv (one row per claim with the unit arithmetic, issues and blank owner and fixed columns) and anesthesia.html (with counts by check) into out_dir (default remedy-out/anesthesia).',
      properties: files, required: ['cases', 'base_units'],
      build: (a, ctx) => {
        const o = run(a, ctx);
        const rows = o.items.map((i) => ({ status: i.status, claim_id: i.claim_id, patient_name: i.patient_name, payer: i.payer || '', provider: i.provider || '', date_of_service: i.date_of_service, code: i.code || '', modifiers: i.modifiers, start: i.start || '', stop: i.stop || '', minutes: i.minutes ?? '', base_units: i.base_units ?? '', time_units: i.time_units ?? '', extra_units: i.extra_units ?? '', units: i.units ?? '', units_billed: i.units_billed ?? '', expected_allowed: i.expected_allowed ?? '', concurrency: i.concurrency ?? '', message: i.issues.map((x) => x.message).join(' '), owner: '', fixed: '' }));
        return {
          title: { en: 'Anesthesia claim check', de: 'Prüfung der Anästhesie-Abrechnungen', fr: 'Contrôle des demandes d\'anesthésie', es: 'Revisión de reclamaciones de anestesia', pt: 'Verificação de cobranças de anestesia', it: 'Controllo delle richieste di anestesia', ja: '麻酔請求チェック', zh: '麻醉索赔检查', ko: '마취 청구 점검' },
          intro: sumLine(o), rows, summary: `Anesthesia list written: ${sumLine(o)}`,
          htmlColumns: ['status', 'claim_id', 'provider', 'date_of_service', 'code', 'modifiers', 'start', 'stop', 'minutes', 'units', 'units_billed', 'concurrency', 'message'],
          sections: [{ title: sectionTitle('by_rule'), rows: Object.entries(o.by_check).map(([check, count]) => ({ check, count })), columns: ['check', 'count'] }],
          limits: [LIMITS.files, 'Base units come from the table you load; payers differ on time rounding and on paying physical status and qualifying circumstance units. Concurrency is counted from the times in this file only.', LIMITS.codes, LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'anesthesia_check', decision: 'allow' },
    { tool: 'anesthesia_explain', decision: 'allow' },
    { tool: 'anesthesia_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Anesthesia Claims allowlist.' },
  ] },
});
