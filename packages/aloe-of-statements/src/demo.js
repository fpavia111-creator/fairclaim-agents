import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Aloe of Statements demo (fictional practice and guarantors) in ${rt.root}\n`);
  const f = { accounts: 'patient-balances-2026-02-20.csv', config: 'statement-config.json', as_of: '2026-02-20' };
  const c = await rt.call('aloe_cycle', f);
  printStep('Plan the statement run', c);
  for (const i of c.result.items) process.stdout.write(`    ${(i.action === 'hold' ? `hold:${i.hold}` : i.action).padEnd(22)} ${String(i.balance).padStart(7)}  ${i.message}\n`);
  rt.mode = 'auto'; rt.autoActions.add('aloe_draft_statement');
  printStep('Draft the final notice', await rt.call('aloe_draft_statement', { ...f, account: c.result.items[0].account }));
  printStep('Agent tries to send an account to collections', await rt.call('collections_assign', {}));
}
