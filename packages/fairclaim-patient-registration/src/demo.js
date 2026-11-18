import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Patient Registration demo (fictional practice, payers and patients) in ${rt.root}\n`);
  const f = { patients: 'registrations-2026-02.csv', config: 'registration-config.json', as_of: '2026-02-15' };
  const r = await rt.call('registration_check', f);
  printStep('Check registrations before the visits', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.severity.padEnd(8)} ${i.check.padEnd(20)} ${i.mrn}  ${i.message}\n`);
  printStep('Explain one chart (the model only knows its pseudonym)', await rt.call('registration_explain', { ...f, mrn: r.result.items[0].mrn }));
  printStep('Write the fix list (French page)', await rt.call('registration_write_report', { ...f, language: 'fr' }));
  printStep('Agent tries to merge two charts itself', await rt.call('patient_merge', {}));
}
