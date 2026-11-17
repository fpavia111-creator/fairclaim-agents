import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Tansy of Credits demo (fictional practice, payers and patients) in ${rt.root}\n`);
  const f = { credits: 'credit-balances-2026-02-15.csv', config: 'credit-config.json', as_of: '2026-02-15' };
  const r = await rt.call('tansy_review', f);
  printStep('Review credit balances and refund deadlines', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.action.padEnd(16)} ${String(i.amount).padStart(7)} to ${String(i.refund_to).padEnd(26)} ${i.message}\n`);
  rt.mode = 'auto'; rt.autoActions.add('tansy_draft_refund');
  const d = await rt.call('tansy_draft_refund', { ...f, account: r.result.items[0].account });
  printStep('Draft the overdue Medicare refund', d);
  printStep('Approving a refund needs a named person, even in Auto', await rt.call('tansy_request_refund', { draft: d.result.draft, draft_sha256: d.result.draft_sha256 }));
  printStep('Agent tries to issue the refund itself', await rt.call('refund_issue', {}));
}
