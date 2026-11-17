import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Dill of Modifiers demo (fictional practice, payers and patients) in ${rt.root}\n`);
  const f = { claims: 'batch-2026-02-06.837', config: 'modifier-config.json' };
  const r = await rt.call('dill_check', f);
  printStep('Check modifiers on an 837 batch', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.severity.padEnd(8)} ${i.check.padEnd(22)} ${i.claim_id} line ${i.line ?? '-'}  ${i.message}\n`);
  printStep('Look up XS', await rt.call('dill_modifier', { modifier: 'XS' }));
  printStep('Write the coder\'s list (Japanese page)', await rt.call('dill_write_report', { ...f, language: 'ja' }));
  printStep('Agent tries to add a modifier itself', await rt.call('modifier_append', {}));
}
