import { defineManifest, MODEL_PIN, CLAIM_FIELDS, readClaims, refusedTools, memoryTools, reportTool, page, sectionTitle, LIMITS, today } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { checkReadiness, AREAS } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/golive';

export const ROSTER_FIELDS = Object.freeze({
  provider: { aliases: ['Provider', 'Provider Name', 'Rendering Provider', 'Name', 'Clinician'], required: true },
  npi: { aliases: ['NPI', 'Individual NPI', 'Rendering NPI', 'Provider NPI', 'Type 1 NPI'], translate: false },
  taxonomy: { aliases: ['Taxonomy', 'Taxonomy Code', 'Specialty Taxonomy'], translate: false },
  license_state: { aliases: ['License State', 'State License', 'State'], translate: false },
  license_number: { aliases: ['License Number', 'License #', 'License No'], translate: false },
});
export const ENROLL_FIELDS = Object.freeze({
  payer: { aliases: ['Payer', 'Payer Name', 'Insurance', 'Payor', 'Plan'], required: true },
  payer_id: { aliases: ['Payer ID', 'Payor ID', 'Clearinghouse Payer ID', 'EDI Payer ID', 'CPID'], translate: false },
  provider: { aliases: ['Provider', 'Provider Name', 'Rendering Provider'] },
  npi: { aliases: ['NPI', 'Provider NPI'], translate: false },
  edi: { aliases: ['EDI', 'EDI Enrollment', '837 Enrollment', 'Claims Enrollment', 'EDI Status'] },
  era: { aliases: ['ERA', 'ERA Enrollment', '835 Enrollment', 'ERA Status'] },
  eft: { aliases: ['EFT', 'EFT Enrollment', 'EFT Status', 'Direct Deposit'] },
  credentialing: { aliases: ['Credentialing', 'Credentialing Status', 'Participation', 'Par Status', 'Contract Status'] },
  submitted_date: { aliases: ['Submitted', 'Date Submitted', 'Submitted Date', 'Application Date'], type: 'date' },
  effective_date: { aliases: ['Effective', 'Effective Date', 'Approved Effective'], type: 'date' },
});
export const FEE_FIELDS = Object.freeze({
  code: { aliases: ['Code', 'CPT', 'CPT Code', 'HCPCS', 'Procedure Code', 'Proc Code'], required: true, translate: false },
  modifier: { aliases: ['Modifier', 'Mod'], translate: false },
  fee: { aliases: ['Fee', 'Charge', 'Standard Fee', 'Price', 'Amount'], type: 'money', required: true },
});

const ADDRESS = { type: 'object', additionalProperties: false, properties: { street: { type: 'string', maxLength: 120 }, city: { type: 'string', maxLength: 60 }, state: { type: 'string', pattern: '^[A-Za-z]{2}$' }, zip: { type: 'string', pattern: '^\\d{5}(-?\\d{4})?$' } } };
const SETUP_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    practice: { type: 'object', additionalProperties: false, description: 'The billing provider as it goes on the 837 (loop 2010AA)', properties: {
      name: { type: 'string', maxLength: 120 }, billing_npi: { type: 'string', maxLength: 20 }, tax_id: { type: 'string', maxLength: 20 }, taxonomy: { type: 'string', maxLength: 20 },
      address: { ...ADDRESS, description: 'Billing provider street address (no PO box)' }, pay_to_address: { ...ADDRESS, description: 'Pay-to address, if payments go elsewhere (a PO box or lockbox is fine here)' },
    } },
    go_live: { type: 'string', format: 'date', description: 'First day claims go out from the new setup' },
    lead_days: { type: 'integer', minimum: 0, maximum: 365, description: 'Days an enrollment usually takes to go live (default 30); a pending EDI enrollment submitted later than this before go-live is an error' },
    group_contracts: { type: 'array', maxItems: 200, items: { type: 'string', minLength: 1 }, description: 'Payers that contract at group level, where the group\'s credentialing row covers every provider' },
  },
};

