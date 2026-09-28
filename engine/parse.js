/* 입력 엑셀 해석: 판매계획(부서·권역·용도) + 자가재생산계획(섹션) + 배선일정(권역별 선적창)
   → 목적지 단위 수요 항목(items). 원본: gadong-plan code/dest_items_v29.py
   행 번호 대신 라벨·"상세" 키로 행을 찾고, 합계행과 대사해 양식 변경을 경고한다. */
(function (root) {
  const GP = root.GP || (root.GP = {});

  // ExcelJS 셀 값 → 일반 값. 병합 셀의 종속 셀은 null(openpyxl과 동일)
  function cellValue(cell) {
    if (cell.isMerged && cell.master && cell.master.address !== cell.address) return null;
    let v = cell.value;
    if (v == null) return null;
    if (typeof v === 'object') {
      if (v instanceof Date) return v;
      if ('result' in v) v = v.result;                       // 수식 → 캐시값
      else if (v.richText) v = v.richText.map((t) => t.text).join('');
      else if ('text' in v) v = v.text;                      // 하이퍼링크
      else if ('error' in v) return { error: v.error };
      else if ('formula' in v || 'sharedFormula' in v) return null;
    }
    return v;
  }
  GP.sheetGrid = function (ws, maxCol = 60) {
    const nR = ws.rowCount, nC = Math.min(ws.columnCount || maxCol, maxCol);
    const g = [null];
    for (let r = 1; r <= nR; r++) {
      const row = ws.getRow(r), arr = [null];
      for (let c = 1; c <= nC; c++) arr.push(cellValue(row.getCell(c)));
      g.push(arr);
    }
    return g;
  };
  const str = (v) => (v == null || typeof v === 'object') ? '' : String(v).trim();
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
  const monthOf = (v) => { const m = /(\d{1,2})\s*월/.exec(str(v)); return m ? +m[1] : null; };

  GP.findSheet = function (workbooks, name) {
    for (const wb of workbooks) {
      const ws = wb.worksheets.find((w) => w.name.replace(/\s/g, '') === name);
      if (ws) return ws;
    }
    return null;
  };

  // ---------------- 배선일정 ----------------
  const WEND = { '1~5일': 5, '6~10일': 10, '11~15일': 15, '16~20일': 20, '21~25일': 25, '26~30일': 30, '1~20일': 20, '1~30일': 99 };
  GP.WEND = WEND;
  function dueOf(y, m, w) {
    if (!w) return GP.monthEnd(y, m);
    const e = WEND[w];
    if (e == null) throw new Error(`알 수 없는 선적창: ${w}`);
    const last = GP.daysInMonth(y, m);
    return e === 99 ? GP.monthEnd(y, m) : GP.ymd(y, m, Math.min(e, last));
  }

  // 시트 → [부서, 품명, 권역구분, 목적지명, 비중, 선적창] 행 배열
  function sailRowsFromGrid(g) {
    const hdr = g[1].map(str);
    const col = (name, dflt) => { const i = hdr.findIndex((h) => h === name); return i > 0 ? i : dflt; };
    const c = [col('부서', 1), col('품명', 3), col('권역구분', 5), col('목적지명', 6), col('월평균판매량(참고)', 7), col('배선일정(출항일)', 8)];
    const out = [];
    for (let r = 2; r < g.length; r++) { const row = g[r]; if (row && str(row[c[0]])) out.push(c.map((i) => row[i])); }
    return out;
  }
  function parseSail(rows, P, checks, srcLabel) {
    const SAIL = {};   // "부서|강종|권역" -> {선적창: [[항구, 비중]]}
    let n = 0;
    rows.forEach(([dept, name, regFull0, port, w, win0], i) => {
      const fam = P.sailFamily[str(name)];
      if (!fam) { checks.push({ level: 'warn', msg: `배선일정 ${i + 2}행: 품명 '${str(name)}'을 강종으로 해석할 수 없어 제외` }); return; }
      const regFull = str(regFull0), reg = regFull.includes('_') ? regFull.slice(regFull.indexOf('_') + 1) : regFull;
      const win = str(win0);
      if (!(win in WEND)) { checks.push({ level: 'warn', msg: `배선일정 ${i + 2}행: 선적창 '${win}' 해석 불가 — 제외` }); return; }
      const k = `${str(dept)}|${fam}|${reg}`;
      (SAIL[k] || (SAIL[k] = {}));
      (SAIL[k][win] || (SAIL[k][win] = [])).push([str(port), num(w)]);
      n++;
    });
    checks.push({ level: 'info', msg: `배선일정 ${srcLabel}: ${n}행 (권역 키 ${Object.keys(SAIL).length}개)` });
    return SAIL;
  }

  function sailRegions(SAIL, P, dept, fam, label) {
    const has = (reg) => {
      for (const p of P.sailPrefixes) if (SAIL[`${dept}|${fam}|${p}${reg}`]) return p + reg;
      return null;
    };
    const stripped = label.replace(/\(.*?\)/g, '').trim();
    const direct = has(stripped);
    if (direct) return [direct];
    const m = /\((.*?)\)/.exec(label);
    if (!m) return [];
    const out = [];
    for (let c of m[1].split(',')) {
      c = c.trim(); c = P.sailAlias[c] || c;
      const f = has(c); if (f && !out.includes(f)) out.push(f);
    }
    return out;
  }

  function splitBySail(SAIL, dept, fam, regs, tons) {
    const wins = {};
    for (const sr of regs) {
      const byW = SAIL[`${dept}|${fam}|${sr}`] || {};
      for (const w of Object.keys(byW)) (wins[w] || (wins[w] = [])).push(...byW[w]);
    }
    const ws = Object.keys(wins);
    if (!ws.length) return [['1~30일', '(배선일정 없음)', tons]];
    const tot = GP.sum(ws, (w) => GP.sum(wins[w], (p) => p[1]));
    return ws.map((w) => {
      const ps = wins[w], wt = GP.sum(ps, (p) => p[1]);
      const top = ps.slice().sort((a, b) => b[1] - a[1]).slice(0, 2).map((p) => p[0]);
      const lab = top.join(', ') + (ps.length > 2 ? ' 외' : '');
      return [w, lab, tot ? tons * wt / tot : tons / ws.length];
    });
  }

  // ---------------- 판매계획 ----------------
  function parseSales(g, P, H, SAIL, items, checks) {
    const SPEC = GP.SALES_SPEC;
    const secStarts = [];
    for (let r = 1; r < g.length; r++) {
      for (let c = 1; c <= 4; c++) {
        const s = str(g[r][c]);
        if (/^\d+\.\s*\S/.test(s)) {
          const sec = SPEC.sections.find((x) => s.includes(x.match));
          if (sec && !secStarts.find((x) => x.sec.id === sec.id)) secStarts.push({ sec, r });
          break;
        }
      }
    }
    for (const sec of SPEC.sections) if (!secStarts.find((x) => x.sec.id === sec.id)) checks.push({ level: 'error', msg: `판매계획: '${sec.match}' 구역 제목 행을 찾지 못함` });
    secStarts.sort((a, b) => a.r - b.r);
    const nMonths = H.ym.length;

    secStarts.forEach(({ sec, r: r0 }, si) => {
      const r1 = si + 1 < secStarts.length ? secStarts[si + 1].r - 1 : g.length - 1;
      let hr = -1, keyCol = -1;
      for (let r = r0; r <= r1 && hr < 0; r++) for (let c = 1; c < g[r].length; c++) if (str(g[r][c]) === '상세') { hr = r; keyCol = c; break; }
      if (hr < 0) { checks.push({ level: 'error', msg: `판매계획 '${sec.match}': '상세' 머리행 없음` }); return; }
      // 월 열: 머리행에서 "N월" 라벨. 같은 월이 두 번이면 첫 번째
      const mcol = {};
      for (let c = keyCol + 1; c < g[hr].length; c++) { const m = monthOf(g[hr][c]); if (m && !(m in mcol)) mcol[m] = c; }
      const cols = H.ym.map(([, m]) => mcol[m]);
      if (cols.some((c) => c == null)) { checks.push({ level: 'error', msg: `판매계획 '${sec.match}': 계획 월(${P.months.join('·')}월) 열을 찾지 못함` }); return; }

      const rows = {};
      for (let r = hr + 1; r <= r1; r++) {
        let label = '';
        for (let c = 2; c < keyCol; c++) { const s = str(g[r][c]); if (s) { label = s; break; } }
        const key = str(g[r][keyCol]);
        const errs = cols.filter((c) => g[r][c] && g[r][c].error);
        if (errs.length && label) checks.push({ level: 'warn', msg: `판매계획 ${r}행(${label}): 값이 오류(#REF! 등) — 0으로 처리` });
        rows[r] = { r, label, key: key === '0' ? '' : key, vals: cols.map((c) => num(g[r][c])), used: false };
      }
      const isStop = (x) => !x || (!x.label && !x.key) || /::(내수|수출)::/.test(x.key);

      for (const grp of SPEC.groups.filter((x) => x.sec === sec.id)) {
        const subRow = Object.values(rows).find((x) => x.key === grp.sub);
        if (!subRow) { checks.push({ level: 'error', msg: `판매계획: 합계행 '${grp.sub}' 없음 (양식 변경?)` }); continue; }
        subRow.used = true;
        const addTons = (dest, sailLabel, vals) => {
          vals.forEach((v, mi) => {
            if (!(v > 0)) return;
            const [y, m] = H.ym[mi];
            if (grp.sail) {
              const regs = sailRegions(SAIL, P, grp.sail, grp.alloy, sailLabel);
              for (const [w, port, t] of splitBySail(SAIL, grp.sail, grp.alloy, regs, v)) addItem(items, grp.cls, grp.alloy, mi, y, m, dest, port, w, t);
            } else addItem(items, grp.cls, grp.alloy, mi, y, m, dest, '', null, v);
          });
        };
        if (grp.self) { addTons(grp.self, grp.selfSail || subRow.label, subRow.vals); continue; }
        // 합계행 바로 위로 올라가며 자식 후보 수집
        const win = [];
        for (let r = subRow.r - 1; r > hr; r--) { if (isStop(rows[r])) break; win.push(rows[r]); }
        const got = new Array(nMonths).fill(0);
        for (const ch of grp.children) {
          const [lab, dest] = Array.isArray(ch) ? ch : [ch, ch];
          const row = win.find((x) => x.label === lab && !x.used);
          if (!row) continue;
          row.used = true;
          row.vals.forEach((v, i) => { got[i] += v; });
          addTons(dest, lab, row.vals);
        }
        for (const lab of grp.info || []) win.filter((x) => x.label === lab).forEach((x) => { x.used = true; });
        subRow.vals.forEach((v, i) => {
          if (Math.abs(v - got[i]) > 0.5) checks.push({ level: 'warn', msg: `판매계획 대사 불일치: ${grp.cls} ${grp.alloy} ${H.ym[i][1]}월 — 합계행 ${GP.fmt(v)}t vs 반영 행 합 ${GP.fmt(got[i])}t (새 행 추가·라벨 변경 가능성)` });
        });
      }
      for (const x of Object.values(rows)) {
        if (x.used || !x.vals.some((v) => Math.abs(v) > 0.01)) continue;
        if (sec.totals.includes(x.label)) continue;
        checks.push({ level: 'warn', msg: `판매계획 ${x.r}행 '${x.label || x.key}' (${x.vals.map((v) => GP.fmt(v)).join('/')}t)이 계획에 반영되지 않음 — 해석 규칙에 없는 행` });
      }
    });
  }

  function addItem(items, cls, alloy, mi, y, m, dest, port, window, tons) {
    if (!(tons > 0.01)) return;
    items.push({ cls, alloy, mi, month: m, year: y, dest, port, window, due: dueOf(y, m, window), tons });
  }

  // ---------------- 자가재생산계획 ----------------
  function parseSelf(g, P, H, items, checks) {
    let hr = -1, cName = -1, cSec = -1;
    for (let r = 1; r < Math.min(g.length, 15) && hr < 0; r++) {
      for (let c = 1; c < g[r].length; c++) if (str(g[r][c]) === '품명') { hr = r; cName = c; }
    }
    if (hr < 0) { checks.push({ level: 'error', msg: "자가재생산계획: '품명' 머리행 없음" }); return; }
    for (let c = 1; c < g[hr].length; c++) if (/그룹|섹션/.test(str(g[hr][c]))) { cSec = c; break; }
    if (cSec < 0) cSec = cName - 1;
    const mcol = {};
    for (let c = cName + 1; c < g[hr].length; c++) { const m = monthOf(g[hr][c]); if (m && !(m in mcol)) mcol[m] = c; }
    const cols = H.ym.map(([, m]) => mcol[m]);
    if (cols.some((c) => c == null)) { checks.push({ level: 'error', msg: `자가재생산계획: 계획 월(${P.months.join('·')}월) 열 없음` }); return; }
    let sec = '', n = 0;
    for (let r = hr + 1; r < g.length; r++) {
      const s = str(g[r][cSec]), name = str(g[r][cName]);
      if (/라인생산/.test(s)) break;                       // 하단 각주
      if (s) sec = s;
      if (!name) continue;
      const vals = cols.map((c) => num(g[r][c]));
      const alloy = /LG/.test(name) ? 'AL-LG' : /ALCOSTA/.test(name) ? 'AL' : /ALZASTA/.test(name) ? 'AZ' : /PosMAC/.test(name) ? 'MAC' : null;
      if (!alloy) { if (vals.some((v) => v > 0)) checks.push({ level: 'warn', msg: `자가재생산계획 ${r}행 품명 '${name}' 해석 불가 — 제외` }); continue; }
      const paren = (/\(.*?\)/.exec(name) || [''])[0];
      const dest = sec.replace(/\s+/g, '').replace(/섹션$/, '') + paren;
      vals.forEach((v, mi) => { const [y, m] = H.ym[mi]; addItem(items, '자가재', alloy, mi, y, m, dest, '', null, v); if (v > 0) n++; });
    }
    checks.push({ level: 'info', msg: `자가재생산계획 ${n}건 읽음` });
  }

  /* workbooks: ExcelJS Workbook 배열(순서 무관). 반환 {items, checks, asOf} */
  GP.parseInputs = function (workbooks, P) {
    const H = GP.horizon(P), checks = [], items = [];
    const wsSail = GP.findSheet(workbooks, '정리_배선일정');
    const wsSales = GP.findSheet(workbooks, '판매계획');
    const wsSelf = GP.findSheet(workbooks, '자가재생산계획');
    if (!wsSales) checks.push({ level: 'error', msg: "'판매계획' 시트가 있는 파일이 없음" });
    if (!wsSelf) checks.push({ level: 'error', msg: "'자가재생산계획' 시트가 있는 파일이 없음" });
    if (checks.some((c) => c.level === 'error')) return { items, checks };
    const SAIL = wsSail ? parseSail(sailRowsFromGrid(GP.sheetGrid(wsSail, 12)), P, checks, '올린 파일')
      : parseSail(GP.DEFAULT_SAIL_ROWS || [], P, checks, '기본값(2026-09 배선일정분석 — 선적 일정이 바뀌면 배선일정 파일도 올리세요)');
    const gS = GP.sheetGrid(wsSales, 40);
    let asOf = '';
    for (let r = 1; r <= 4 && r < gS.length; r++) for (const v of gS[r]) { const s = str(v); if (/\(\s*'?\d{2}\.\d{1,2}\.\d{1,2}/.test(s)) asOf = s; }
    parseSales(gS, P, H, SAIL, items, checks);
    parseSelf(GP.sheetGrid(wsSelf, 20), P, H, items, checks);
    for (const it of items) {
      if (!P.lines.some((l) => P.allowed[l].includes(it.alloy))) checks.push({ level: 'error', msg: `${it.cls} ${it.alloy}: 생산 가능한 라인이 없음(라인제약 파라미터 확인)` });
    }
    const tot = GP.sum(items, (i) => i.tons);
    checks.push({ level: 'info', msg: `수요 항목 ${items.length}건, 합계 ${GP.fmt(tot, 1)}t` });
    return { items, checks, asOf, sailKeys: Object.keys(SAIL).length };
  };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
