import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Remit Deposits demo (fictional practice, payers and bank lines) in ${rt.root}\n`);
  const f = { remits: 'era-2026-02.835', deposits: 'bank-2026-02.csv', config: 'remit-config.json' };
  const m = await rt.call('remits_match', f);
  printStep('Match five remittances to the bank', m);
  for (const r of m.result.items) process.stdout.write(`    ${r.status.padEnd(18)} ${String(r.trace_number).padEnd(14)} ${String(r.payer).padEnd(26)} ${String(r.era_amount).padStart(8)} ${r.deposit_amount ?? ''}\n`);
  printStep('Explain provider-level adjustments', await rt.call('remits_plb', { remits: f.remits }));
  rt.mode = 'auto'; rt.autoActions.add('remits_draft_inquiry');
  const d = await rt.call('remits_draft_inquiry', { ...f, item: '00184412' });
  printStep('Draft an inquiry for the paper check that never arrived', d);
  printStep('Approving it is one named click, even in Auto', await rt.call('remits_request_send', { draft: d.result.draft, draft_sha256: d.result.draft_sha256, accept_open_issues: true, note: 'demo' }));
  printStep('Write the reconciliation (Spanish page)', await rt.call('remits_write_report', { ...f, language: 'es' }));
  printStep('Agent tries to post the payment itself', await rt.call('payment_post', {}));
}