export const MEMORY_KINDS = Object.freeze({
  payer_lead_days: {
    description: 'How long a payer\'s enrollment really took, e.g. {"payer": "Demo Medicaid Plan", "days": 75, "note": "EDI enrollment took 11 weeks last time (fictional)"}.',
    effect: 'uses that lead time for the payer instead of the default when judging pending enrollments. It never shortens the default.',
    schema: { type: 'object', additionalProperties: false, required: ['payer', 'days'], properties: { payer: { type: 'string', minLength: 1, maxLength: 120 }, days: { type: 'integer', minimum: 1, maximum: 365 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('golive', MEMORY_KINDS);

const files = {
  setup: { type: 'string', description: 'onboarding_config JSON under --root: the billing provider (name, NPI, tax ID, taxonomy, addresses), go-live date, lead days and group contracts' },
  roster: { type: 'string', description: 'Provider roster under --root: provider, NPI, taxonomy, license state' },
  enrollments: { type: 'string', description: 'Payer enrollment tracker under --root: payer, payer ID, provider (blank for the group), EDI, ERA, EFT and credentialing status, submitted and effective dates' },
  fees: { type: 'string', description: 'Optional fee schedule under --root: code, modifier, fee' },
  charges: { type: 'string', description: 'Optional recent charges or claims under --root (837 or export): the payers, providers and codes the practice will bill' },
  as_of: { type: 'string', format: 'date', description: 'Date to count days to go-live from (YYYY-MM-DD, default today)' },
};
const run = (a, ctx) => {
  const setup = ctx.readJson(a.setup, 'onboarding_config');
  const lead = setup.lead_days ?? 30;
  // Memory may only lengthen a lead time.
  const facts = ctx.memoryFacts('payer_lead_days').filter((f) => f.value.days >= lead);
  return checkReadiness({ setup, roster: ctx.records(a.roster, 'roster'), enrollments: ctx.records(a.enrollments, 'enrollments'), fees: a.fees ? ctx.records(a.fees, 'fees') : null, claims: a.charges ? readClaims(ctx, a.charges, 'charges').claims : [], facts, asOf: a.as_of || today() });
};
const sumLine = (o) => `${o.ready ? 'Ready for go-live' : 'Not ready'}${o.go_live ? ` (go-live ${o.go_live}${o.days_to_go_live !== null ? `, ${o.days_to_go_live} day(s) away` : ''})` : ''}: ${o.errors} blocker(s), ${o.warnings} to-do(s); ${o.payers_ready} of ${o.payers} payer(s) ready. ${AREAS.filter((ar) => o.by_area[ar].errors).map((ar) => `${ar} ${o.by_area[ar].errors}`).join(', ') || 'No blockers'}.`;
const refused = refusedTools([
  { name: 'enrollment_submit', category: 'binding_send', description: 'Fairclaim Practice Go Live never submits enrollment or credentialing applications; your team does, in each payer\'s portal.' },
  { name: 'go_live_switch', category: 'go_live', description: 'Fairclaim Practice Go Live never switches a practice live; a person decides go-live.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-practice-go-live', version: pkg.version,
  description: 'Go-live readiness for a new practice: checks the billing NPI, tax ID and billing address (no PO box, nine-digit ZIP), the provider roster (NPI check digits, taxonomy), each payer\'s EDI, ERA, EFT and credentialing enrollment against the go-live date, payer IDs, and the fee schedule against the charges the practice will bill. Lists blockers and to-dos by area with a payer readiness matrix. Patient identifiers in charges are masked before results reach the model.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { onboarding_config: SETUP_SCHEMA },
  memory: { prefix: 'golive', kinds: MEMORY_KINDS },
  sources: {
    roster: { label: 'Provider roster', args: ['roster'], fields: ROSTER_FIELDS },
    enrollments: { label: 'Payer enrollment tracker', args: ['enrollments'], fields: ENROLL_FIELDS },
    fees: { label: 'Fee schedule', args: ['fees'], fields: FEE_FIELDS },
    charges: { label: 'Recent charges (837 or export)', args: ['charges'], fields: CLAIM_FIELDS },
  },
  argDocs: { area: 'Only items in this area', severity: 'Only items with this severity', payer: 'One payer, by name', limit: 'Most items to return (the plan file always has all of them)' },
  prompts: [{
    name: 'go_live_readiness', title: 'Check a practice is ready to go live',
    description: 'Walks the host model through onboarding a new practice with Fairclaim Practice Go Live.',
    arguments: [{ name: 'setup', description: 'onboarding_config JSON', required: true }, { name: 'roster', description: 'provider roster', required: true }, { name: 'enrollments', description: 'enrollment tracker', required: true }],
    text: `You are helping a billing company onboard a new practice with fairclaim-practice-go-live. Setup: {{setup}}. Roster: {{roster}}. Enrollments: {{enrollments}}.

Rules: Fairclaim Practice Go Live never submits enrollments or switches a practice live. Patient names in charges are pseudonyms. NPI checks are check-digit checks: say to confirm type and owner in NPPES. Payer enrollment times vary: use the practice's lead days, never quote a payer's processing time from memory.

1. Call golive_check. Start with blockers by area: practice, then enrollment, payers, providers, fees.
2. Call golive_payers for the readiness matrix; say which payers can take claims on go-live and which providers to hold.
3. If a payer took longer than the lead time before, offer golive_learn (kind payer_lead_days).
4. Call golive_write_plan for the go-live checklist with owners.`,
  }],
  tools: [
    { name: 'golive_check', kind: 'read', title: 'Check go-live readiness',
      description: 'Blockers (error), to-dos (warning) and notes (info) by area (practice, providers, enrollment, payers, fees), with counts, days to go-live and whether the practice is ready.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['setup', 'roster', 'enrollments'], properties: { ...files, area: { type: 'string', enum: [...AREAS] }, severity: { type: 'string', enum: ['error', 'warning', 'info'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const o = run(a, ctx); const { items, matrix, ...t } = o; const list = items.filter((i) => (!a.area || i.area === a.area) && (!a.severity || i.severity === a.severity)); return { summary: sumLine(o), ...t, ...page(list, a.limit || 300) }; } },
    { name: 'golive_payers', kind: 'read', title: 'Show the payer readiness matrix',
      description: 'For each payer: payer ID, EDI, ERA and EFT status, providers credentialed of those on the roster, providers to hold, and whether the payer is ready; with one payer, its items too.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['setup', 'roster', 'enrollments'], properties: { ...files, payer: { type: 'string', maxLength: 120 } } },
      handler: async (a, ctx) => {
        const o = run(a, ctx);
        if (a.payer) { const m = o.matrix.find((x) => x.payer.toLowerCase() === a.payer.trim().toLowerCase()); if (!m) throw new Error(`payer ${a.payer} not found; pass a payer from golive_payers`); const its = o.items.filter((i) => i.payer === m.payer); return { summary: `${m.payer}: EDI ${m.edi}, ERA ${m.era}, EFT ${m.eft}, ${m.providers_credentialed} of ${m.providers_listed} provider(s) credentialed. ${m.ready ? 'Ready.' : 'Not ready.'} ${its.map((i) => i.message).join(' ')}`.trim(), payer: m, items: its }; }
        return { summary: `${o.payers_ready} of ${o.payers} payer(s) ready for go-live${o.go_live ? ` on ${o.go_live}` : ''}. ${o.matrix.filter((m) => !m.ready).map((m) => m.payer).join(', ') || ''}`.trim(), go_live: o.go_live, payers: o.matrix };
      } },
    reportTool({
      name: 'golive_write_plan', title: 'Write the go-live checklist', outDir: OUT, base: 'golive-go-live',
      description: 'Write golive-go-live.csv (one row per blocker, to-do and note, with blank owner, due and done columns) and golive-go-live.html (with the payer readiness matrix and counts by area) into out_dir (default remedy-out/golive).',
      properties: files, required: ['setup', 'roster', 'enrollments'],
      build: (a, ctx) => {
        const o = run(a, ctx);
        const rows = o.items.map((i) => ({ severity: i.severity, area: i.area, subject: i.subject, message: i.message, owner: '', due: '', done: '' }));
        return {
          title: { en: 'Go-live checklist', de: 'Checkliste für den Start', fr: 'Liste de contrôle de mise en service', es: 'Lista de verificación de puesta en marcha', pt: 'Checklist de entrada em operação', it: 'Checklist di avvio', ja: '稼働開始チェックリスト', zh: '上线检查清单', ko: '가동 개시 체크리스트' },
          intro: sumLine(o), rows, summary: `Go-live checklist written: ${sumLine(o)}`,
          htmlColumns: ['severity', 'area', 'subject', 'message', 'owner', 'due', 'done'],
          sections: [
            { title: sectionTitle('by_payer'), rows: o.matrix.map((m) => ({ payer: m.payer, payer_id: m.payer_id || '', edi: m.edi, era: m.era, eft: m.eft, credentialed: `${m.providers_credentialed}/${m.providers_listed}`, hold: m.providers_missing.join('; '), ready: m.ready ? 'yes' : 'no' })), columns: ['payer', 'payer_id', 'edi', 'era', 'eft', 'credentialed', 'hold', 'ready'] },
            { title: sectionTitle('summary'), rows: AREAS.map((ar) => ({ area: ar, ...o.by_area[ar] })), columns: ['area', 'errors', 'warnings'] },
          ],
          limits: [LIMITS.files, 'NPI checks are check-digit checks only; confirm each NPI\'s type and owner in NPPES. Enrollment status is what your tracker says; payers confirm it. Lead times are yours, not payer commitments.', LIMITS.phi, LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'golive_check', decision: 'allow' },
    { tool: 'golive_payers', decision: 'allow' },
    { tool: 'golive_write_plan', decision: 'allow' },
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Practice Go Live allowlist.' },
  ] },
});
