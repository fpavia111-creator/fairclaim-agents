import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Chamomile of A/R demo (fictional practice, payers and patients) in ${rt.root}\n`);
  const f = { ar: 'open-ar-2026-02-15.csv', config: 'ar-config.json', as_of: '2026-02-15' };
  const a = await rt.call('chamomile_age', f);
  printStep('Age open A/R and rank the follow-up queue', a);
  for (const i of a.result.items) process.stdout.write(`    ${i.flag.padEnd(18)} ${i.claim_id}  ${String(i.balance).padStart(7)}  ${i.payer}  ${i.next_step}\n`);
  printStep('Explain a claim submitted after the limit', await rt.call('chamomile_explain', { ...f, claim_id: 'A1004' }));
  printStep('Write the call queue (Spanish page)', await rt.call('chamomile_write_report', { ...f, language: 'es' }));
  printStep('Agent tries to write off a balance itself', await rt.call('write_off_post', {}));
}
