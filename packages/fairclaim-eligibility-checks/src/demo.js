import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Eligibility Checks demo (fictional practice, payers and patients) in ${rt.root}\n`);
  const f = { appointments: 'appointments-2026-02-03.csv', eligibility: ['eligibility-2026-02-01.271'] };
  const c = await rt.call('eligibility_check', f);
  printStep('Check tomorrow\'s visits against the 271 responses', c);
  for (const r of c.result.items) process.stdout.write(`    ${r.status.padEnd(12)} ${r.appointment_id} ${String(r.payer).padEnd(26)} copay ${String(r.copay ?? '-').padStart(3)}  ${r.reasons.join(' ')}\n`);
  printStep('Explain visit A1003', await rt.call('eligibility_explain', { ...f, appointment_id: 'A1003' }));
  printStep('Write the front-desk call list (Japanese page)', await rt.call('eligibility_write_report', { ...f, language: 'ja' }));
  const l = await rt.call('eligibility_learn', { kind: 'visit_type_review', value: { payer: 'Example Health Plan', visit_type: 'specialist', note: 'HMO plans need a referral on file' } });
  printStep('Teach a visit type to double-check', l);
  printStep('Agent tries to send an inquiry itself', await rt.call('eligibility_inquiry_send', {}));
}
