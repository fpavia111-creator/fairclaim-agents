import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Lovage of Telehealth demo (fictional practice, patients and example payer rules) in ${rt.root}\n`);
  const f = { visits: 'telehealth-visits-2026-02.csv', config: 'telehealth-config.json' };
  const r = await rt.call('lovage_check', f);
  printStep('Check February telehealth lines', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.status.padEnd(8)} ${i.claim_id} ${`${i.code}${i.modifiers ? `-${i.modifiers}` : ''} POS ${i.pos}`.padEnd(18)} ${i.issues.map((x) => x.message).join(' ')}\n`);
  printStep('Which rule each payer gets', await rt.call('lovage_rules', { config: f.config }));
  printStep('Write the list', await rt.call('lovage_write_report', f));
  printStep('Agent tries to send a claim', await rt.call('claim_submit', {}));
}
