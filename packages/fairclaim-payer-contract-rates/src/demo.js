import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Payer Contract Rates demo (made-up payers, rates and contracts) in ${rt.root}\n`);
  const f = { payer_fees: 'payer-fees-2026.csv', medicare: 'medicare-2026-illustrative.csv', volumes: 'volumes-2025.csv', config: 'contract-config.json' };
  printStep('Rank payers against Medicare at your volume', await rt.call('contracts_rates', f));
  const c = await rt.call('contracts_calendar', { contracts: 'contracts.csv', as_of: '2026-02-15' });
  printStep('Contract renewal calendar', c);
  for (const x of c.result.contracts) process.stdout.write(`    ${x.status.padEnd(22)} ${x.payer.padEnd(26)} ${x.next_step}\n`);
  rt.mode = 'auto'; rt.autoActions.add('contracts_draft_rate_request');
  const d = await rt.call('contracts_draft_rate_request', { ...f, payer: 'Sample Mutual Insurance' });
  printStep('Draft a rate request (markers left for a person)', d);
  printStep('Write the comparison with the calendar (Korean page)', await rt.call('contracts_write_report', { ...f, contracts: 'contracts.csv', as_of: '2026-02-15', language: 'ko' }));
  printStep('Agent tries to sign a contract', await rt.call('contract_sign', {}));
}
