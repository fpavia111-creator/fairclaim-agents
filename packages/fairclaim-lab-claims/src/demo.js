import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Lab Claims demo (fictional lab and patients) in ${rt.root}\n`);
  const f = { claims: 'lab-claims-2026-02.837', history: 'lab-history.csv', config: 'lab-config.json' };
  const r = await rt.call('labs_check', f);
  printStep('Check February lab claims', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.status.padEnd(8)} ${i.claim_id} ${i.codes.padEnd(48)} ${i.issues.map((x) => x.message).join(' ')}\n`);
  printStep('Same claims for a lab with a certificate of waiver', await rt.call('labs_check', { ...f, config: 'lab-config-waiver.json', check: 'certificate' }));
  printStep('Write the list', await rt.call('labs_write_report', f));
  printStep('Agent tries to release results', await rt.call('result_release', {}));
}
