import { defineManifest, MODEL_PIN, refusedTools, memoryTools, reportTool, page, sectionTitle, LIMITS, today, toIcs } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { credentialingTasks } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/lavender';

export const ROSTER_FIELDS = Object.freeze({
  provider: { aliases: ['Provider', 'Provider Name', 'Name', 'Clinician', 'Practitioner'], required: true },
  npi: { aliases: ['NPI', 'Individual NPI', 'Type 1 NPI'], translate: false },
  taxonomy: { aliases: ['Taxonomy', 'Taxonomy Code', 'Specialty Code'], translate: false },
  license_state: { aliases: ['License State', 'State'], translate: false },
  license_expires: { aliases: ['License Expires', 'License Expiration', 'State License Expiration', 'License Exp'], type: 'date', translate: false },
  dea_expires: { aliases: ['DEA Expires', 'DEA Expiration', 'DEA Exp'], type: 'date', translate: false },
  board_expires: { aliases: ['Board Expires', 'Board Certification Expiration', 'Board Cert Exp'], type: 'date', translate: false },
  malpractice_expires: { aliases: ['Malpractice Expires', 'Malpractice Expiration', 'COI Expiration', 'Liability Insurance Expiration'], type: 'date', translate: false },
  caqh_attested: { aliases: ['CAQH Attested', 'CAQH Attestation Date', 'Last Attestation', 'CAQH Last Attested'], type: 'date', translate: false },
});
export const ENROLLMENT_FIELDS = Object.freeze({
  provider: { aliases: ['Provider', 'Provider Name', 'Name'], required: true },
  npi: { aliases: ['NPI'], translate: false },
  payer: { aliases: ['Payer', 'Plan', 'Payer Name', 'Insurance'], required: true },
  status: { aliases: ['Status', 'Enrollment Status', 'Credentialing Status'] },
  submitted_date: { aliases: ['Submitted', 'Date Submitted', 'Application Sent', 'Applied'], type: 'date', translate: false },
  effective_date: { aliases: ['Effective Date', 'Effective', 'Par Date', 'Participation Date'], type: 'date', translate: false },
  revalidation_due: { aliases: ['Revalidation Due', 'Recredentialing Due', 'Revalidation Date', 'Recred Due'], type: 'date', translate: false },
});

