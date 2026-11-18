import { defineManifest, MODEL_PIN, refusedTools, memoryTools, reportTool, draftPair, findItem, page, sectionTitle, exportProfile, LIMITS, today } from 'fairclaim-core';
import { readFileSync } from 'node:fs';
import { reviewFees, rvuIndex, pickLocality, priceRvu, STATUS_TEXT } from './logic.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = 'remedy-out/fees';
const CODE = { type: 'string', pattern: '^[A-Za-z0-9]{1,5}\\*?$' };

export const RVU_FIELDS = Object.freeze({
  code: { aliases: ['HCPCS', 'hcpc', 'HCPCS Code', 'CPT', 'Code'], required: true, translate: false },
  modifier: { aliases: ['MOD', 'modifier', 'Modifier'], translate: false },
  description: { aliases: ['DESCRIPTION', 'sdesc', 'Short Description', 'Description'] },
  status: { aliases: ['STATUS CODE', 'proc_stat', 'Status Code', 'Status'], translate: false },
  work_rvu: { aliases: ['WORK RVU', 'rvu_work', 'Work RVU', 'Work'], type: 'number', translate: false },
  pe_nonfac: { aliases: ['NON-FAC PE RVU', 'NON- FAC PE RVU', 'full_nfac_pe', 'Non-Facility PE RVU', 'Fully Implemented Non-Facility PE RVU'], type: 'number', translate: false },
  pe_fac: { aliases: ['FACILITY PE RVU', 'full_fac_pe', 'Facility PE RVU', 'Fully Implemented Facility PE RVU'], type: 'number', translate: false },
  mp_rvu: { aliases: ['MP RVU', 'rvu_mp', 'Malpractice RVU', 'Mp'], type: 'number', translate: false },
  conv_factor: { aliases: ['CONV FACTOR', 'conv_fact', 'Conversion Factor'], type: 'number', translate: false },
});
export const GPCI_FIELDS = Object.freeze({
  locality: { aliases: ['Locality Name', 'locality_name', 'Locality', 'locality', 'Area'], required: true },
  work_gpci: { aliases: ['PW GPCI', 'Work GPCI', 'gpci_work', 'PW GPCI (with 1.0 Floor)', '2026 PW GPCI (with 1.0 Floor)'], type: 'number', translate: false },
  pe_gpci: { aliases: ['PE GPCI', 'gpci_pe', '2026 PE GPCI'], type: 'number', translate: false },
  mp_gpci: { aliases: ['MP GPCI', 'gpci_mp', '2026 MP GPCI'], type: 'number', translate: false },
});
export const FEE_FIELDS = Object.freeze({
  code: { aliases: ['CPT', 'Code', 'Procedure Code', 'HCPCS', 'CPT/HCPCS', 'Proc Code', 'Service Code'], required: true, translate: false },
  modifier: { aliases: ['Modifier', 'Mod'], translate: false },
  description: { aliases: ['Description', 'Procedure', 'Service', 'Short Description'] },
  fee: { aliases: ['Fee', 'Charge', 'Standard Charge', 'Price', 'Gross Charge', 'Amount', 'Practice Fee'], type: 'money', required: true },
  volume: { aliases: ['Volume', 'Units Billed', 'Units Last Year', 'Annual Units', 'Count', 'Times Billed'], type: 'number' },
});

const FEE_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    conv_factor: { type: 'number', exclusiveMinimum: 0, maximum: 1000, description: 'Medicare conversion factor for the year you price (needed when the RVU file has none)' },
    locality: { type: 'string', minLength: 1, description: 'GPCI locality name (or part of it) when the GPCI file has more than one' },
    setting: { type: 'string', enum: ['nonfacility', 'facility'], description: 'Price with office (non-facility) or facility practice expense (default nonfacility)' },
    target_percent: { type: 'number', minimum: 0, maximum: 2000, description: 'Fees should be at least this percent of Medicare (for example 200)' },
    ceiling_percent: { type: 'number', minimum: 0, maximum: 5000, description: 'Show fees above this percent of Medicare (self-pay and estimate exposure)' },
    practice_name: { type: 'string', minLength: 1 },
  },
};

