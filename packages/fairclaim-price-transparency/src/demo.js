import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Price Transparency demo (fictional hospital) in ${rt.root}\n`);
  const f = { file: 'standard-charges-v3.csv', chargemaster: 'chargemaster.csv', config: 'price-config.json', as_of: '2026-03-01' };
  const r = await rt.call('prices_check_file', f);
  printStep('Check the v3.0 machine-readable file', r);
  for (const i of r.result.items) process.stdout.write(`    ${i.severity.padEnd(8)} ${String(i.row ?? '').padStart(3)}  ${i.rule.padEnd(16)} ${i.message}\n`);
  printStep('Check last year\'s v2.2 file', await rt.call('prices_check_file', { file: 'standard-charges-v2.csv', as_of: '2026-03-01' }));
  const a = await rt.call('prices_allowed_amounts', { remits: 'era-2025-2026.835', posting_date: '2026-04-01', config: f.config });
  printStep('Allowed amounts from 12 months of 835s', a);
  for (const x of a.result.items) process.stdout.write(`    ${x.payer_name.padEnd(24)} ${x.code}  count ${x.count.padEnd(13)} 10th ${x['10th_percentile']}  median ${x.median_amount}  90th ${x['90th_percentile']}\n`);
  printStep('Write the file check', await rt.call('prices_write_report', f));
  printStep('Agent tries to publish the file', await rt.call('mrf_publish', {}));
}
