import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Dental Claims demo (fictional dental practice and patients) in ${rt.root}\n`);
  const f = { claims: 'dental-claims-2026-02.837', history: 'dental-history.csv', config: 'dental-config.json' };
  const r = await rt.call('dental_check', f);
  printStep('Check the 837D against the patients\' history', r);
  for (const i of r.result.items.filter((x) => x.status !== 'ok')) process.stdout.write(`    ${i.status.padEnd(8)} ${i.claim_id} ${i.code}${i.tooth ? ` #${i.tooth}` : ''}${i.surfaces ? ` ${i.surfaces}` : ''}  ${i.issues.filter((x) => x.severity !== 'info').map((x) => x.message).join(' ') || i.issues.map((x) => x.message).join(' ')}\n`);
  printStep('Write the list', await rt.call('dental_write_report', f));
  printStep('Agent tries to send the claims', await rt.call('claim_submit', {}));
}
