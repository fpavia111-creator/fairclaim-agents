import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim NCCI Edits demo (fictional patients, illustrative NCCI rows) in ${rt.root}\n`);
  const f = { claims: 'batch-ncci.837', ptp: 'ncci-ptp-practitioner.csv', mue: 'ncci-mue-practitioner.csv' };
  const c = await rt.call('edits_check', f);
  printStep('Check eleven claims against PTP and MUE', c);
  for (const x of c.result.items) process.stdout.write(`    ${x.severity.padEnd(8)} ${String(x.claim_id).padEnd(13)} ${x.kind.padEnd(19)} ${x.message}\n`);
  printStep('Look up a pair whose edit was deleted', await rt.call('edits_lookup', { ptp: f.ptp, code_1: '11042', code_2: '11043', date: '2026-01-15' }));
  printStep('Write the coder work list (Portuguese page)', await rt.call('edits_write_report', { ...f, language: 'pt' }));
  const l = await rt.call('edits_learn', { kind: 'payer_pair_edit', value: { payer: 'Sample Mutual Insurance', column_1: '99396', column_2: '99213', note: 'Payer policy: preventive with problem visit' } });
  printStep('Teach a payer pair edit beyond NCCI', l);
  printStep('Agent tries to add modifier 59 itself', await rt.call('modifier_append', {}));
}
