import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Clover of Charges demo (fictional practice, providers and patients) in ${rt.root}\n`);
  const f = { appointments: 'appointments-2026-02.csv', charges: 'exports/tebra-charges-2026-02.csv', config: 'charge-config.json', as_of: '2026-02-12' };
  const r = await rt.call('clover_reconcile', f);
  printStep('Match completed visits to charges', r);
  for (const i of r.result.items.filter((x) => x.status !== 'matched')) process.stdout.write(`    ${i.status.padEnd(22)} ${(i.appointment_id || i.claim_id).padEnd(6)} ${i.message}\n`);
  printStep('Compare E/M level mix by provider', await rt.call('clover_em_mix', f));
  printStep('Write the list (Portuguese page)', await rt.call('clover_write_report', { ...f, language: 'pt' }));
  printStep('Agent tries to enter a charge itself', await rt.call('charge_post', {}));
}
