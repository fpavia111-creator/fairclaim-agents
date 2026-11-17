import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Yarrow of Denials demo (fictional practice, payers and patients) in ${rt.root}\n`);
  const f = { remits: 'era-2026-01.835', config: 'denial-config.json', as_of: '2026-02-01' };
  const s = await rt.call('yarrow_sort', f);
  printStep('Sort the denials in one 835 file', s);
  for (const i of s.result.items.slice(0, 8)) process.stdout.write(`    ${i.priority.padEnd(6)} ${String(i.claim_id).padEnd(8)} ${String(i.payer).padEnd(26)} ${`${i.group}-${i.reason}`.padEnd(7)} ${String(i.amount).padStart(8)}  ${i.category}  ${i.patient_name}\n`);
  printStep('Explain claim C2002', await rt.call('yarrow_explain', { ...f, claim_id: 'C2002' }));
  printStep('Trends by payer and category', await rt.call('yarrow_trends', f));
  printStep('Write the worklist (German page)', await rt.call('yarrow_write_report', { ...f, language: 'de' }));
  const l = await rt.call('yarrow_learn', { kind: 'payer_code_category', value: { payer: 'Sample Mutual Insurance', code: '989', group: 'CO', category: 'authorization' }, note: 'Payer rep said this code means no authorization on file' });
  printStep('Propose what an unknown code means for one payer', l);
  printStep('Accepting it waits for a named person', await rt.call('yarrow_accept_learning', { id: l.result.fact.id, decision: 'accept' }));
  printStep('Agent tries to resubmit a claim itself', await rt.call('claim_resubmit', {}));
  process.stdout.write(`\nPatient names above are pseudonyms; the worklist files under ${rt.root}/remedy-out keep the real names.\n`);
}
