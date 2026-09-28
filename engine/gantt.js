/* 월별 간트(회사 양식) canvas 그리기. 원본: gadong-plan code/plot_gantt_final.py (matplotlib) */
(function (root) {
  const GP = root.GP || (root.GP = {});
  const C = { ink: '#1a1a1a', grid: '#b7b7b0', head: '#eef0f2', sat: '#f4c07a', sun: '#f2a3a3', mc: '#fff36b', sd: '#c7c7c0', restart: '#1c8a4a', white: '#ffffff', down: '#f4cccc', note: '#8a4b00', self: '#1f4e9a' };
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","Noto Sans CJK KR",sans-serif';

  /* canvas에 한 달 간트를 그림. scale=픽셀 배율 */
  GP.drawGanttMonth = function (canvas, R, A, mi, scale = 2) {
    const P = R.P, [y, m] = A.H.ym[mi], nd = GP.daysInMonth(y, m), L = P.lines;
    const LW = 64, LW2 = 78, DW = 34, TW = 50, RH = 26, TOP = 78;
    const rowsPerLine = L.map((l) => GP.famOrder(P, l).length + 1);
    const W = LW + LW2 + nd * DW + TW + 2, Hh = TOP + RH * 2 + RH * GP.sum(rowsPerLine) + 8;
    canvas.width = W * scale; canvas.height = Hh * scale;
    const g = canvas.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.fillStyle = C.white; g.fillRect(0, 0, W, Hh);
    const cell = (x, yy, w, h, text = '', o = {}) => {
      g.fillStyle = o.bg || C.white; g.fillRect(x, yy, w, h);
      g.strokeStyle = o.edge || C.grid; g.lineWidth = o.lw || 0.6; g.strokeRect(x + 0.3, yy + 0.3, w - 0.6, h - 0.6);
      if (text !== '') {
        g.fillStyle = o.color || C.ink; g.font = `${o.bold ? 'bold ' : ''}${o.fs || 11}px ${FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        String(text).split('\n').forEach((t, i, arr) => g.fillText(t, x + w / 2, yy + h / 2 + (i - (arr.length - 1) / 2) * (o.fs || 11) * 1.15));
      }
    };
    const text = (t, x, yy, o = {}) => { g.fillStyle = o.color || C.ink; g.font = `${o.bold ? 'bold ' : ''}${o.fs || 12}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(t, x, yy); };

    text(`■ '${String(y).slice(2)}.${m}월 도금공장 가동계획(안)`, 2, 22, { fs: 17, bold: true });
    L.forEach((l, i) => {
      const evs = A.events.filter((e) => e.line === l && A.mIdx(e.date) === mi);
      let cap = `${l}: ` + (evs.map((e) => `${+e.date.slice(8)}일 ${e.kind === 'M/C' ? `M/C ${e.from}→${e.to}` : (e.from === e.to ? `S/D 재가동(${e.to} 유지, 더미 ${e.loss}분)` : `S/D 재가동 ${e.from}→${e.to}(더미 ${e.loss}분)`)}`).join(', ') || '강종전환 없음');
      const sds = P.shutdowns.filter((s) => s.line === l && s.start <= GP.monthEnd(y, m) && s.end >= GP.ymd(y, m, 1));
      if (sds.length) cap += '   |   정기수리 ' + sds.map((s) => `${GP.md(s.start)}~${GP.md(s.end)}`).join(', ');
      if (i === 0 && mi === 0 && P.firstWindowPrevMonth) cap += `   |   ※ ${m}/1~5 선적분(${GP.fmt(GP.sum(R.sept, (s) => s.tons))}t)은 전월 생산 가정`;
      text(cap, 2, 44 + i * 17, { fs: 12, bold: true, color: C.note });
    });
    let yy = TOP;
    const x0 = LW + LW2;
    cell(0, yy, LW + LW2, RH, '', { bg: C.head }); cell(0, yy + RH, LW + LW2, RH, '', { bg: C.head });
    for (let d = 1; d <= nd; d++) {
      const wk = GP.weekday(GP.ymd(y, m, d));
      cell(x0 + (d - 1) * DW, yy, DW, RH, d, { bg: C.head, bold: true, fs: 12 });
      cell(x0 + (d - 1) * DW, yy + RH, DW, RH, wk, { bg: wk === '토' ? C.sat : wk === '일' ? C.sun : C.head, fs: 11 });
    }
    cell(x0 + nd * DW, yy, TW, RH, '계', { bg: C.head, bold: true, fs: 12 }); cell(x0 + nd * DW, yy + RH, TW, RH, '', { bg: C.head });
    yy += RH * 2;
    const famLD = {}, selfLD = {};
    for (const [d, l, a, c, t] of R.rows) {
      const k = `${l}|${d}|${P.alloyFamily[a]}`; famLD[k] = (famLD[k] || 0) + t;
      if (c === '자가재') selfLD[`${l}|${d}`] = (selfLD[`${l}|${d}`] || 0) + t;
    }
    for (const l of L) {
      const fams = GP.famOrder(P, l), y0 = yy;
      const rows = fams.map((f) => [GP.FAMLABEL[f] || f, f]).concat([['가동시간(h)', 'hrs']]);
      for (const [lab, key] of rows) {
        cell(LW, yy, LW2, RH, lab, { fs: 12 });
        let tot = 0;
        for (let d = 1; d <= nd; d++) {
          const ds = GP.ymd(y, m, d), c = A.calBy[`${l}|${ds}`];
          const o = { fs: key === 'hrs' ? 10 : 11 };
          let t = '';
          if (c.blackout) o.bg = C.sd;
          else {
            if (GP.isSwitch(c)) o.bg = C.mc; else if (GP.isDown(c)) o.bg = C.down;
            if (key === 'hrs') { const h = (A.used[`${l}|${ds}`] || 0) / 60; t = h > 0 ? h.toFixed(0) : ''; }
            else {
              const v = famLD[`${l}|${ds}|${key}`] || 0; tot += v;
              t = v > 0.5 ? GP.fmt(v) : (GP.isSwitch(c) && /\((.+)→/.exec(c.event) && /\((.+)→/.exec(c.event)[1] === key ? (c.event.startsWith('M/C') ? 'M/C' : '') : '');
              if (v > 0.5 && (selfLD[`${l}|${ds}`] || 0) > 0.5) { o.bold = true; o.color = C.self; }
            }
            if (GP.isSwitch(c) && c.event.startsWith('S/D')) { o.edge = C.restart; o.lw = 2.4; }
          }
          cell(x0 + (d - 1) * DW, yy, DW, RH, t, o);
        }
        cell(x0 + nd * DW, yy, TW, RH, key === 'hrs' ? '' : GP.fmt(tot), { bg: C.head, bold: true, fs: 11 });
        yy += RH;
      }
      cell(0, y0, LW, yy - y0, l, { bold: true, fs: 14 });
      // 정기수리 라벨
      const sdDays = [];
      for (let d = 1; d <= nd; d++) if (A.calBy[`${l}|${GP.ymd(y, m, d)}`].blackout) sdDays.push(d);
      if (sdDays.length) {
        const sd = P.shutdowns.find((s) => s.line === l && s.start <= GP.ymd(y, m, sdDays[0]) && GP.ymd(y, m, sdDays[0]) <= s.end);
        const xa = x0 + (sdDays[0] - 1) * DW, xb = x0 + sdDays[sdDays.length - 1] * DW;
        g.fillStyle = C.sd; g.fillRect(xa, y0, xb - xa, yy - y0);
        g.strokeStyle = C.grid; g.lineWidth = 0.6; g.strokeRect(xa, y0, xb - xa, yy - y0);
        if (xb - xa > 60) cell(xa, y0, xb - xa, yy - y0, `정기수리(S/D)\n${sd ? `${GP.md(sd.start)}~${GP.md(sd.end)}` : ''}`, { bg: C.sd, edge: C.sd, bold: true, fs: 12, color: C.note });
      }
    }
    return canvas;
  };

  /* 분기 요약표: 강종군 × (내수/수출/자가) × 라인 */
  GP.drawSummary = function (canvas, R, A, scale = 2) {
    const P = R.P, L = P.lines;
    const GROUP = { '도금수출': '수출', '자동차수출': '수출', '자가재': '자가', '도금국내': '내수', '자동차내수': '내수' };
    const fams = ['MAC', 'AZ', 'AL'], groups = ['내수', '수출', '자가', '계'];
    const agg = {};
    for (const [d, l, a, c, t] of R.rows) { const k = `${P.alloyFamily[a]}|${GROUP[c] || '내수'}|${l}`; agg[k] = (agg[k] || 0) + t; }
    const LWs = 60, CW = 62, RH = 26, GAP = 16, TOP = 36;
    const W = fams.length * (LWs + CW * 4) + GAP * (fams.length - 1) + 4, Hh = TOP + RH * (L.length + 2) + 6;
    canvas.width = W * scale; canvas.height = Hh * scale;
    const g = canvas.getContext('2d'); g.setTransform(scale, 0, 0, scale, 0, 0);
    g.fillStyle = C.white; g.fillRect(0, 0, W, Hh);
    const cell = (x, y, w, h, t, o = {}) => {
      g.fillStyle = o.bg || C.white; g.fillRect(x, y, w, h); g.strokeStyle = C.grid; g.lineWidth = 0.6; g.strokeRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6);
      g.fillStyle = C.ink; g.font = `${o.bold ? 'bold ' : ''}12px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + w / 2, y + h / 2);
    };
    g.fillStyle = C.ink; g.font = `bold 15px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(`■ 분기 강종별 물량 요약(t) — M/C ${L.map((l) => `${l} ${A.mc[l]}회`).join('·')}, 결품 ${GP.fmt(A.short)}t, 지연 ${GP.fmt(A.lateT)}t`, 2, 22);
    let x = 0;
    for (const f of fams) {
      let y = TOP;
      cell(x, y, LWs, RH, f === 'MAC' ? 'MACOSTA' : f, { bg: C.head, bold: true });
      groups.forEach((gname, j) => cell(x + LWs + j * CW, y, CW, RH, gname, { bg: C.head, bold: true }));
      y += RH;
      for (const l of L.concat(['계'])) {
        cell(x, y, LWs, RH, l);
        let s = 0;
        groups.slice(0, 3).forEach((gname, j) => {
          const v = l === '계' ? GP.sum(L, (ll) => agg[`${f}|${gname}|${ll}`] || 0) : (agg[`${f}|${gname}|${l}`] || 0);
          s += v; cell(x + LWs + j * CW, y, CW, RH, v > 0.5 ? GP.fmt(v) : '-');
        });
        cell(x + LWs + 3 * CW, y, CW, RH, GP.fmt(s), { bg: C.head, bold: true });
        y += RH;
      }
      x += LWs + CW * 4 + GAP;
    }
    return canvas;
  };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
