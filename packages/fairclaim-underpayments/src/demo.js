import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Underpayments demo (fictional practice, payers, contract and patients) in ${rt.root}\n`);
  const f = { remits: 'era-2026-02-10.835', contract: 'contract.json', fees: 'fees-ehp.csv', medicare_fees: 'medicare-fees.csv' };
  const c = await rt.call('underpayments_check', f);
  printStep('Price every remittance line from the contract', c);
  for (const l of c.result.items) process.stdout.write(`    ${String(l.status).padEnd(14)} ${l.claim_id} ${String(l.code).padEnd(6)} allowed ${String(l.allowed).padStart(7)} expected ${String(l.expected ?? '-').padStart(7)}  ${l.basis || l.notes.join(' ')}\n`);
  printStep('How claim C7003 was priced', await rt.call('underpayments_explain', { ...f, claim_id: 'C7003' }));
  rt.mode = 'auto'; rt.autoActions.add('underpayments_draft_reprocessing_request');
  printStep('Draft the reprocessing request for C7004', await rt.call('underpayments_draft_reprocessing_request', { ...f, claim_id: 'C7004' }));
  printStep('Write the report (Italian page)', await rt.call('underpayments_write_report', { ...f, language: 'it' }));
  const l = await rt.call('underpayments_learn', { kind: 'contract_fee', value: { payer: 'Example Health Plan', code: '99395', fee: 145, note: 'Amendment 3, page 2' } });
  printStep('Teach a fee the file is missing', l);
  printStep('Agent tries to file it in the portal itself', await rt.call('payer_portal_submit', {}));
}
