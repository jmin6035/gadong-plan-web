// MES 쿼리 해석·분석 — 샘플(GP_MES 폴더의 생산실적·작업휴지·재고 엑셀)
const fs = require('fs'), path = require('path');
const { GP, ExcelJS } = require('./load');
require('../engine/report.js'); require('../engine/mes.js');
(async () => {
  const dir = process.env.GP_MES;
  const wbs = [];
  for (const f of fs.readdirSync(dir).filter((f) => /\.xlsx$/.test(f))) { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(dir, f)); wbs.push(wb); }
  const t = Date.now();
  const { clean, an } = GP.mesFromWorkbooks(wbs, GP.clone(GP.DEFAULT_PARAMS));
  console.log('ms', Date.now() - t, 'coils', clean.coils.length);
  for (const c of clean.checks) console.log(' ', c.level, c.msg);
  console.log('period', an.period);
  for (const [l, x] of Object.entries(an.lines)) console.log(l, JSON.stringify(x, (k, v) => (typeof v === 'number' ? GP.round(v, 2) : v)));
  for (const e of an.events) console.log('event', JSON.stringify(e));
  for (const s of an.speed) console.log('speed', s.key, s.n, GP.round(s.t), 'act', GP.round(s.act * 60, 1), 'cur', s.cur && GP.round(s.cur * 60, 1), 'diff%', s.diff != null && GP.round(s.diff * 100, 1), 'thick', GP.round(s.thick, 2));
  for (const c of an.cands) console.log('cand', c.label, c.cur, GP.round(c.act, 4), c.ok, c.flag, c.apply);
  console.log('daily', an.daily.length, GP.round(GP.sum(an.daily, (r) => r[4])));
  // 기대값(Python cglplan/mes.py 와 동일해야 함 — tests/test_engine.py 4번)
  const L = an.lines['1CGL'], ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FAIL ') + n + (d ? `  [${d}]` : '')); if (!c) process.exitCode = 1; };
  ok('코일 1,084 · 더미 27', clean.coils.length === 1084 && L.dummyN === 27);
  ok('M/C 1건 AL→AZ 554분', an.events.length === 1 && an.events[0].minutes === 554 && an.events[0].from === 'AL');
  ok('배경손실 더미 29.5·기타 19.7분/일', GP.round(L.bgDummyPerDay, 1) === 29.5 && GP.round(L.bgStopPerDay, 1) === 19.7, `${L.bgDummyPerDay} ${L.bgStopPerDay}`);
  ok('1CGL AL 도금수출 27.0 t/hr(현재 32.3)', GP.round(an.speed.find((s) => s.key === '1CGL|AL|도금수출').act * 60, 1) === 27.0);
  ok('기간 15일 < 28일 → 반영 권장 없음', an.cands.every((c) => !c.apply));
  ok('일별 실적 합 9,813t', Math.abs(GP.sum(an.daily, (r) => r[4]) - 9812.58) < 0.01);
  if (process.env.GP_OUT) fs.writeFileSync(process.env.GP_OUT, JSON.stringify(GP.mesSummary(an, clean)));
})().catch((e) => { console.error(e); process.exit(1); });
// 웹 mesExport = Python mes.export (주별 추이 포함) 비교용 저장
if (process.env.GP_EXPORT) (async () => {
  const fs = require('fs'), path = require('path'); const { GP, ExcelJS } = require('./load');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(process.env.GP_MES, 'prod_SOPSE1010.xlsx'));
  const { clean, an } = GP.mesFromWorkbooks([wb], GP.clone(GP.DEFAULT_PARAMS));
  fs.writeFileSync(process.env.GP_EXPORT, JSON.stringify(GP.mesExport(an, clean, clean.coils)));
})();
