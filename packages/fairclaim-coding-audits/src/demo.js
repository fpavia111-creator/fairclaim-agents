import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Coding Audits demo (fictional practice and patients) in ${rt.root}\n`);
  const s = { charges: 'charges-2026-q1.csv', config: 'audit-config.json', seed: 'q1-2026' };
  printStep('Draw the Q1 sample (same seed, same lines)', await rt.call('audits_sample', s));
  printStep('Write the auditor worksheet', await rt.call('audits_write_sample', s));
  const r = await rt.call('audits_score', { results: 'audit-results-2026-q1.csv', config: 'audit-config.json' });
  printStep('Score the filled-in worksheet', r);
  for (const p of r.result.providers) process.stdout.write(`    ${String(p.accuracy).padStart(6)}%  ${p.provider.padEnd(28)} ${p.message}\n`);
  printStep('Write the results', await rt.call('audits_write_report', { results: 'audit-results-2026-q1.csv', config: 'audit-config.json' }));
  printStep('Agent tries to send a refund', await rt.call('refund_send', {}));
}
