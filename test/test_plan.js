// 전체 계획을 Node에서 실행하고 v30(Python) 결과와 대조. 결과는 GP_OUT/result.json
const fs = require('fs');
const { GP, loadInputs } = require('./load');
const REF = process.env.GP_REF, OUT = process.env.GP_OUT || '.';
(async () => {
  const highs = await require('highs')();
  const P = GP.clone(GP.DEFAULT_PARAMS);
  const { items } = GP.parseInputs(await loadInputs(), P);
  const t0 = Date.now();
  const R = GP.runPlan(highs, items, P, (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`));
  fs.writeFileSync(OUT + '/result.json', JSON.stringify(R));
  const sw = R.cal.filter((c) => c.event && !c.event.includes('정기수리')).map((c) => [c.date, c.line, c.event]);
  console.log('events', JSON.stringify(sw));
  const early = GP.sum(R.rows.filter((r) => r[0].slice(5, 7) < r[5].slice(5, 7)), (r) => r[4]);
  const late = GP.sum(R.rows.filter((r) => r[0] > r[5]), (r) => r[4]);
  console.log('total', GP.round(GP.sum(R.rows, (r) => r[4]), 1), 'late', late, 'early', GP.round(early, 1), 'destBad', R.destBad);
  if (REF) {
    const ref = require(REF + '/daily_final.json'), rc = require(REF + '/calendar_final.json');
    const evPy = rc.filter((c) => c.event && !c.event.includes('정기수리')).map((c) => [c.date, c.line, c.event]);
    console.log('events same as v30:', JSON.stringify(evPy) === JSON.stringify(sw));
    const m = (rows) => { const o = {}; for (const r of rows) { const k = r.slice(0, 4).concat([r[5]]).join('|'); o[k] = (o[k] || 0) + r[4]; } return o; };
    const a = m(R.rows), b = m(ref); let d = 0, mx = 0;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const e = Math.abs((a[k] || 0) - (b[k] || 0)); if (e > 0.06) { d++; mx = Math.max(mx, e); } }
    console.log('daily rows js', R.rows.length, 'py', ref.length, 'cells differing >0.06t', d, 'max diff', GP.round(mx, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
