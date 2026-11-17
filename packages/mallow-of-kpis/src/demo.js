import { fileURLToPath } from 'node:url';
import { demoRuntime, printStep } from 'remedy-core';

export async function demo(manifest) {
  const rt = demoRuntime(manifest, fileURLToPath(new URL('../fixtures', import.meta.url)));
  process.stdout.write(`Mallow of KPIs demo (fictional practice, patients and example targets) in ${rt.root}\n`);
  const f = { claims: 'claims-2025-11-to-2026-01.csv', remits: 'remits-2025-11-to-2026-02.835', config: 'kpi-config.json' };
  const r = await rt.call('mallow_kpis', f);
  printStep('Measure the KPIs as of 2026-02-15', r);
  for (const [k, x] of Object.entries(r.result.kpis)) process.stdout.write(`    ${k.padEnd(22)} ${String(x.value ?? 'n/a').padStart(6)} ${x.unit.padEnd(5)} target ${String(x.target ?? '-').padStart(4)}  ${x.met === null ? '' : x.met ? 'met' : 'missed'}\n`);
  for (const a of r.result.alerts) process.stdout.write(`    ! ${a.message}\n`);
  const b = await rt.call('mallow_breakdown', f);
  printStep('By payer', b);
  for (const p of b.result.items) process.stdout.write(`    ${p.group.padEnd(26)} denial ${String(p.denial_rate).padStart(6)}%  median days to pay ${p.median_days_to_pay}  open ${p.open_claims}\n`);
  printStep('Write the report', await rt.call('mallow_write_report', f));
  printStep('Agent tries to write off a balance', await rt.call('balance_write_off', {}));
}
