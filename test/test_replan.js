// 롤링 재계획 시뮬레이션: 기준 계획(GP_BASE 결과 json) + 가짜 실적 교란 → 재계획
const fs = require('fs');
const { GP } = require('./load');
require('../engine/report.js');
(async () => {
  const highs = await require('highs')();
  const o = JSON.parse(fs.readFileSync(process.env.GP_BASE));
  const R = o.result || o;
  const t0 = process.env.T0 || '2026-10-20';
  const act = GP.simulateActuals(R, t0, [
    { type: 'down', line: '2CGL', from: '2026-10-14', to: '2026-10-15' },
    { type: 'reject', line: '1CGL', date: '2026-10-18', tons: 300 },
    { type: 'down', line: '2CGL', from: '2026-10-22', to: '2026-10-22', minutes: 720 },
  ]);
  console.log('notes', act.notes, 'state', act.state, 'actual', GP.round(GP.sum(act.rows, (r) => r[4])), 'plan-to-date', GP.round(GP.sum(R.rows.filter((r) => r[0] <= t0), (r) => r[4])));
  const t = Date.now();
  const R2 = GP.replan(highs, R, act, process.env.LATEW ? { lateW: +process.env.LATEW } : {}, (m) => console.log(`[${((Date.now() - t) / 1000).toFixed(0)}s] ${m}`));
  fs.writeFileSync((process.env.GP_OUT || '.') + '/replan_result' + (process.env.LATEW || '') + '.json', JSON.stringify({ app: 'cgl-plan', version: 1, savedAt: new Date().toISOString(), result: R2, meta: o.meta || {} }));
  const A = GP.analyze(R2);
  console.log('removed', R2.replan.removed, '\nadded', R2.replan.added, '\nshort', R2.replan.shortBy, 'over', R2.replan.over);
  console.log('late rows', A.late.map((r) => r.join(' ')));
  console.log('kpi mc', A.mc, 'late t', GP.round(A.lateT), 'short', GP.round(A.short), 'early', GP.round(A.earlyT));
  console.log('load', Object.entries(A.load).map(([k, v]) => k + ' ' + (v * 100).toFixed(1)).join(', '));
})().catch((e) => { console.error(e); process.exit(1); });
