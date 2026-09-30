/* 계산 전용 Web Worker: 엑셀 해석 + MILP/LP 계산. 데이터는 이 브라우저 밖으로 나가지 않는다. */
importScripts('vendor/exceljs.min.js', 'vendor/highs.js',
  'engine/params.js', 'engine/util.js', 'engine/sail_default.js', 'engine/parse.js', 'engine/model.js', 'engine/replan.js', 'engine/actual.js', 'engine/mes.js');
const GP = self.GP;
let highsP = null, lastLog = 0;
const post = (type, data) => self.postMessage(Object.assign({ type }, data));

function getHighs() {
  if (!highsP) {
    highsP = Module({
      locateFile: (f) => 'vendor/' + f,
      // HiGHS 진행 로그(분기한정 표) → 화면 진행표시. 너무 잦지 않게 1초 간격
      print: (t) => {
        const now = Date.now();
        if (/^\s*[A-Z]?\s+\d+\s+\d+\s+\d+\s+[\d.]+%/.test(t) && now - lastLog > 1000) {
          lastLog = now;
          const tk = t.trim().split(/\s+/);
          if (/^[A-Z]$/.test(tk[0])) tk.shift();
          post('solver', { bound: tk[4], best: tk[5], gap: tk[6], time: tk[tk.length - 1] });
        }
      },
      printErr: () => {},
    });
  }
  return highsP;
}

let wbs = [];
self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'parse') {
      wbs = [];
      const sheets = [];
      for (const f of msg.files) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(f.buf);
        wbs.push(wb);
        sheets.push({ name: f.name, sheets: wb.worksheets.map((w) => w.name) });
      }
      const res = GP.parseInputs(wbs, msg.params);
      let summary = null;
      if (!res.checks.some((c) => c.level === 'error')) {
        const { buckets, sept } = GP.buildBuckets(res.items, msg.params);
        summary = { nBuckets: buckets.length, demand: GP.sum(buckets, (b) => b.orig), sept: GP.sum(sept, (s) => s.tons) };
      }
      post('parsed', { items: res.items, checks: res.checks, asOf: res.asOf, sheets, summary });
      getHighs();                       // 솔버 미리 로드
    } else if (msg.type === 'replan') {
      const highs = await getHighs();
      GP.solverExtra = { output_flag: true, log_to_console: true };
      const t0 = Date.now(), log = (m) => post('log', { msg: m, sec: (Date.now() - t0) / 1000 });
      let act;
      if (msg.xlsx) {
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(msg.xlsx);
        const tables = GP.mesTables(GP.mesSheetsFromWorkbooks([wb]));
        if (GP.isMesQuery(tables)) {             // MES 실적 쿼리 엑셀(코일 단위) → 일별 실적으로 집계
          const cl = GP.mesClean(tables);
          act = cl.checks.some((c) => c.level === 'error') ? { checks: cl.checks } : GP.mesToActual(GP.mesAnalyze(cl.coils, msg.base.P), cl.coils, msg.base, msg.t0);
          act.checks = cl.checks.concat(act.checks || []);
        } else act = GP.parseActualWorkbook(wb, msg.base, msg.t0);
        for (const c of act.checks || []) if (c.level !== 'info') log(`${c.level === 'error' ? '오류' : '경고'}: ${c.msg}`);
        if ((act.checks || []).some((c) => c.level === 'error')) throw new Error(act.checks.filter((c) => c.level === 'error').map((c) => c.msg).join(' / '));
      } else act = GP.simulateActuals(msg.base, msg.t0, msg.events || []);
      const R = GP.replan(highs, msg.base, act, { freezeDays: msg.freeze, lateW: msg.lateW, stabW: msg.stabW, stabW2: msg.stabW * 5000 }, log);
      post('done', { result: R, sec: (Date.now() - t0) / 1000 });
    } else if (msg.type === 'run') {
      const highs = await getHighs();
      GP.solverExtra = { output_flag: true, log_to_console: true };
      const t0 = Date.now();
      const R = GP.runPlan(highs, msg.items, msg.params, (m) => post('log', { msg: m, sec: (Date.now() - t0) / 1000 }));
      post('done', { result: R, sec: (Date.now() - t0) / 1000 });
    }
  } catch (e) {
    post('error', { msg: String(e && e.message || e), stack: String(e && e.stack || '') });
  }
};
