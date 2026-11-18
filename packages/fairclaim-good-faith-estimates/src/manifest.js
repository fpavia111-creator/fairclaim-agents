import { defineManifest, MODEL_PIN, refusedTools, memoryTools, reportTool, draftPair, findItem, page, sectionTitle, LIMITS, today, round2 } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { checkTiming, compareBills, estimateLines } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/estimates';
const CODE = { type: 'string', pattern: '^[A-Za-z0-9]{1,5}$' };

export const GFE_FIELDS = Object.freeze({
  appointment_id: { aliases: ['Appointment ID', 'Appt ID', 'Visit ID', 'Encounter ID', 'Request ID'], required: true, translate: false },
  patient_name: { aliases: ['Patient', 'Patient Name', 'Pt Name'], phi: 'name' },
  coverage: { aliases: ['Insurance', 'Coverage', 'Primary Insurance', 'Payer', 'Financial Class'] },
  self_pay: { aliases: ['Self Pay', 'Self-Pay', 'Uninsured', 'Not Billing Insurance'] },
  scheduled_on: { aliases: ['Scheduled On', 'Date Scheduled', 'Booked On', 'Created Date', 'Booking Date'], type: 'date', translate: false },
  service_date: { aliases: ['Service Date', 'Appointment Date', 'DOS', 'Visit Date', 'Date of Service'], type: 'date' },
  requested_on: { aliases: ['Requested On', 'Estimate Requested', 'GFE Requested', 'Request Date'], type: 'date', translate: false },
  issued_on: { aliases: ['GFE Issued', 'Estimate Issued', 'Issued On', 'Estimate Sent', 'GFE Sent'], type: 'date', translate: false },
  visit_type: { aliases: ['Visit Type', 'Appointment Type', 'Service', 'Procedure Type'] },
  codes: { aliases: ['Planned Codes', 'CPT', 'Expected Codes', 'Codes', 'Procedure Codes'], translate: false },
});
export const COMPARE_FIELDS = Object.freeze({
  gfe_id: { aliases: ['GFE ID', 'Estimate ID', 'GFE #', 'Estimate #'], required: true, translate: false },
  patient_name: { aliases: ['Patient', 'Patient Name'], phi: 'name' },
  provider: { aliases: ['Provider', 'Facility', 'Provider or Facility', 'Billing Provider'] },
  estimate: { aliases: ['Estimate', 'GFE Amount', 'Estimated', 'Estimated Total'], type: 'money', required: true },
  billed: { aliases: ['Billed', 'Billed Charges', 'Final Bill', 'Actual Charges', 'Charges'], type: 'money', required: true },
});
export const PRICE_FIELDS = Object.freeze({
  code: { aliases: ['CPT', 'Code', 'HCPCS', 'Procedure Code'], required: true, translate: false },
  description: { aliases: ['Description', 'Service', 'Procedure'] },
  price: { aliases: ['Self-Pay Price', 'Self Pay Price', 'Cash Price', 'Discounted Cash Price', 'Price', 'Fee'], type: 'money', required: true },
});

const GFE_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    holidays: { type: 'array', maxItems: 60, items: { type: 'string', format: 'date' }, description: 'Office holidays that do not count as business days' },
    threshold: { type: 'number', minimum: 1, maximum: 100000, description: 'Dollars billed over the estimate (per provider) that let a patient dispute (default 400)' },
    practice_name: { type: 'string', minLength: 1 },
  },
};

