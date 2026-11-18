import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Good Faith Estimates demo (fictional practice, patients and prices) in ${rt.root}\n`);
  const f = { schedule: 'self-pay-schedule.csv', config: 'estimate-config.json', as_of: '2026-02-17' };
  const t = await rt.call('estimates_timing', f);
  printStep('Check good faith estimate timing (business days, one office holiday)', t);
  for (const i of t.result.items) process.stdout.write(`    ${i.status.padEnd(13)} ${i.appointment_id}  ${i.message}\n`);
  printStep('Compare final bills with estimates', await rt.call('estimates_compare', { bills: 'estimates-vs-bills.csv', config: f.config }));
  rt.mode = 'auto'; rt.autoActions.add('estimates_draft_estimate');
  printStep('Draft the missing estimate', await rt.call('estimates_draft_estimate', { ...f, prices: 'self-pay-prices.csv', appointment_id: 'G2' }));
  printStep('Agent tries to send it itself', await rt.call('estimate_send', {}));
}
