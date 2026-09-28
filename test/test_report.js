// 보고서(엑셀) 생성 시험. GP_RESULT(엔진 결과 json) 또는 GP_REF(Python v30 결과)로 R을 만든다
const fs = require('fs');
const { GP, loadInputs, ExcelJS } = require('./load');
require('../engine/report.js');
(async () => {
  const P = GP.clone(GP.DEFAULT_PARAMS);
  const parsed = GP.parseInputs(await loadInputs(), P);
  let R;
  if (process.env.GP_RESULT) R = JSON.parse(fs.readFileSync(process.env.GP_RESULT));
  else {
    const REF = process.env.GP_REF, { buckets, sept } = GP.buildBuckets(parsed.items, P);
    R = { P, items: parsed.items, buckets, sept, milp: { optimal1: true, optimal2: true, sec: [0, 0] },
      rows: require(REF + '/daily_final.json'), cal: require(REF + '/calendar_final.json'), dest: require(REF + '/daily_final_dest.json') };
  }
  const A = GP.analyze(R);
  console.log('load', Object.entries(A.load).map(([k, v]) => k + ' ' + (v * 100).toFixed(1)).join(', '));
  console.log('mc', A.mc, 'early', A.earlyT.toFixed(1), 'late', A.lateT, 'short', A.short.toFixed(1), 'idle', A.idle.length);
  for (const l of GP.summaryLines(R, A)) console.log(l);
  for (const e of A.events) console.log('EV', e.date, e.line, e.kind, e.from, e.to, '|', GP.eventReason(R, A, e));
  for (const x of GP.earlyReasons(R, A)) console.log('EARLY', x.line, x.alloy, x.cls, x.prodMonth, x.due, x.tons.toFixed(1), '|', x.why);
  const { wb } = GP.buildWorkbook(ExcelJS, R, { checks: parsed.checks, asOf: parsed.asOf });
  const out = (process.env.GP_OUT || '.') + '/web_report.xlsx';
  await wb.xlsx.writeFile(out);
  console.log('saved', out, wb.worksheets.map((w) => w.name).join(','));
})().catch((e) => { console.error(e); process.exit(1); });
