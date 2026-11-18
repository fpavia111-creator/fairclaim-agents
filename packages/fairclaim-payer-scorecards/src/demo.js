import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'fairclaim-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Fairclaim Payer Scorecards demo (fictional payers, claims and patients) in ${rt.root}\n`);
  const f = { remits: ['era-2026-01.835', 'era-2026-02.835'], claims: 'claims-submitted.csv', config: 'payer-config.json' };
  const s = await rt.call('payers_scorecard', f);
  printStep('Score payers against targets', s);
  for (const p of s.result.payers) process.stdout.write(`    ${p.payer.padEnd(26)} denials ${String(p.denial_rate).padStart(5)}%  median ${String(p.days_to_pay_median).padStart(5)} days  paid ${p.paid_percent}% of billed\n`);
  printStep('One payer in detail', await rt.call('payers_payer', { ...f, payer: 'Demo Medicaid Plan', limit: 3 }));
  printStep('Write the scorecard (Chinese page)', await rt.call('payers_write_report', { ...f, language: 'zh' }));
  printStep('Agent tries to file a complaint with a payer', await rt.call('payer_complaint_file', {}));
}
