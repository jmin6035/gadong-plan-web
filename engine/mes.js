/* MES 실적 쿼리 해석·분석 — 코일 단위 생산실적으로 속도·손실·M/C를 재산출해 현재 파라미터와 비교하고,
   재계획 입력(일별 라인×강종×부서 톤)을 만든다. 서버용 Python(cglplan/mes.py)과 같은 규칙.
   입력: 쿼리 엑셀 1개(한 시트, 열 이름 기준) 또는 MES 화면별 엑셀 여러 개(생산실적 + 작업휴지[라인번호] + 재고[제품등급]).
   시간 정의(샘플 1,084코일로 확인): 작업시간 = 가동시간 + 휴지시간, 코일 작업구간이 벽시계 시간을 거의 빈틈없이 덮음.
   → 라인 시간 = 제품코일 가동 + M/C(전환) + 배경손실(더미코일·기타 휴지·빈 시간) 으로 겹침 없이 나눈다. */
(function (root) {
  const GP = root.GP || (root.GP = {});

  GP.MES_RULES = {
    // 제품명 앞글자 → 강종군. 2CGL(MAC 등) 제품명은 샘플에 없어 확인 필요 — 미확인 제품명은 경고로 알려줌
    family: [['^GGL', 'AZ'], ['^GA[LT]', 'AL'], ['MAC|^GM', 'MAC']],
    dept: { '도금수출그룹': '도금수출', '도금판매그룹': '도금국내', '컬러수출그룹': '자가재', '컬러건재판매그룹': '자가재', '컬러판매그룹': '자가재' },
    autoDept: '자동차강판판매그룹',          // 최종고객사명에 한글 있으면 자동차내수, 없으면 자동차수출
    dummyDept: '공정출하그룹',               // 더미: 계약번호에 D 또는 이 부서
    // 라인번호가 없을 때(생산실적 조회 화면 엑셀) 제품번호 앞 2자리로 라인 추정. AA=1CGL은 샘플로 확인, BA=2CGL은 재고·출하 샘플 기준 추정(확인 필요)
    linePrefix: { AA: '1CGL', BA: '2CGL' },
    speedRunMax: 300,                       // 속도 산출 코일: 0 < 가동시간 < 300분 (기존 속도 산출 정의와 동일)
    longStop: 1440,                         // 한 번에 1일 이상 멈춤 = 정기수리·장기정지(배경손실에서 제외, 별도 표시)
    minDays: 28,                            // 파라미터 반영 권장 최소 기간(일)
    minCoils: 30, minTons: 300,             // 속도 반영 권장 최소 표본
    minEvents: 3,                           // M/C 손실 반영 권장 최소 건수
    tol: 0.05,                              // 현재값과 5% 이상 차이면 검토 표시
  };
  const REQ = ['제품번호', '계약번호', '작업시작시각', '작업종료시각', '가동시간', '휴지시간', '제품중량', '제품명', '부서명'];

  const str = (v) => {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 16).replace('T', ' ');
    if (typeof v === 'object' && 'result' in v) return str(v.result);
    if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('');
    return String(v).trim();
  };
  const num = (v) => { const s = str(v).replace(/,/g, ''); return s === '' ? NaN : +s; };
  // 날짜시각 → 분(1970-01-01 00:00 기준, 시간대 없음). 'YYYY-MM-DD HH:MM[:SS]', 'YYYY.MM.DD', Date, 엑셀 일련번호
  const toMin = (v) => {
    if (v instanceof Date) return Math.round(v.getTime() / 60000);
    if (typeof v === 'number') return Math.round((v - 25569) * 1440);
    const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(str(v));
    if (!m) return NaN;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) / 60000);
  };
  const minToStr = (t) => new Date(t * 60000).toISOString().slice(0, 16).replace('T', ' ');
  const dayOf = (v) => { const t = toMin(v); return isNaN(t) ? '' : minToStr(t).slice(0, 10); };
  const median = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const normLine = (s) => { const m = /([12])\s*CGL/i.exec(s || ''); return m ? `${m[1]}CGL` : ''; };

  /* 시트들 → [{header→value}] 표 목록. 머리글 행 = 앞 5행 중 칸이 가장 많이 찬 행 */
  GP.mesTables = function (sheets) {
    const out = [];
    for (const rows of sheets) {
      let hi = -1, best = 0;
      for (let i = 0; i < Math.min(5, rows.length); i++) { const n = rows[i].filter((x) => str(x) !== '').length; if (n > best) { best = n; hi = i; } }
      if (hi < 0 || best < 3) continue;
      const H = rows[hi].map((x) => str(x).replace(/\s/g, ''));
      const recs = [];
      for (let i = hi + 1; i < rows.length; i++) { const o = {}; let any = false; H.forEach((h, j) => { if (h) { o[h] = rows[i][j]; if (str(rows[i][j]) !== '') any = true; } }); if (any) recs.push(o); }
      out.push({ header: H, rows: recs });
    }
    return out;
  };
  // ExcelJS 통합문서들 → 시트별 2차원 배열
  GP.mesSheetsFromWorkbooks = function (wbs) {
    const sheets = [];
    for (const wb of wbs) for (const ws of wb.worksheets) {
      const rows = [];
      ws.eachRow({ includeEmpty: true }, (row) => { const v = []; for (let c = 1; c <= ws.columnCount; c++) v.push(row.getCell(c).value); rows.push(v); });
      sheets.push(rows);
    }
    return sheets;
  };
  GP.isMesQuery = (tables) => tables.some((t) => REQ.every((h) => t.header.includes(h)));

  /* 정제: 반환 {coils, checks, info}. coil = {id, line, day, s, e, work, stop, run, t, thick, width, pname, dept, fam, cls, dummy, grade} */
  GP.mesClean = function (tables, rules = GP.MES_RULES) {
    const checks = [], R = rules;
    const coilT = tables.filter((t) => REQ.every((h) => t.header.includes(h)));
    if (!coilT.length) {
      const miss = tables.length ? REQ.filter((h) => !tables.some((t) => t.header.includes(h))) : REQ;
      return { coils: [], checks: [{ level: 'error', msg: `생산실적 열이 없음: ${miss.join(', ')}` }] };
    }
    const lineBy = {}, gradeBy = {};
    for (const t of tables) {
      if (t.header.includes('라인번호') && t.header.includes('생산번호')) for (const r of t.rows) { const l = normLine(str(r['라인번호'])); if (l) lineBy[str(r['생산번호'])] = l; }
      if (t.header.includes('제품등급') && t.header.includes('제품번호')) for (const r of t.rows) { const g = str(r['제품등급']); if (g) gradeBy[str(r['제품번호'])] = g; }
    }
    const famOf = (p) => { for (const [re, f] of R.family) if (new RegExp(re).test(p)) return f; return ''; };
    const seen = new Set(), coils = [], bad = { dup: 0, noLine: 0, time: 0, sum: 0, dur: 0, byPrefix: 0 }, unkName = {}, unkDept = {};
    let dCon = 0, dDept = 0;
    for (const t of coilT) for (const r of t.rows) {
      const id = str(r['제품번호']);
      if (!id || /합계|소계|total/i.test(id)) continue;
      if (seen.has(id)) { bad.dup++; continue; }
      seen.add(id);
      let line = normLine(str(r['라인번호'])) || lineBy[str(r['생산번호'])] || '';
      if (!line && R.linePrefix[id.slice(0, 2)]) { line = R.linePrefix[id.slice(0, 2)]; bad.byPrefix++; }
      if (!line) { bad.noLine++; continue; }
      const s = toMin(r['작업시작시각']), e = toMin(r['작업종료시각']);
      const run = num(r['가동시간']) || 0, stop = num(r['휴지시간']) || 0;
      if (isNaN(s) || isNaN(e) || e < s) { bad.time++; continue; }
      const work = isNaN(num(r['작업시간'])) ? run + stop : num(r['작업시간']);
      if (Math.abs(work - run - stop) > 1) bad.sum++;
      if (Math.abs(e - s - work) > 2) bad.dur++;
      const pname = str(r['제품명']), deptName = str(r['부서명']), con = str(r['계약번호']).toUpperCase();
      const byCon = con.includes('D'), byDept = deptName === R.dummyDept;
      if (byCon !== byDept) { if (byCon) dCon++; else dDept++; }
      const dummy = byCon || byDept;
      const fam = famOf(pname);
      let cls = R.dept[deptName] || '';
      if (deptName === R.autoDept) cls = /[가-힣]/.test(str(r['최종고객사명'])) ? '자동차내수' : '자동차수출';
      if (!dummy && !fam) unkName[pname] = (unkName[pname] || 0) + (num(r['제품중량']) || 0) / 1000;
      if (!dummy && !cls) unkDept[deptName] = (unkDept[deptName] || 0) + (num(r['제품중량']) || 0) / 1000;
      const day = dayOf(r['생산계상일자']) || minToStr(e - 420).slice(0, 10);     // 없으면 07시 교대 기준(종료시각)
      coils.push({ id, line, day, s, e, work, stop, run, t: (num(r['제품중량']) || 0) / 1000, thick: num(r['제품두께']), width: num(r['제품폭']),
        pname, dept: deptName, fam, cls, dummy, grade: gradeBy[id] || str(r['제품등급']) || '' });
    }
    coils.sort((a, b) => (a.line < b.line ? -1 : a.line > b.line ? 1 : a.s - b.s || a.e - b.e));
    if (!coils.length) checks.push({ level: 'error', msg: '해석된 코일이 없음(라인번호·시각 확인)' });
    if (bad.dup) checks.push({ level: 'info', msg: `중복 제품번호 ${bad.dup}건 제외` });
    if (bad.noLine) checks.push({ level: 'warn', msg: `라인번호를 못 찾은 코일 ${bad.noLine}건 제외 — 쿼리에 라인번호 열을 넣거나 작업휴지(라인번호·생산번호) 엑셀을 같이 올리세요` });
    if (bad.byPrefix) checks.push({ level: 'info', msg: `라인번호 없는 코일 ${bad.byPrefix}건은 제품번호 앞글자로 라인 추정(` + Object.entries(R.linePrefix).map(([k, v]) => `${k}=${v}`).join(', ') + ')' });
    if (bad.time) checks.push({ level: 'warn', msg: `작업 시작·종료시각 오류 ${bad.time}건 제외` });
    if (bad.sum) checks.push({ level: 'warn', msg: `작업시간 ≠ 가동시간+휴지시간 ${bad.sum}건 — 시간 정의가 바뀌었는지 확인` });
    if (bad.dur) checks.push({ level: 'warn', msg: `종료−시작 ≠ 작업시간 ${bad.dur}건` });
    if (dCon || dDept) checks.push({ level: 'warn', msg: `더미 판정 불일치: 계약번호 D인데 공정출하그룹 아님 ${dCon}건, 공정출하그룹인데 계약번호 D 없음 ${dDept}건 — 둘 다 더미로 봄` });
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k || '(빈칸)'} ${GP.fmt(v)}t`).join(', ');
    if (Object.keys(unkName).length) checks.push({ level: 'warn', msg: `강종을 모르는 제품명(속도·M/C 분석 제외): ${top(unkName)} — 규칙 추가 필요` });
    if (Object.keys(unkDept).length) checks.push({ level: 'warn', msg: `부서 매핑 없음(속도 분석 제외): ${top(unkDept)}` });
    for (const l of [...new Set(coils.map((c) => c.line))]) {
      const cs = coils.filter((c) => c.line === l);
      let ov = 0; for (let i = 1; i < cs.length; i++) if (cs[i].s < cs[i - 1].e - 1) ov++;
      if (ov) checks.push({ level: 'warn', msg: `${l}: 작업구간이 겹치는 코일 ${ov}건(시간 합계가 과대될 수 있음)` });
    }
    const graded = coils.filter((c) => c.grade);
    if (graded.length) {
      const g = (arr) => { const o = {}; for (const c of arr) o[c.grade] = (o[c.grade] || 0) + 1; return Object.entries(o).sort().map(([k, v]) => `${k}:${v}`).join(' '); };
      checks.push({ level: 'info', msg: `제품등급 대조 — 더미 [${g(graded.filter((c) => c.dummy))}] / 제품 [${g(graded.filter((c) => !c.dummy))}]` });
    }
    return { coils, checks };
  };

  /* 분석. P: 현재 파라미터. 반환 {period, lines:{l:{...}}, speed[], events[], daily[], cands[], checks} */
  GP.mesAnalyze = function (coils, P, rules = GP.MES_RULES) {
    const R = rules, lines = {}, events = [], speed = [], cands = [];
    for (const l of P.lines) {
      const cs = coils.filter((c) => c.line === l);
      if (!cs.length) continue;
      const W0 = cs[0].s, W1 = Math.max(...cs.map((c) => c.e)), W = W1 - W0;
      const prod = cs.filter((c) => !c.dummy);
      const inEp = new Set();
      let swMin = 0, rsMin = 0;
      // 강종 전환: 강종을 아는 연속 제품코일 a→b 의 강종이 다르면, a 종료 ~ b 가동 시작(b 휴지 포함)이 전환 구간
      const seq = prod.filter((c) => c.fam);
      for (let i = 1; i < seq.length; i++) {
        const a = seq[i - 1], b = seq[i];
        if (a.fam === b.fam) continue;
        const between = cs.filter((c) => c.s >= a.e && c.e <= b.s);
        const minutes = b.s + b.stop - a.e;
        const long = b.stop >= R.longStop || between.some((c) => c.stop >= R.longStop) || (b.s - a.e) - GP.sum(between, (c) => c.work) >= R.longStop;
        between.forEach((c) => inEp.add(c)); inEp.add(b);
        const ev = { line: l, at: minToStr(a.e), day: b.day, from: a.fam, to: b.fam, minutes, kind: long ? '장기정지 후 재가동' : 'M/C', dummyN: between.filter((c) => c.dummy).length, dummyT: GP.sum(between.filter((c) => c.dummy), (c) => c.t) };
        events.push(ev);
        if (long) rsMin += minutes; else swMin += minutes;
      }
      // 장기정지(전환 아님): 한 코일 휴지 ≥ 1일
      let longMin = 0; const longs = [];
      for (const c of cs) if (!inEp.has(c) && c.stop >= R.longStop) { longMin += c.stop; longs.push({ at: minToStr(c.s), minutes: c.stop }); }
      const prodRun = GP.sum(prod, (c) => c.run);
      const bg = W - prodRun - swMin - rsMin - longMin;
      const bgDummy = GP.sum(cs.filter((c) => c.dummy && !inEp.has(c)), (c) => c.work);
      const opDays = (W - rsMin - longMin) / 1440;
      const mc = events.filter((e) => e.line === l && e.kind === 'M/C');
      lines[l] = {
        from: minToStr(W0), to: minToStr(W1), days: W / 1440, opDays, coils: cs.length, tons: GP.sum(prod, (c) => c.t), dummyN: cs.length - prod.length, dummyT: GP.sum(cs.filter((c) => c.dummy), (c) => c.t),
        prodRun, util: prodRun / W, swMin, rsMin, longMin, longs, bg, bgDummy, bgStop: bg - bgDummy,
        bgDummyPerDay: opDays > 0 ? bgDummy / opDays : NaN, bgStopPerDay: opDays > 0 ? (bg - bgDummy) / opDays : NaN,
        mcN: mc.length, mcMedian: median(mc.map((e) => e.minutes)),
      };
      const Li = lines[l];
      const longOk = Li.opDays >= R.minDays;
      cands.push({ path: ['switchDummy', l], label: `${l} 강종전환(M/C) 손실`, unit: '분/회', cur: P.switchDummy[l], act: Li.mcMedian, n: Li.mcN, basis: `M/C ${Li.mcN}건 중앙값`, ok: Li.mcN >= R.minEvents });
      cands.push({ path: ['nonfamDummy', l], label: `${l} 비강종 더미`, unit: '분/일', cur: P.nonfamDummy[l], act: Li.bgDummyPerDay, n: Li.opDays, basis: `가동 ${GP.fmt(Li.opDays, 1)}일, 전환 구간 밖 더미코일 작업시간`, ok: longOk });
      cands.push({ path: ['equipDown', l], label: `${l} 설비정지(기타 휴지·빈 시간)`, unit: '분/일', cur: P.equipDown[l], act: Li.bgStopPerDay, n: Li.opDays, basis: `가동 ${GP.fmt(Li.opDays, 1)}일, 전환·장기정지 제외`, ok: longOk });
      // 속도: 라인×강종군×부서
      const g = {};
      for (const c of prod) {
        if (!c.fam || !c.cls || !(c.run > 0 && c.run < R.speedRunMax)) continue;
        const k = `${l}|${c.fam}|${c.cls}`, x = g[k] || (g[k] = { t: 0, run: 0, n: 0, th: 0, w: 0 });
        x.t += c.t; x.run += c.run; x.n++; x.th += (c.thick || 0) * c.t; x.w += (c.width || 0) * c.t;
      }
      for (const [k, x] of Object.entries(g).sort()) {
        const [, fam, cls] = k.split('|');
        let cur = null; try { cur = GP.rateFor(P, l, fam, cls); } catch (e) { cur = null; }
        const act = x.t / x.run;
        const s = { key: k, line: l, fam, cls, n: x.n, t: x.t, run: x.run, act, cur, diff: cur ? act / cur - 1 : null, thick: x.th / x.t, width: x.w / x.t };
        speed.push(s);
        if (P.rateDept[k] != null || cur != null) cands.push({ path: ['rateDept', k], label: `${l} ${fam} ${cls} 속도`, unit: 't/hr', scale: 60, cur, act, n: x.n, basis: `${x.n}코일 ${GP.fmt(x.t)}t · 평균 ${GP.fmt(s.thick, 2)}mm×${GP.fmt(s.width)}`, ok: longOk && x.n >= R.minCoils && x.t >= R.minTons });
      }
    }
    for (const c of cands) { c.diff = c.cur && isFinite(c.act) ? c.act / c.cur - 1 : null; c.flag = c.diff != null && Math.abs(c.diff) >= R.tol; c.apply = c.ok && c.flag; }
    // 일별 실적(생산계상일자, 더미 제외, 강종·부서 아는 것)
    const dm = {};
    for (const c of coils) if (!c.dummy && c.fam && c.cls) { const k = `${c.day}|${c.line}|${c.fam}|${c.cls}`; dm[k] = (dm[k] || 0) + c.t; }
    const daily = Object.entries(dm).map(([k, t]) => { const [d, l, f, c] = k.split('|'); return [d, l, f, c, GP.round(t, 3)]; }).sort((a, b) => (a.join() < b.join() ? -1 : 1));
    const all = coils.map((c) => c.day).sort();
    return { period: { from: all[0], to: all[all.length - 1] }, lines, speed, events, daily, cands };
  };

  /* 선택한 후보를 파라미터에 반영(복사본 반환) */
  GP.mesApply = function (P, cands) {
    const Q = GP.clone(P);
    for (const c of cands) if (isFinite(c.act) && c.act > 0) Q[c.path[0]][c.path[1]] = GP.round(c.act, c.path[0] === 'rateDept' ? 6 : 2);
    return Q;
  };

  /* 대시보드 게시용 요약(작게) */
  GP.mesSummary = function (an, clean) {
    const r = (x, k) => (x != null && isFinite(x) ? GP.round(x, k) : null);
    return {
      period: an.period, analyzedAt: new Date().toISOString(),
      lines: Object.fromEntries(Object.entries(an.lines).map(([l, x]) => [l, { from: x.from, to: x.to, days: r(x.days, 1), opDays: r(x.opDays, 1), coils: x.coils, tons: r(x.tons), dummyT: r(x.dummyT), util: r(x.util, 4), mcN: x.mcN, mcMedian: r(x.mcMedian, 1), bgDummyPerDay: r(x.bgDummyPerDay, 1), bgStopPerDay: r(x.bgStopPerDay, 1), longMin: r(x.longMin) }])),
      speed: an.speed.map((s) => ({ key: s.key, n: s.n, t: r(s.t), act: r(s.act, 6), cur: r(s.cur, 6), thick: r(s.thick, 3) })),
      events: an.events.map((e) => ({ line: e.line, at: e.at, from: e.from, to: e.to, minutes: e.minutes, kind: e.kind })),
      cands: an.cands.map((c) => ({ label: c.label, unit: c.unit, scale: c.scale || 1, cur: r(c.cur, 6), act: r(c.act, 6), ok: c.ok, flag: c.flag })),
      warns: (clean && clean.checks || []).filter((c) => c.level !== 'info').map((c) => c.msg),
    };
  };

  /* 주별(월요일 시작) 라인×강종×부서 속도 추이. 행: [주, 라인, 강종, 부서, 톤, 가동분, 코일수] — Python mes.weekly 와 동일 */
  GP.mesWeekly = function (coils, R = GP.MES_RULES) {
    const g = {};
    for (const c of coils) {
      if (c.dummy || !c.fam || !c.cls || !(c.run > 0 && c.run < R.speedRunMax)) continue;
      const wd = (new Date(c.day + 'T00:00:00Z').getUTCDay() + 6) % 7, wk = GP.addDays(c.day, -wd);
      const k = `${wk}|${c.line}|${c.fam}|${c.cls}`, x = g[k] || (g[k] = [0, 0, 0]);
      x[0] += c.t; x[1] += c.run; x[2]++;
    }
    return Object.keys(g).sort().map((k) => k.split('|').concat([GP.round(g[k][0], 3), GP.round(g[k][1], 1), g[k][2]]));
  };
  /* 분석 화면용 전체 결과 — Python mes.export 와 같은 형식 */
  GP.mesExport = function (an, clean, coils) {
    const r = (x, k) => (x != null && isFinite(x) ? GP.round(x, k) : null);
    return Object.assign(GP.mesSummary(an, clean), {
      app: 'cgl-analysis', version: 1,
      speed: an.speed.map((s) => ({ key: s.key, n: s.n, t: r(s.t, 1), run: r(s.run, 0), act: r(s.act, 6), cur: r(s.cur, 6), thick: r(s.thick, 3), width: r(s.width, 0) })),
      events: an.events.map((e) => ({ line: e.line, at: e.at, from: e.from, to: e.to, minutes: e.minutes, kind: e.kind, dummyN: e.dummyN, dummyT: r(e.dummyT, 1) })),
      cands: an.cands.map((c) => ({ path: c.path, label: c.label, unit: c.unit, scale: c.scale || 1, cur: r(c.cur, 6), act: r(c.act, 6), n: r(c.n, 1), basis: c.basis, ok: c.ok, flag: c.flag, apply: c.apply })),
      daily: an.daily, weekly: GP.mesWeekly(coils), checks: (clean && clean.checks) || [],
    });
  };

  /* 재계획 입력으로 변환 — 마감일은 같은 부서·강종군의 가장 이른 미완료 버킷에 순서대로 배정 */
  GP.mesToActual = function (an, coils, R, t0Given) {
    const P = R.P, H = GP.horizon(P), checks = [];
    // 기준일: 지정 없으면 마지막 완결일(다음날 06시까지 코일이 있는 날)
    let t0 = '';
    {
      for (const l of P.lines) {
        const cs = coils.filter((c) => c.line === l); if (!cs.length) continue;
        const last = cs[cs.length - 1], d = last.day, endOk = last.e >= toMin(GP.addDays(d, 1)) + 360;
        const x = endOk ? d : GP.addDays(d, -1);
        if (!t0 || x < t0) t0 = x;
      }
    }
    if (!t0) return { checks: [{ level: 'error', msg: '실적 코일 없음' }] };
    if (t0Given && t0Given < t0) t0 = t0Given;
    else if (t0Given && t0Given > t0) checks.push({ level: 'info', msg: `기준일 ${t0Given} → 실적이 다 들어온 마지막 날 ${t0}로 조정` });
    if (t0 < H.D0) return { checks: [{ level: 'error', msg: `실적 마지막 완결일 ${t0}이 계획 기간(${H.D0}~) 이전 — 재계획할 실적이 없음(실적 분석만 가능)` }] };
    const before = an.daily.filter((r) => r[0] < H.D0);
    if (before.length) checks.push({ level: 'info', msg: `계획 기간 이전 실적 ${GP.fmt(GP.sum(before, (r) => r[4]))}t은 재계획에서 제외` });
    const raw = an.daily.filter((r) => r[0] >= H.D0 && r[0] <= t0).map(([d, l, f, c, t]) => ({ d, l, fam: f, c, t }));
    const left = {}; for (const b of R.buckets) left[`${b.cls}|${b.alloy}|${b.due}`] = b.orig;
    const rows = [], overT = {};
    for (const x of raw.sort((p, q) => (p.d < q.d ? -1 : p.d > q.d ? 1 : 0))) {
      let t = x.t;
      const bs = R.buckets.filter((b) => b.cls === x.c && P.alloyFamily[b.alloy] === x.fam && (P.allowed[x.l] || []).includes(b.alloy)).sort((p, q) => (p.due < q.due ? -1 : p.due > q.due ? 1 : 0));
      for (const b of bs) {
        const k = `${b.cls}|${b.alloy}|${b.due}`, take = Math.min(t, Math.max(0, left[k]));
        if (take > 1e-6) { rows.push([x.d, x.l, b.alloy, b.cls, GP.round(take, 2), b.due]); left[k] -= take; t -= take; }
        if (t <= 1e-6) break;
      }
      if (t > 0.5) { const k = `${x.l} ${x.fam} ${x.c}`; overT[k] = (overT[k] || 0) + t; }
    }
    // 파일에 실적이 없는 기간(라인 전체, 또는 파일 시작일 이전)은 계획대로 생산했다고 봄(경고)
    for (const l of P.lines) {
      const cs = coils.filter((c) => c.line === l), first = cs.length ? cs.reduce((m, c) => (c.day < m ? c.day : m), cs[0].day) : GP.addDays(t0, 1);
      if (first <= H.D0) continue;
      const last = first <= t0 ? GP.addDays(first, -1) : t0;
      for (const r of R.rows) if (r[1] === l && r[0] >= H.D0 && r[0] <= last) rows.push(r.slice());
      checks.push({ level: 'warn', msg: cs.length ? `${l} ${GP.md(H.D0)}~${GP.md(last)} 실적이 파일에 없음 — 이 기간은 계획대로 생산한 것으로 봄(쿼리 기간을 계획 시작 전부터로 늘리세요)` : `${l} 실적이 파일에 없음 — ${l}은 ~${GP.md(t0)} 계획대로 생산한 것으로 봄` });
    }
    for (const [k, t] of Object.entries(overT)) checks.push({ level: 'warn', msg: `실적 ${k} ${GP.fmt(t)}t: 배정할 미완료 수요 없음(계획 밖 생산) — 재계획에서 제외` });
    const state = {};
    for (const l of P.lines) {
      const cs = coils.filter((c) => c.line === l && !c.dummy && c.fam && c.day <= t0);
      const c = R.cal.find((x) => x.line === l && x.date === t0);
      state[l] = cs.length ? cs[cs.length - 1].fam : (c ? c.fam : P.initFamily[l]);
    }
    const planT = GP.sum(R.rows.filter((r) => r[0] <= t0), (r) => r[4]), actT = GP.sum(rows, (r) => r[4]);
    const notes = [`MES 실적 ~${GP.md(t0)}: ${GP.fmt(actT)}t (계획 ${GP.fmt(planT)}t, 차이 ${GP.fmt(actT - planT)}t)`];
    checks.push({ level: 'info', msg: `MES 실적 기준일 ${t0}, 현재 강종 ` + P.lines.map((l) => `${l} ${state[l]}`).join('·') });
    return { t0, rows, state, extraDown: {}, notes, checks };
  };

  GP.mesFromWorkbooks = function (wbs, P) {
    const clean = GP.mesClean(GP.mesTables(GP.mesSheetsFromWorkbooks(wbs)));
    if (clean.checks.some((c) => c.level === 'error')) return { clean, an: null };
    return { clean, an: GP.mesAnalyze(clean.coils, P) };
  };
  GP._mes = { toMin, minToStr, median };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