export const MEMORY_KINDS = Object.freeze({
  fee_target: {
    description: 'A higher target for some codes, learned from a contract that pays percent of charge or a payer schedule above your fees, e.g. {"codes": ["2*"], "percent": 250, "note": "Sample Mutual pays 80% of charge on surgery"}.',
    effect: 'raises the target percent for those codes when it is higher than the config target. It only adds checks; it never lowers a target.',
    schema: { type: 'object', additionalProperties: false, required: ['codes', 'percent'], properties: { codes: { type: 'array', minItems: 1, maxItems: 200, items: CODE }, percent: { type: 'number', minimum: 1, maximum: 2000 }, note: { type: 'string', maxLength: 300 } } },
  },
});
const MEMORY = memoryTools('fees', MEMORY_KINDS);

const files = {
  fees: { type: 'string', description: 'Your fee schedule (chargemaster) under --root: code, optional modifier, description, fee and optional yearly volume' },
  rvu: { type: 'string', description: 'Medicare RVU file under --root: the CMS PPRRVU file or the pfs.data.cms.gov indicators CSV' },
  gpci: { type: 'string', description: 'Medicare GPCI file under --root: the CMS GPCI file or the pfs.data.cms.gov localities CSV' },
  config: { type: 'string', description: 'Optional fee_config JSON: conversion factor, locality, setting, target and ceiling percent of Medicare' },
};
const run = (a, ctx) => {
  const config = a.config ? ctx.readJson(a.config, 'fee_config') : {};
  return { config, out: reviewFees(ctx.records(a.fees, 'fees'), ctx.records(a.rvu, 'rvu'), ctx.records(a.gpci, 'gpci'), { config, facts: ctx.memoryFacts('fee_target') }) };
};
const sumLine = (o) => `${o.codes} code(s) priced at ${o.locality} (CF ${o.conv_factor}, ${o.setting}): ${Object.entries(o.by_status).map(([k, v]) => `${k} ${v}`).join(', ')}. Yearly gap below Medicare ${o.below_medicare_gap}, below target ${o.below_target_gap} (where volume is given).`;
const proposed = (r) => Math.ceil(Math.max(r.medicare || 0, r.target_fee || 0));
const pair = draftPair({
  prefix: 'fees', noun: 'fee_update', verb: 'go_live', category: 'go_live', outDir: OUT, actor: 'your practice manager',
  title: 'Draft a fee schedule update',
  description: 'Write a draft fee update: every fee below Medicare or below the target, the proposed new fee (rounded up to a whole dollar) and the yearly effect where volume is given. Marked DRAFT with the checks a person must make; nothing changes in your system.',
  args: { ...files, as_of: { type: 'string', format: 'date', description: 'Date for the draft name (YYYY-MM-DD, default today)' } }, required: ['fees', 'rvu', 'gpci'],
  build: (a, ctx) => {
    const { out, config } = run(a, ctx);
    const ch = out.rows.filter((r) => ['below_medicare', 'below_target'].includes(r.status));
    if (!ch.length) throw new Error('no fee is below Medicare or the target; nothing to update');
    const rows = ch.map((r) => `| ${r.code}${r.modifier ? `-${r.modifier}` : ''} | ${r.description || ''} | ${r.fee} | ${r.medicare} | ${r.target_fee ?? ''} | ${proposed(r)} | ${r.volume ?? ''} | ${r.volume ? Math.round((proposed(r) - r.fee) * r.volume) : ''} |`).join('\n');
    const id = a.as_of || today();
    return { id, to: config.practice_name || null, text: `**For:** ${config.practice_name || '[MISSING: practice name]'}\n**Subject:** Fee schedule update, priced at ${out.locality} with conversion factor ${out.conv_factor} (${out.conv_factor_source})\n**Effective:** [TO CONFIRM: effective date]\n\n${ch.length} fee(s) are below the Medicare amount or your target of ${config.target_percent ?? 'none'}% of Medicare. Payers pay the lower of your fee and their allowed amount, so a low fee caps what every payer pays.\n\n| Code | Description | Fee now | Medicare | Target | Proposed | Volume | Yearly change |\n|---|---|---|---|---|---|---|---|\n${rows}\n\nBefore this goes live:\n\n- [CHECK: contracts that pay a percent of charges change with this update]\n- [CHECK: self-pay prices and good-faith estimates use these fees]\n- [CHECK: the conversion factor and GPCIs are for the year you bill in]\n` };
  },
});
const refused = refusedTools([
  { name: 'fee_schedule_publish', category: 'go_live', description: 'Fairclaim Fee Schedule never changes the fee schedule in your practice system; a person loads the approved update.' },
]);