export const MEMORY_KINDS = Object.freeze({
  visit_type_codes: {
    description: 'Codes that a visit type usually includes, so estimates are complete, e.g. {"visit_type": "new patient", "codes": ["99204", "36415"], "note": "Most new patients get labs drawn"}.',
    effect: 'adds these codes to drafted estimates for that visit type. It only adds lines; it never removes a code.',
    schema: { type: 'object', additionalProperties: false, required: ['visit_type', 'codes'], properties: { visit_type: { type: 'string', minLength: 1, maxLength: 80 }, codes: { type: 'array', minItems: 1, maxItems: 50, items: CODE }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('estimates', MEMORY_KINDS);

const files = {
  schedule: { type: 'string', description: 'Self-pay schedule or estimate log under --root: appointment or request id, patient, coverage, date scheduled, service date, date requested, date the estimate was issued' },
  config: { type: 'string', description: 'Optional estimate_config JSON: office holidays, dispute threshold, practice name' },
  as_of: { type: 'string', format: 'date', description: 'Date to count from (YYYY-MM-DD, default today)' },
};
const cfg = (a, ctx) => (a.config ? ctx.readJson(a.config, 'estimate_config') : {});
const timing = (a, ctx) => { const config = cfg(a, ctx); return { config, out: checkTiming(ctx.records(a.schedule, 'schedule'), { config, asOf: a.as_of || today() }) }; };
const timeLine = (o) => `${o.visits} visit(s) or request(s): ${Object.entries(o.by_status).map(([k, v]) => `${k} ${v}`).join(', ')}. ${o.need_action} estimate(s) to send.`;
const codesOf = (v) => String(v || '').split(/[\s,;|]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
const pair = draftPair({
  prefix: 'estimates', noun: 'estimate', verb: 'send', category: 'binding_send', outDir: OUT, actor: 'your front-desk lead',
  title: 'Draft a good faith estimate',
  description: 'Write a draft estimate for one self-pay visit from your self-pay prices: each service, price and total, with the elements a person must add (diagnosis if known, co-provider charges, your approved template\'s notices). Marked DRAFT; nothing is sent.',
  args: { ...files, prices: { type: 'string', description: 'Self-pay price list under --root: code, description, price' }, appointment_id: { type: 'string' }, codes: { type: 'array', maxItems: 50, items: CODE, description: 'Codes to estimate (default: the visit\'s planned codes and any learned for its visit type)' } }, required: ['schedule', 'prices', 'appointment_id'],
  build: (a, ctx) => {
    const config = cfg(a, ctx);
    const rows = ctx.records(a.schedule, 'schedule');
    const v = findItem(rows, 'appointment_id', a.appointment_id, ctx, { label: 'appointment' });
    const learned = ctx.memoryFacts('visit_type_codes').filter((f) => v.visit_type && String(v.visit_type).toLowerCase().includes(f.value.visit_type.toLowerCase()));
    const codes = [...new Set([...(a.codes || codesOf(v.codes)), ...learned.flatMap((f) => f.value.codes)])];
    if (!codes.length) throw new Error(`no codes to estimate for ${a.appointment_id}: pass codes`);
    const lines = estimateLines(codes, ctx.records(a.prices, 'prices'));
    const total = round2(lines.reduce((s, l) => s + (l.total || 0), 0));
    const table = lines.map((l) => `| ${l.code} | ${l.description || '[MISSING: description]'} | ${l.units} | ${l.price ?? '[MISSING: self-pay price]'} | ${l.total ?? ''} |`).join('\n');
    return { id: String(v.appointment_id), to: v.patient_name || null, amount: total, extra: { fact_ids: learned.map((f) => f.id) }, text: `**To:** ${v.patient_name || '[MISSING: patient]'}\n**From:** ${config.practice_name || '[MISSING: practice name and address]'}\n**Good faith estimate** for ${v.visit_type || 'the scheduled service'} on ${v.service_date || '[TO CONFIRM: service date]'}\n\n| Code | Service | Units | Price | Total |\n|---|---|---|---|---|\n${table}\n\n**Estimated total from this provider:** ${total}\n\n- [MISSING: diagnosis codes, if known]\n- [CHECK: add expected charges from other providers or facilities (anesthesia, lab, imaging) or list them as not included]\n- [CHECK: use your approved estimate template with the required notices (not a contract; the right to dispute a bill 400 dollars or more over the estimate)]\n` };
  },
});
const refused = refusedTools([
  { name: 'estimate_send', category: 'binding_send', description: 'Fairclaim Good Faith Estimates never sends estimates to patients; a person sends the approved draft.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-good-faith-estimates', version: pkg.version,
  description: 'Keeps good faith estimates for self-pay and uninsured patients on time: counts business days from scheduling or request to each estimate\'s due date, finds missing and late estimates, compares final bills with estimates per provider against the 400-dollar dispute threshold, and drafts an estimate for a person to send. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { estimate_config: GFE_CONFIG_SCHEMA },
  memory: { prefix: 'estimates', kinds: MEMORY_KINDS },
  sources: { schedule: { label: 'Self-pay schedule or estimate log', args: ['schedule'], fields: GFE_FIELDS }, bills: { label: 'Estimates and final bills', args: ['bills'], fields: COMPARE_FIELDS }, prices: { label: 'Self-pay price list', args: ['prices'], fields: PRICE_FIELDS } },
  argDocs: { appointment_id: 'Appointment or request id from estimates_timing', limit: 'Most rows to return (the report file always has all of them)', status: 'Only rows with this status' },
  prompts: [{
    name: 'estimate_timing', title: 'Check good faith estimates are on time',
    description: 'Walks the host model through estimate timing and bill checks with Fairclaim Good Faith Estimates.',
    arguments: [{ name: 'schedule', description: 'self-pay schedule', required: true }],
    text: `You are helping a front-desk lead with fairclaim-good-faith-estimates. Schedule: {{schedule}}.

Rules: Fairclaim Good Faith Estimates never sends anything to patients. Not legal advice: the timing summarised here is from the federal rule; state rules can add more.

1. Call estimates_timing. List missing estimates first, then those due soon, with due dates.
2. Offer estimates_draft_estimate for a visit that needs one; a person reviews and sends it.
3. If final bills are given, call estimates_compare and name estimates billed 400 dollars or more over for a provider.
4. Call estimates_write_report for the list with real names.`,
  }],
  tools: [
    { name: 'estimates_timing', kind: 'read', title: 'Check estimate timing',
      description: 'Each self-pay or uninsured visit or request with the estimate due date in business days, days left and status (missing, due, late, ok, not_required).',
      inputSchema: { type: 'object', additionalProperties: false, required: ['schedule'], properties: { ...files, status: { type: 'string', enum: ['missing', 'due', 'late', 'ok', 'not_required'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = timing(a, ctx); const { items, ...t } = out; return { summary: timeLine(out), ...t, ...page(a.status ? items.filter((i) => i.status === a.status) : items, a.limit || 200) }; } },
    { name: 'estimates_compare', kind: 'read', title: 'Compare bills with estimates',
      description: 'For each estimate and provider: estimate, billed, the difference and whether it reaches the dispute threshold (400 dollars by default).',
      inputSchema: { type: 'object', additionalProperties: false, required: ['bills'], properties: { bills: { type: 'string', description: 'Estimates and final bills under --root: estimate id, patient, provider, estimate, billed' }, config: files.config } },
      handler: async (a, ctx) => { const config = cfg(a, ctx); const out = compareBills(ctx.records(a.bills, 'bills'), { threshold: config.threshold ?? 400 }); return { summary: `${out.lines} estimate line(s): ${Object.entries(out.by_status).map(([k, v]) => `${k} ${v}`).join(', ')}. ${out.over_total} billed over estimates in total.`, ...out }; } },
    ...pair.tools,
    reportTool({
      name: 'estimates_write_report', title: 'Write the estimate list', outDir: OUT, base: 'estimates',
      description: 'Write estimates.csv (one row per visit or request with blank owner and sent columns) and estimates.html into out_dir (default remedy-out/estimates).',
      properties: files, required: ['schedule'],
      build: (a, ctx) => {
        const { out } = timing(a, ctx);
        const rows = out.items.map((i) => ({ status: i.status, appointment_id: i.appointment_id, patient_name: i.patient_name, service_date: i.service_date || '', scheduled_on: i.scheduled_on || '', requested_on: i.requested_on || '', due_on: i.due_on || '', issued_on: i.issued_on || '', message: i.message, owner: '', sent: '' }));
        return {
          title: { en: 'Good faith estimate list', de: 'Liste der Kostenvoranschläge', fr: 'Liste des estimations de bonne foi', es: 'Lista de estimaciones de buena fe', pt: 'Lista de estimativas de boa-fé', it: 'Elenco dei preventivi in buona fede', ja: '誠実見積もり一覧', zh: '善意估价清单', ko: '선의 견적 목록' },
          intro: timeLine(out), rows, summary: `Estimate list written: ${timeLine(out)}`,
          htmlColumns: ['status', 'appointment_id', 'service_date', 'scheduled_on', 'requested_on', 'due_on', 'issued_on', 'message'],
          sections: [{ title: sectionTitle('by_status'), rows: Object.entries(out.by_status).map(([k, v]) => ({ status: k, count: v })), columns: ['status', 'count'] }],
          limits: [LIMITS.files, 'Timing follows the federal good faith estimate rule as summarised in the README; check it and your state\'s rules. Not legal advice.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'estimates_timing', decision: 'allow' },
    { tool: 'estimates_compare', decision: 'allow' },
    { tool: 'estimates_write_report', decision: 'allow' },
    ...pair.rules,
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Good Faith Estimates allowlist.' },
  ] },
});