const DOC_KEYS = ['license_expires', 'dea_expires', 'board_expires', 'malpractice_expires'];
const CRED_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    warn_days: { type: 'integer', minimum: 1, maximum: 365, description: 'Warn this many days before an expiration (default 90)' },
    caqh_days: { type: 'integer', minimum: 30, maximum: 365, description: 'Days between CAQH attestations (default 120)' },
    caqh: { type: 'boolean', description: 'false if your providers are not in CAQH' },
    pending_followup_days: { type: 'integer', minimum: 1, maximum: 365, description: 'Follow up on an enrollment pending this long (default 30)' },
    required_docs: { type: 'array', maxItems: 4, items: { type: 'string', enum: DOC_KEYS }, description: 'Documents every provider must have a date for (default license and malpractice)' },
    payers: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1 }, lead_days: { type: 'integer', minimum: 1, maximum: 365 } } } },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_lead_days: {
    description: 'How long before revalidation one payer needs the paperwork, learned the hard way, e.g. {"payer": "Demo Medicaid Plan", "lead_days": 150, "note": "State portal takes 4 months"}.',
    effect: 'warns that many days ahead when it is longer than the config lead. It only brings warnings earlier.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'lead_days'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, lead_days: { type: 'integer', minimum: 1, maximum: 365 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('lavender', MEMORY_KINDS);

const files = {
  roster: { type: 'string', description: 'Provider roster under --root: provider, NPI, license, DEA, board and malpractice expirations, last CAQH attestation' },
  enrollments: { type: 'string', description: 'Payer enrollments under --root: provider, payer, status, submitted, effective and revalidation dates' },
  config: { type: 'string', description: 'Optional credentialing_config JSON: warning days, CAQH cycle, pending follow-up days, required documents, payer lead days' },
  as_of: { type: 'string', format: 'date', description: 'Date to count from (YYYY-MM-DD, default today)' },
};
const run = (a, ctx) => { const config = a.config ? ctx.readJson(a.config, 'credentialing_config') : {}; return { out: credentialingTasks(ctx.records(a.roster, 'roster'), a.enrollments ? ctx.records(a.enrollments, 'enrollments') : [], { config, facts: ctx.memoryFacts('payer_lead_days'), asOf: a.as_of || today() }) }; };
const sumLine = (o) => `${o.providers} provider(s), ${o.enrollments} enrollment(s): ${o.need_action} task(s) need action. ${Object.entries(o.by_status).filter(([k]) => k !== 'ok').map(([k, v]) => `${k} ${v}`).join(', ')}.`;
const refused = refusedTools([
  { name: 'enrollment_submit', category: 'binding_send', description: 'Lavender never submits applications or attests in CAQH or payer portals.' },
  { name: 'caqh_attest', category: 'binding_send', description: 'Only the provider (or their delegate) attests in CAQH.' },
]);

export const manifest = defineManifest({
  name: 'lavender-of-credentialing', version: pkg.version,
  description: 'Keeps provider credentialing and payer enrollment on track: license, DEA, board and malpractice expirations, CAQH re-attestation every 120 days, NPI check digits, enrollments pending too long, denied, not started or not yet effective, and revalidation dates, with a work list and a calendar (.ics) of every due date.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { credentialing_config: CRED_CONFIG_SCHEMA },
  memory: { prefix: 'lavender', kinds: MEMORY_KINDS },
  sources: { roster: { label: 'Provider roster', args: ['roster'], fields: ROSTER_FIELDS }, enrollments: { label: 'Payer enrollments', args: ['enrollments'], fields: ENROLLMENT_FIELDS } },
  argDocs: { limit: 'Most tasks to return (the report file always has all of them)', status: 'Only tasks with this status', provider: 'Provider name as on the roster' },
  prompts: [{
    name: 'credentialing_check', title: 'Check credentialing and enrollment',
    description: 'Walks the host model through credentialing and enrollment with Lavender.',
    arguments: [{ name: 'roster', description: 'provider roster', required: true }, { name: 'enrollments', description: 'payer enrollments', required: false }],
    text: `You are helping a credentialing coordinator with lavender-of-credentialing. Roster: {{roster}}. Enrollments: {{enrollments}}.

Rules: Lavender never submits applications or attests. Provider names are not patient data and are shown as they are.

1. Call lavender_tasks. Report expired items and denied or not-started enrollments first.
2. For not_yet_effective, say visits for that payer should wait or be billed only after the date.
3. If a payer needs more lead time than the config gives, offer lavender_learn (kind payer_lead_days).
4. Call lavender_write_report: it writes the work list and a calendar file for every due date.`,
  }],
  tools: [
    { name: 'lavender_tasks', kind: 'read', title: 'List credentialing tasks',
      description: 'Every document and enrollment with its due date, days left and status (error, expired, denied, not_started, follow_up, missing, due_soon, not_yet_effective, pending, ok).',
      inputSchema: { type: 'object', additionalProperties: false, required: ['roster'], properties: { ...files, status: { type: 'string', enum: ['error', 'expired', 'denied', 'not_started', 'follow_up', 'missing', 'due_soon', 'not_yet_effective', 'pending', 'ok'] }, provider: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { tasks, ...t } = out; let list = a.status ? tasks.filter((x) => x.status === a.status) : tasks; if (a.provider) list = list.filter((x) => x.provider.toLowerCase().includes(a.provider.toLowerCase())); return { summary: sumLine(out), ...t, ...page(list, a.limit || 200) }; } },
    reportTool({
      name: 'lavender_write_report', title: 'Write the credentialing work list and calendar', outDir: OUT, base: 'lavender-credentialing',
      description: 'Write lavender-credentialing.csv (one row per task with blank owner and done columns), lavender-credentialing.html and lavender-due-dates.ics (every future due date with reminders 30 and 7 days before) into out_dir (default remedy-out/lavender).',
      properties: files, required: ['roster'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.tasks.filter((t) => t.status !== 'ok').map((t) => ({ status: t.status, provider: t.provider, npi: t.npi || '', payer: t.payer || '', item: t.item, due: t.due || '', days_left: t.days_left ?? '', message: t.message, owner: '', done: '' }));
        const events = out.tasks.filter((t) => t.due && !(t.days_left < 0)).map((t) => ({ date: t.due, summary: `${t.item}${t.payer ? ` (${t.payer})` : ''}: ${t.provider}`, description: t.message, categories: ['Credentialing'], reminders: [30, 7] }));
        const ics = ctx.writeFile(ctx.outDir(a.out_dir || OUT), 'lavender-due-dates.ics', toIcs(events, { calName: 'Credentialing due dates' }));
        return {
          title: { en: 'Credentialing and enrollment work list', de: 'Arbeitsliste Akkreditierung und Zulassung', fr: 'Liste de travail accréditation et conventionnement', es: 'Lista de trabajo de acreditación e inscripción', pt: 'Lista de trabalho de credenciamento e cadastro', it: 'Elenco di lavoro accreditamento e iscrizione', ja: '資格認定・登録作業リスト', zh: '资质认证与注册工作清单', ko: '자격 인증 및 등록 작업 목록' },
          intro: sumLine(out), rows, summary: `Credentialing work list and calendar written: ${sumLine(out)}`,
          htmlColumns: ['status', 'provider', 'payer', 'item', 'due', 'days_left', 'message'],
          sections: [{ title: sectionTitle('by_status'), rows: Object.entries(out.by_status).map(([k, v]) => ({ status: k, count: v })), columns: ['status', 'count'] }],
          limits: [LIMITS.files, 'Dates are as entered on your roster and enrollment list; the license board, DEA, CAQH and each payer are the record.', LIMITS.advice],
          extra: { calendar: ics.replace(/\\/g, '/').split('/').slice(-3).join('/'), calendar_events: events.length },
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'lavender_tasks', decision: 'allow' },
    { tool: 'lavender_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Lavender allowlist.' },
  ] },
});