export const manifest = defineManifest({
  name: 'fairclaim-fee-schedule', version: pkg.version,
  description: 'Prices each code on your fee schedule from the Medicare RVU and GPCI files (RVU x GPCI x conversion factor), finds fees below the Medicare amount (payers pay the lower of fee and allowed), below your target percent of Medicare or above a ceiling, codes with no Medicare price, and drafts a fee update for a person to approve.',
  model: MODEL_PIN,
  caps: { maxSteps: 60, maxSpendUsd: 0 },
  configSchemas: { fee_config: FEE_CONFIG_SCHEMA },
  memory: { prefix: 'fees', kinds: MEMORY_KINDS },
  sources: {
    fees: { label: 'Fee schedule', args: ['fees'], fields: FEE_FIELDS },
    rvu: { label: 'Medicare RVU file', published: 'CMS PFS', args: ['rvu'], fields: RVU_FIELDS, profiles: [exportProfile('cms_pfs_rvu', { code: 'HCPCS', modifier: 'MOD', work_rvu: 'WORK RVU', mp_rvu: 'MP RVU' }), exportProfile('cms_pfs_indicators', { code: 'hcpc', modifier: 'modifier', work_rvu: 'rvu_work', pe_nonfac: 'full_nfac_pe', mp_rvu: 'rvu_mp', conv_factor: 'conv_fact' })] },
    gpci: { label: 'Medicare GPCI file', published: 'CMS PFS', args: ['gpci'], fields: GPCI_FIELDS, profiles: [exportProfile('cms_pfs_gpci', { locality: 'Locality Name', pe_gpci: 'PE GPCI', mp_gpci: 'MP GPCI' }), exportProfile('cms_pfs_localities', { locality: 'locality_name', work_gpci: 'gpci_work', pe_gpci: 'gpci_pe', mp_gpci: 'gpci_mp' })] },
  },
  argDocs: { code: 'HCPCS or CPT code', modifier: 'Optional modifier such as 26 or TC', setting: 'nonfacility (office) or facility', locality: 'GPCI locality name or part of it', limit: 'Most codes to return (the report file always has all of them)', status: 'Only codes with this status' },
  prompts: [{
    name: 'fee_review', title: 'Review the fee schedule against Medicare',
    description: 'Walks the host model through a fee schedule review with Fairclaim Fee Schedule.',
    arguments: [{ name: 'fees', description: 'fee schedule', required: true }, { name: 'rvu', description: 'RVU file', required: true }, { name: 'gpci', description: 'GPCI file', required: true }],
    text: `You are helping a practice manager with fairclaim-fee-schedule. Fees: {{fees}}. RVU: {{rvu}}. GPCI: {{gpci}}.

Rules: Fairclaim Fee Schedule never changes fees in any system. The conversion factor must be for the year being priced: say which one was used.

1. Call fees_review. Report fees below Medicare first with the yearly gap, then below target.
2. Explain that payers pay the lower of the fee and their allowed amount.
3. Offer fees_draft_fee_update; the practice manager approves it with one click (fees_request_go_live) and loads it themselves.
4. Call fees_write_report for the full list.`,
  }],
  tools: [
    { name: 'fees_review', kind: 'read', title: 'Review fees against Medicare',
      description: 'Every code on the fee schedule with its Medicare amount, percent of Medicare, target fee, status (below_medicare, below_target, no_fee, above_ceiling, no_medicare_price, no_rvu, ok), the gap per unit and per year.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['fees', 'rvu', 'gpci'], properties: { ...files, status: { type: 'string', enum: ['below_medicare', 'below_target', 'no_fee', 'above_ceiling', 'no_medicare_price', 'no_rvu', 'ok'] }, limit: { type: 'integer', minimum: 1, maximum: 5000 } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const { rows, ...t } = out; return { summary: sumLine(out), ...t, ...page(a.status ? rows.filter((r) => r.status === a.status) : rows, a.limit || 200) }; } },
    { name: 'fees_price', kind: 'read', title: 'Price one code',
      description: 'The Medicare amount for one code in one locality and setting, with the RVUs, GPCIs, conversion factor and the arithmetic.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['rvu', 'gpci', 'code'], properties: { rvu: files.rvu, gpci: files.gpci, config: files.config, code: { type: 'string', minLength: 1 }, modifier: { type: 'string' }, setting: { type: 'string', enum: ['nonfacility', 'facility'] }, locality: { type: 'string' } } },
      handler: async (a, ctx) => {
        const config = a.config ? ctx.readJson(a.config, 'fee_config') : {};
        const idx = rvuIndex(ctx.records(a.rvu, 'rvu')); const g = pickLocality(ctx.records(a.gpci, 'gpci'), a.locality || config.locality);
        const code = String(a.code).toUpperCase(); const r = idx.get(`${code}|${String(a.modifier || '').toUpperCase()}`) || idx.get(`${code}|`);
        if (!r) throw new Error(`${code} is not in the RVU file`);
        const cf = config.conv_factor || r.conv_factor; if (!cf) throw new Error('no conversion factor: set conv_factor in the fee config');
        const setting = a.setting || config.setting || 'nonfacility'; const pe = setting === 'facility' ? r.pe_fac : r.pe_nonfac;
        const amount = ['A', 'R', 'T'].includes(r.status) ? priceRvu(r, g, cf, setting) : null;
        return { summary: amount === null ? `${code}: Medicare status ${r.status} (${STATUS_TEXT[r.status] || 'not priced'}); no amount.` : `${code} ${setting} at ${g.locality}: ${amount} = (${r.work} x ${g.work} + ${pe} x ${g.pe} + ${r.mp} x ${g.mp}) x ${cf}.`, code, status: r.status, amount, rvu: { work: r.work, pe, mp: r.mp }, gpci: g, conv_factor: cf, setting };
      } },
    { name: 'fees_explain', kind: 'read', title: 'Explain one code',
      description: 'One code from the review with why it got its status.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['fees', 'rvu', 'gpci', 'code'], properties: { ...files, code: { type: 'string' } } },
      handler: async (a, ctx) => { const { out } = run(a, ctx); const r = findItem(out.rows, 'code', String(a.code).toUpperCase(), null, { label: 'code' }); return { summary: `${r.code}: ${r.status}. ${r.message}`.trim(), row: r }; } },
    ...pair.tools,
    reportTool({
      name: 'fees_write_report', title: 'Write the fee review', outDir: OUT, base: 'fees',
      description: 'Write fees.csv (one row per code with blank owner and decision columns) and fees.html into out_dir (default remedy-out/fees).',
      properties: files, required: ['fees', 'rvu', 'gpci'],
      build: (a, ctx) => {
        const { out } = run(a, ctx);
        const rows = out.rows.map((r) => ({ status: r.status, code: r.code, modifier: r.modifier || '', description: r.description || '', fee: r.fee ?? '', medicare: r.medicare ?? '', percent_of_medicare: r.percent_of_medicare ?? '', target_fee: r.target_fee ?? '', volume: r.volume ?? '', gap_total: r.gap_total, message: r.message, owner: '', decision: '' }));
        return {
          title: { en: 'Fee schedule review', de: 'Prüfung der Gebührenordnung', fr: 'Revue de la grille tarifaire', es: 'Revisión del tarifario', pt: 'Revisão da tabela de preços', it: 'Revisione del tariffario', ja: '料金表の見直し', zh: '收费标准审查', ko: '수가표 검토' },
          intro: sumLine(out), rows, summary: `Fee review written: ${sumLine(out)}`,
          htmlColumns: ['status', 'code', 'description', 'fee', 'medicare', 'percent_of_medicare', 'target_fee', 'gap_total', 'message'],
          sections: [{ title: sectionTitle('by_status'), rows: Object.entries(out.by_status).map(([k, v]) => ({ status: k, count: v })), columns: ['status', 'count'] }],
          limits: [LIMITS.files, 'Medicare amounts come from the RVU and GPCI files and conversion factor you supply; check they are for the year you bill in. Payer contracts differ from Medicare.', LIMITS.advice],
        };
      },
    }),
    ...MEMORY.tools,
    ...refused.tools,
  ],
  policy: { rules: [
    { tool: 'fees_review', decision: 'allow' },
    { tool: 'fees_price', decision: 'allow' },
    { tool: 'fees_explain', decision: 'allow' },
    { tool: 'fees_write_report', decision: 'allow' },
    ...pair.rules,
    ...MEMORY.rules,
    ...refused.rules,
    { tool: '*', decision: 'block', reason: 'Not on the Fairclaim Fee Schedule allowlist.' },
  ] },
});
