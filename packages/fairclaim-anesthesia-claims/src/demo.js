import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Anesthesia Claims demo (fictional group and patients; illustrative base units) in ${rt.root}\n`);
  const f = { cases: 'anesthesia-claims-2026-02-03.csv', base_units: 'anesthesia-base-units-illustrative.csv', config: 'anesthesia-config.json' };
  const r = await rt.call('anesthesia_check', f);
  printStep('Check one operating day', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.status.padEnd(8)} ${i.claim_id} ${i.code} ${i.modifiers.padEnd(6)} ${i.start}-${i.stop} units ${String(i.units).padStart(4)} (billed ${i.units_billed})${i.concurrency ? ` rooms ${i.concurrency}` : ''}  ${i.issues.map((x) => x.message).join(' ')}\n`);
  printStep('Write the list', await rt.call('anesthesia_write_report', f));
  printStep('Agent tries to edit the anesthesia record', await rt.call('record_edit', {}));
}
