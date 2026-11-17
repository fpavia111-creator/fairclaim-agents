import { defineManifest, MODEL_PIN, APPOINTMENT_FIELDS, readX12File, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, LIMITS } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { checkAppointments, AAA_REASONS } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/basil';

export const MEMORY_KINDS = Object.freeze({
  visit_type_review: {
    description: 'A payer and visit type your team always double-checks, e.g. {"payer": "Example Health Plan", "visit_type": "specialist", "note": "HMO plans need a referral on file"}.',
    effect: 'moves matching active visits to review with your note. It only adds a check; it never marks a visit as ready.',
    schema: { type: 'object', additionalProperties: false, required: ['payer'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, visit_type: { type: 'string', maxLength: 80 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('basil', MEMORY_KINDS);

const files = {
  appointments: { type: 'string', description: 'Appointment list under --root (CSV, Excel, JSON) with appointment id, date, patient, payer and member id' },
  eligibility: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' }, description: 'X12 271 response files under --root. A response is matched to a visit by its trace number (the appointment id) or the member id' },
};
const run = (a, ctx) => {
  const appts = ctx.records(a.appointments, 'appointments');
  const members = a.eligibility.flatMap((p) => (readX12File(ctx, p).by_set['271'] || []).flatMap((x) => x.members));
  return { out: checkAppointments(appts, members, { facts: ctx.memoryFacts('visit_type_review') }), responses: members.length };
};
const sumLine = (o) => `${o.appointments} visit(s): ${o.ready} ready, ${o.need_action} need action (${Object.entries(o.by_status).filter(([k]) => k !== 'active').map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}). Copays to collect at check-in: ${o.copay_to_collect}.`;
const refused = refusedTools([
  { name: 'eligibility_inquiry_send', category: 'binding_send', description: 'Basil never sends 270 inquiries; your clearinghouse or practice system does.' },
  { name: 'appointment_cancel', category: 'binding_send', description: 'Basil never changes the schedule; the front desk talks to the patient.' },
]);

export const manifest = defineManifest({
  name: 'basil-of-eligibility', version: pkg.version,
  description: 'Reads 271 eligibility responses against your appointment list and sorts every visit: active, inactive, member not found (with the AAA reason), plan ending before the visit, another payer primary, or no response. Shows copay, coinsurance and deductible left to collect. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  memory: { prefix: 'basil', kinds: MEMORY_KINDS },
  sources: { appointments: { label: 'Appointments', args: ['appointments'], fields: APPOINTMENT_FIELDS } },
  argDocs: { appointment_id: 'Appointment id from basil_check', limit: 'Most visits to return (the report file always has all of them)', status: 'Only visits with this status' },
  prompts: [{
    name: 'tomorrow_eligibility', title: 'Check tomorrow\'s visits',
    description: 'Walks the host model through eligibility for the next day\'s schedule with Basil.',
    arguments: [{ name: 'appointments', description: 'appointment list', required: true }, { name: 'eligibility', description: '271 files', required: true }],
    text: `You are helping a front-desk lead check eligibility with basil-of-eligibility. Appointments: {{appointments}}. 271 files: {{eligibility}}.

Rules: Basil never sends inquiries or changes the schedule. Patient names and member ids are pseudonyms: never ask for real values in chat.

1. Call basil_check. Report how many visits are ready and list the ones needing action by status.
2. For not_found, read the AAA reason and say what to check on the card.
3. Call basil_write_report so the front desk has the call list with real names.`,
  }],
  tools: [
    { name: 'basil_check', kind: 'read', title: 'Check visits against 271s',
      description: 'Sort every scheduled visit by eligibility status with the reason, the fix, plan dates, copay, coinsurance and deductible left. Cancelled and no-show visits are skipped.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['appointments', 'eligibility'], properties: { ...files, status: { type: 'string', enum: ['active', 'inactive', 'not_found', 'plan_ended', 'other_payer', 'no_response', 'retry', 'review'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out, responses } = run(a, ctx); const { rows, ...t } = out; return { summary: sumLine(out), responses, ...t, ...page(a.status ? rows.filter((r) => r.status === a.status) : rows, a.limit || 200) }; } },
    { name: 'basil_explain', kind: 'read', title: 'Explain one visit',
      description: 'Show one visit with the 271 it matched (or why none matched), its status, reasons and benefits.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['appointments', 'eligibility', 'appointment_id'], properties: { ...files, appointment_id: { type: 'string' } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const r = findItem(out.rows, 'appointment_id', a.appointment_id, ctx, { label: 'appointment' }); return { summary: `${r.appointment_id} on ${r.date}: ${r.status}.${r.reasons.length ? ` ${r.reasons.join(' ')}` : ''}${r.fix ? ` ${r.fix}` : ''}`, visit: r, aaa_reasons: AAA_REASONS }; } },
    reportTool({
      name: 'basil_write_report', title: 'Write the eligibility call list', outDir: OUT, base: 'basil-eligibility',
      description: 'Write basil-eligibility.csv (every visit with status, reason, fix and amounts, plus blank called-by and notes columns) and basil-eligibility.html into out_dir (default remedy-out/basil). The files hold real patient names for the front desk.',
      properties: files, required: ['appointments', 'eligibility'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.rows.map((r) => ({ status: r.status, appointment_id: r.appointment_id, date: r.date, patient_name: r.patient_name, payer: r.payer, member_id: r.member_id, provider: r.provider, reasons: r.reasons.join(' '), fix: r.fix || '', copay: r.copay ?? '', percent: r.coinsurance_percent ?? '', balance: r.deductible_remaining ?? '', owner: '', notes: '' }));
        return {
          title: { en: 'Eligibility call list', de: 'Anrufliste Versicherungsschutz', fr: 'Liste d’appels pour les droits', es: 'Lista de llamadas de elegibilidad', pt: 'Lista de ligações de elegibilidade', it: 'Elenco chiamate per la copertura', ja: '資格確認の連絡リスト', zh: '资格核实致电清单', ko: '자격 확인 연락 목록' },
          intro: sumLine(out), rows, summary: `Eligibility call list written: ${sumLine(out)}`,
          htmlColumns: ['status', 'appointment_id', 'date', 'payer', 'provider', 'reasons', 'fix', 'copay', 'balance'],
          labels: { balance: { en: 'Deductible left', de: 'Verbleibender Selbstbehalt', fr: 'Franchise restante', es: 'Deducible restante', pt: 'Franquia restante', it: 'Franchigia residua', ja: '残りの免責額', zh: '剩余免赔额', ko: '남은 공제액' } },
          sections: [{ title: sectionTitle('by_status'), rows: Object.entries(out.by_status).map(([k, v]) => ({ status: k, count: v })), columns: ['status', 'count'] }],
          limits: [LIMITS.files, 'Eligibility is what the payer said in the 271 on the day it answered; it can change, and it is not a promise to pay.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'basil_check', decision: 'allow' },
    { tool: 'basil_explain', decision: 'allow' },
    { tool: 'basil_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Basil allowlist.' },
  ] },
});
