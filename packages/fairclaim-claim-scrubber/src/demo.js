import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Claim Scrubber demo (fictional practice, payers and patients) in ${rt.root}\n`);
  const f = { claims: 'batch-2026-01-20.837', config: 'scrub-config.json', as_of: '2026-01-20' };
  const s = await rt.call('scrub_scrub', f);
  printStep('Scrub a ten-claim 837 batch', s);
  for (const c of s.result.items) process.stdout.write(`    ${c.ready ? 'ready' : 'fix  '} ${String(c.claim_id).padEnd(7)} ${String(c.payer).padEnd(26)} ${c.findings.map((x) => x.check).join(', ') || '-'}\n`);
  printStep('Explain claim C4005', await rt.call('scrub_explain', { ...f, claim_id: 'C4005' }));
  printStep('Write the work list (French page)', await rt.call('scrub_write_report', { ...f, language: 'fr' }));
  const l = await rt.call('scrub_learn', { kind: 'payer_required_field', value: { payer: 'Demo Medicaid Plan', field: 'referring_npi', codes: ['97*'], note: 'Rejected on the 277CA without it' } });
  printStep('Teach a payer rule from a rejection', l);
  printStep('Accepting it waits for a named person', await rt.call('scrub_accept_learning', { id: l.result.fact.id, decision: 'accept' }));
  printStep('Agent tries to send the batch itself', await rt.call('claim_submit', {}));
}
