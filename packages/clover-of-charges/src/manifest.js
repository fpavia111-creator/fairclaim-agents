import { defineManifest, MODEL_PIN, CLAIM_FIELDS, APPOINTMENT_FIELDS, readClaims, refusedTools, memoryTools, reportTool, findItem, page, sectionTitle, exportProfile, LIMITS, today } from 'remedy-core';
import { readFileSync } from 'node:fs';
import { reconcileCharges } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/clover';
const CODE = { type: 'string', pattern: '^[A-Za-z0-9]{1,5}\\*?$' };

const CHARGE_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    lag_days: { type: 'integer', minimum: 0, maximum: 90, description: 'Days after a visit before a missing or late charge is flagged (default 3)' },
    em_gap_points: { type: 'number', minimum: 1, maximum: 100, description: 'Percentage points between a provider\'s level 4-5 share and peers before it is shown as different (default 20)' },
    expected: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: false, required: ['visit_type', 'codes'], properties: { visit_type: { type: 'string', minLength: 1 }, codes: { type: 'array', minItems: 1, maxItems: 100, items: CODE }, note: { type: 'string', maxLength: 300 } } } },
  },
};

export const MEMORY_KINDS = Object.freeze({
  visit_type_code: {
    description: 'A visit type that should always carry one of some codes, e.g. {"visit_type": "injection", "codes": ["20610", "J*"], "note": "Injection visits bill the drug too"}.',
    effect: 'flags matching visits whose charge has none of the codes. It only adds a check; it never marks a charge as complete.',
    schema: { type: 'object', additionalProperties: false, required: ['visit_type', 'codes'], properties: { visit_type: { type: 'string', minLength: 1, maxLength: 80 }, codes: { type: 'array', minItems: 1, maxItems: 100, items: CODE }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('clover', MEMORY_KINDS);

const files = {
  appointments: { type: 'string', description: 'Appointment list under --root (CSV, Excel, JSON) with appointment id, date, patient, provider, status and visit type' },
  charges: { type: 'string', description: 'Charges under --root: an 837 file or a charge export with one row per line (claim or encounter id, service date, code, charge, submitted date)' },
  config: { type: 'string', description: 'Optional charge_config JSON: charge lag target, E/M comparison gap, and codes each visit type should carry' },
  as_of: { type: 'string', format: 'date', description: 'Date to count days from (YYYY-MM-DD, default today)' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'charge_config') : {};
  const claims = readClaims(ctx, a.charges, 'charges').claims;
  return { out: reconcileCharges(ctx.records(a.appointments, 'appointments'), claims, { config, facts: ctx.memoryFacts('visit_type_code'), asOf: a.as_of || today() }) };
};
const sumLine = (o) => `${o.visits} visit(s) and ${o.charges_checked} charge(s): ${o.need_action} need action (${Object.entries(o.by_status).filter(([k]) => !['matched', 'pending'].includes(k)).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}). Median days from visit to billing: ${o.median_entry_lag ?? 'n/a'}.${o.em_by_provider.some((p) => p.differs) ? ` E/M mix differs from peers for: ${o.em_by_provider.filter((p) => p.differs).map((p) => p.provider).join(', ')}.` : ''}`;
const refused = refusedTools([
  { name: 'charge_post', category: 'binding_send', description: 'Clover never enters or changes charges; the coder or provider does.' },
  { name: 'note_sign', category: 'binding_send', description: 'Clover never signs or closes clinical notes.' },
]);

export const manifest = defineManifest({
  name: 'clover-of-charges', version: pkg.version,
  description: 'Matches completed visits to charges: finds visits with no charge, charges with no visit or on a cancelled one, late charge entry, visit types missing their expected codes, and each provider\'s E/M level mix against peers. Patient identifiers are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { charge_config: CHARGE_CONFIG_SCHEMA },
  memory: { prefix: 'clover', kinds: MEMORY_KINDS },
  sources: {
    appointments: { label: 'Appointments', args: ['appointments'], fields: APPOINTMENT_FIELDS },
    charges: { label: 'Charges (837 or charge export)', args: ['charges'], fields: CLAIM_FIELDS, profiles: [exportProfile('tebra_charges', { claim_id: 'Encounter ID', code: 'Procedure Code', date_of_service: 'Service Date', payer: 'Primary Insurance' }), exportProfile('advancedmd_charges', { claim_id: 'Visit ID', code: 'Proc Code', date_of_service: 'Date of Service', payer: 'Primary Carrier' })] },
  },
  argDocs: { ref: 'Appointment id or claim id from clover_reconcile', limit: 'Most rows to return (the report file always has all of them)', status: 'Only rows with this status' },
  prompts: [{
    name: 'charge_capture', title: 'Find missing charges',
    description: 'Walks the host model through charge reconciliation with Clover.',
    arguments: [{ name: 'appointments', description: 'appointment list', required: true }, { name: 'charges', description: '837 or charge export', required: true }],
    text: `You are helping a billing lead close the day with clover-of-charges. Appointments: {{appointments}}. Charges: {{charges}}.

Rules: Clover never enters charges or signs notes. Patient names are pseudonyms in results.

1. Call clover_reconcile. Report visits with no charge first, then charges on cancelled visits and charges with no visit.
2. For expected_code_missing, say what code the visit type usually carries; never tell anyone to add a code without the note supporting it.
3. Call clover_em_mix only if asked about coding levels; say a difference from peers is a reason to look, not an error.
4. Call clover_write_report for the list with real names.`,
  }],
  tools: [
    { name: 'clover_reconcile', kind: 'read', title: 'Match visits to charges',
      description: 'Every completed or cancelled visit and every charge with a status (missing_charge, pending, charge_on_cancelled, charge_without_visit, expected_code_missing, late_entry, matched), the message and the fix.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['appointments', 'charges'], properties: { ...files, status: { type: 'string', enum: ['missing_charge', 'pending', 'charge_on_cancelled', 'charge_without_visit', 'expected_code_missing', 'late_entry', 'matched'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { rows, em_by_provider, ...t } = out; return { summary: sumLine(out), ...t, ...page(a.status ? rows.filter((r) => r.status === a.status) : rows, a.limit || 200) }; } },
    { name: 'clover_em_mix', kind: 'read', title: 'Compare E/M level mix by provider',
      description: 'For each provider: E/M lines by level, the share at level 4 and 5, the share for peers, and whether the gap is large enough to review a sample of notes.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['appointments', 'charges'], properties: files },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const d = out.em_by_provider.filter((p) => p.differs); return { summary: `${out.em_by_provider.length} provider(s) with E/M lines. ${d.length ? `Differs from peers: ${d.map((p) => `${p.provider} ${p.level_4_5_share}% vs ${p.peer_share}%`).join('; ')}.` : 'No provider differs from peers by the configured gap.'} A difference is a reason to review notes, not a finding.`, providers: out.em_by_provider }; } },
    { name: 'clover_explain', kind: 'read', title: 'Explain one visit or charge',
      description: 'Show one row by appointment id or claim id with its codes, charge, days since the visit and why it got its status.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['appointments', 'charges', 'ref'], properties: { ...files, ref: { type: 'string' } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); let r; try { r = findItem(out.rows.filter((x) => x.appointment_id), 'appointment_id', a.ref, ctx, { label: 'appointment' }); } catch { r = findItem(out.rows.filter((x) => x.claim_id), 'claim_id', a.ref, ctx, { label: 'appointment or claim' }); } return { summary: `${r.appointment_id || r.claim_id}: ${r.status}. ${r.message} ${r.fix}`.trim(), row: r }; } },
    reportTool({
      name: 'clover_write_report', title: 'Write the charge capture list', outDir: OUT, base: 'clover-charges',
      description: 'Write clover-charges.csv (one row per visit or charge with blank owner and decision columns) and clover-charges.html (with the E/M mix by provider) into out_dir (default remedy-out/clover).',
      properties: files, required: ['appointments', 'charges'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.rows.map((r) => ({ status: r.status, appointment_id: r.appointment_id || '', claim_id: r.claim_id || '', patient_name: r.patient_name, date_of_service: r.date, provider: r.provider, visit_type: r.visit_type || '', code: r.codes.join(' '), charge: r.charge, message: r.message, fix: r.fix, owner: '', decision: '' }));
        return {
          title: { en: 'Charge capture list', de: 'Leistungserfassung: Abgleich', fr: 'Contrôle de saisie des actes', es: 'Control de captura de cargos', pt: 'Controle de lançamento de cobranças', it: 'Controllo acquisizione prestazioni', ja: '請求入力チェックリスト', zh: '收费录入核对清单', ko: '진료비 입력 점검 목록' },
          intro: sumLine(out), rows, summary: `Charge capture list written: ${sumLine(out)}`,
          htmlColumns: ['status', 'appointment_id', 'claim_id', 'date_of_service', 'provider', 'visit_type', 'code', 'charge', 'message', 'fix'],
          sections: [{ title: sectionTitle('by_provider'), rows: out.em_by_provider.map((p) => ({ provider: p.provider, em_lines: p.em_lines, level_4_5_share: p.level_4_5_share, peer_share: p.peer_share ?? '', note: p.note })), columns: ['provider', 'em_lines', 'level_4_5_share', 'peer_share', 'note'] }],
          limits: [LIMITS.files, 'An E/M mix different from peers is a reason to review notes, not a finding of over- or under-coding.', LIMITS.codes, LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'clover_reconcile', decision: 'allow' },
    { tool: 'clover_em_mix', decision: 'allow' },
    { tool: 'clover_explain', decision: 'allow' },
    { tool: 'clover_write_report', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Clover allowlist.' },
  ] },
});
