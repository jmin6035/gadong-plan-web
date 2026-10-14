/* 가동 캘린더(supply.html) · 소재 캘린더(matcal.html): published/integrated.enc.json(확정 통합 계획 V1) — 일별 가동·자가재·구매 소재(발주·입고·재고)·제품 재고 + 날짜 상세
   매일 바뀌는 부분(2026-10-15): 도금 = 사내 PC 아침 재계획(latest.plan — 지난 날 = MES 실적, 이후 = 재계획), 컬러 지난 날 = MES 실적(color_actual), 제품 재고 = 매일 롤링(portal.stockRoll). 자가재·구매 소재는 확정 계획 */
(function () {
  'use strict';
  const NOEL = document.createElement('div');                      // 가동 캘린더(supply.html)·소재 캘린더(matcal.html)가 같은 코드 — 없는 칸은 빈 자리로
  const $ = (id) => document.getElementById(id) || NOEL;
  const PAGE = (document.getElementById('shell') || {}).dataset ? document.getElementById('shell').dataset.page : 'supply';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => new Date(d + 'T00:00:00').getDay();
  const add = (d, k) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + k); return x.toLocaleDateString('sv-SE'); };
  const today = new Date().toLocaleDateString('sv-SE');
  const diff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);
  const FAM = (a) => (/^AZ/.test(a) ? 'AZ' : /^MAC/.test(a) ? 'MAC' : 'AL');
  const KEY = 'cgl-analysis-pw';
  let D = null, PM = null, MP = null, mon = null, sel = null;

  // ---------- 자료 정리: 날짜(YYYY-MM-DD) 기준 표 ----------
  function prep(W) {
    const V = W.variants[W.rec] || W.variants.V1, Y = (W.asOf || '2026').slice(0, 4);
    const full = (mmdd) => `${Y}-${mmdd}`;
    const days = V.self.AZ.map((r) => full(r[0]));
    const pl = {}, co = {}, self = {}, mat = {}, ord = { FH: {}, CMAT: {} }, sw = {};
    for (const x of V.plating) {
      const t = Object.values(x.cls).reduce((a, v) => a + v, 0), fa = {};
      for (const [a, v] of Object.entries(x.alloy)) fa[FAM(a)] = (fa[FAM(a)] || 0) + v;
      pl[`${x.l}|${x.d}`] = { t, fam: Object.keys(fa).sort((a, b) => fa[b] - fa[a])[0], ev: x.ev || '', cls: x.cls, items: x.items || [], why: x.why || [] };
    }
    for (const x of W.color) co[`${x.l}|${x.d}`] = { t: Object.values(x.g).reduce((a, v) => a + v, 0), g: x.g, act: x.act, rows: x.rows || [] };
    for (const [a, rows] of Object.entries(V.self)) for (const r of rows) self[`${a}|${full(r[0])}`] = { use: r[1], prod: r[2], stock: r[3] };
    for (const [k, m] of Object.entries(V.mat)) for (const r of m.rows) {
      const d = full(r[0]);
      mat[`${k}|${d}`] = { use: r[1], inb: r[2], od: r[3] ? full(r[3]) : '', stock: r[4] };
      if (r[2] > 0.5 && r[3]) { const o = full(r[3]); (ord[k][o] = ord[k][o] || []).push([d, r[2]]); }
    }
    const est = {};                                                      // 계획 기간(12/31) 너머 1월분을 추정해 낸 12월 발주
    for (const [k, e] of Object.entries(V.matExt || {})) for (const [o, a, t] of e.orders) { (ord[k][o] = ord[k][o] || []).push([a, t, 1]); est[`${k}|${o}`] = 1; }
    if (V.stockDay) for (const [g, arr] of Object.entries(V.stockDay)) days.forEach((d, i) => { sw[`${g}|${d}`] = { v: arr[i], tgt: V.stockTgt[g][+d.slice(5, 7) - 10] }; });
    else W.weeks.forEach((w, i) => { for (const s of V.stockWeek) if (!/자가재|FH|구매소재/.test(s.k)) sw[`${s.k}|${w}`] = { v: s.v[i], tgt: s.tgt[i] }; });
    const flow = (V.selfFlow || []).map((f, i) => Object.assign({ i }, f)), fMade = {}, fUse = {};
    for (const f of flow) { for (const [d, l, t] of f.made) (fMade[`${l}|${d}`] = fMade[`${l}|${d}`] || []).push([f, t]); for (const [d, l, t] of f.use) (fUse[`${l}|${d}`] = fUse[`${l}|${d}`] || []).push([f, t]); }
    const months = [...new Set(days.map((d) => d.slice(0, 7)))];
    return { W, V, days, months, pl, co, self, mat, ord, sw, est, flow, fMade, fUse, selfEst: V.selfEstFrom || '9999', matInfo: V.mat, groups: V.stockWeek.filter((s) => !/자가재|FH|구매소재/.test(s.k)).map((s) => s.k) };
  }

  // ---------- 매일 재계획 반영(2026-10-15 사용자: 가동 캘린더 매일 재계획) ----------
  async function live(pw) {
    const get = async (n) => { try { const e = await GP.latest(n); return e ? await GP.decryptJSON(e, pw) : null; } catch (x) { return null; } };
    const [LP, CA, PO] = await Promise.all([get('latest.plan.enc.json'), get('color_actual.enc.json'), get('portal.enc.json')]);
    const inQ = (d) => d >= D.days[0] && d <= D.days[D.days.length - 1], info = {};
    const R = LP && (LP.result || LP);
    if (R && R.rows && R.cal) {                                          // 도금: 확정 계획 화면과 같은 칸 구성(tools/integrated_web.plating_view)
      const t0 = (R.replan || {}).t0 || '', cells = {}, ev = {}, runs = {};
      const cell = (l, d) => (cells[`${l}|${d}`] = cells[`${l}|${d}`] || { cls: {}, alloy: {}, items: [] });
      for (const [d, l, a, c, t] of R.rows) { const x = cell(l, d); x.cls[c] = (x.cls[c] || 0) + t; x.alloy[a] = (x.alloy[a] || 0) + t; }
      for (const [d, l, a, c, dest, port, win, t, due] of R.dest || []) cell(l, d).items.push([a, c, dest, port || '', win || '', Math.round(t * 10) / 10, due]);
      for (const c of R.cal.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
        ev[`${c.line}|${c.date}`] = c;
        const L = (runs[c.line] = runs[c.line] || []), z = L[L.length - 1];
        if (z && z[2] === c.fam) z[1] = c.date; else L.push([c.date, c.date, c.fam]);
      }
      const pl = {};
      for (const k of new Set([...Object.keys(cells), ...Object.keys(ev)])) {
        const [l, d] = k.split('|'); if (!inQ(d)) continue;
        const x = cells[k] || { cls: {}, alloy: {}, items: [] }, e = ev[k] || {}, fa = {};
        const t = Object.values(x.cls).reduce((a, v) => a + v, 0);
        if (t < 0.5 && !e.event) continue;
        for (const [a, v] of Object.entries(x.alloy)) fa[FAM(a)] = (fa[FAM(a)] || 0) + v;
        const act = d <= t0, cp = (runs[l] || []).find((r) => r[0] <= d && d <= r[1]), why = [];
        if (act) why.push('MES 생산 실적(사내 PC 재계획 파일에 반영된 값)');
        else {
          if (cp) why.push(`${l} ${cp[2]} 캠페인 ${cp[0].slice(5)}~${cp[1].slice(5)} — 오늘 아침 재계획의 강종 구간(M/C 횟수 최소화)`);
          const early = x.items.filter((it) => diff(it[6], d) > 14);
          why.push(early.length ? `납기보다 15일 이상 앞선 생산 ${n0(early.reduce((a, it) => a + it[5], 0))}t — 해당 강종의 이 라인 생산 가능 구간이 이 캠페인뿐이거나 후반 능력 부족` : '납기 근접 배치(선행 생산량 톤·일 최소화)');
        }
        pl[k] = { t, fam: Object.keys(fa).sort((a, b) => fa[b] - fa[a])[0] || FAM(e.fam || 'AL'), ev: e.event || '', cls: x.cls, items: x.items.sort((a, b) => (a[6] < b[6] ? -1 : 1)), why, act };
      }
      D.pl = pl;
      const kst = LP.savedAt ? new Date(new Date(LP.savedAt).getTime() + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ') : '';   // 한국 시각
      info.pl = { t0, at: kst, notes: (R.replan || {}).notes || [] };
    }
    const BD = CA && CA.byGroup && CA.byGroup.days;
    if (BD) {                                                            // 컬러: 지난 날은 MES 실적으로 덮음(확정 계획 계산 뒤의 실적일)
      const last = CA.byGroup.asOf;
      for (const d of D.days) {
        if (d > last) break;
        for (const l of ['1CCL', '2CCL', '3CCL', '4CCL']) {
          const v = (BD[d] || {})[l];
          if (!v) { delete D.co[`${l}|${d}`]; continue; }
          const t = Object.values(v[0]).reduce((a, x) => a + x, 0);
          D.co[`${l}|${d}`] = { t, g: v[0], act: true, rows: (v[2] || []).map(([p, tt]) => ['실적', p, '', '', '실적', tt, 0, 0, 'MES 생산 실적', '', p, 0, [], '']) };
        }
      }
      info.co = last;
    }
    const SR = PO && PO.stockRoll;
    if (SR && SR.days && SR.d0) {                                        // 제품 재고: 어제 말 실제 → 재계획 생산 − 계획 출고(매일 롤링)
      for (const [g, arr] of Object.entries(SR.days)) arr.forEach((v, i) => { const d = add(SR.d0, i), k = `${g}|${d}`; if (v == null || !D.sw[k]) return; D.sw[k] = { ...D.sw[k], v, act: d <= SR.asOf }; });
      info.st = SR.asOf;
    }
    return info;
  }

  // ---------- 구매 소재: 오늘 재고(소재재고List·FH 추정) − 계획 필요량(주 단위를 7일에 고르게) + 알려진 입고(수입 FH 기발주) — 새 발주 없다고 보면 언제 바닥나나 ----------
  const SAFE = { C: 7, G: 5 };
  function prepMat(P) {
    if (!P) return null;
    const ds = D.days.filter((d) => d >= today), out = [];
    const keys = [...new Set(P.units.map((u) => `${u.plant}:${u.code}`))];
    for (const k of keys) {
      const [plant, code] = k.split(':');
      if (plant === 'G' && code === 'N') continue;                     // 임가공(포스코 지급)
      const use = {}, arr = {};
      for (const u of P.units) if (`${u.plant}:${u.code}` === k) for (let i = 0; i < 7; i++) { const d = add(u.wk, i); if (d >= today) use[d] = (use[d] || 0) + u.t / 7; }
      let past = 0;                                                     // 오늘 이전 날짜의 기발주 = 이미 들어온 것 → 오늘 재고에 더함(FH 재고는 입고 자료가 없어서)
      for (const a of P.known || []) if (`${a.plant}:${a.code}` === k) { if (a.date <= today) past += a.t; else arr[a.date] = (arr[a.date] || 0) + a.t; }
      const s0 = (P.stock[k] || 0) + past;
      let st = s0, run = null; const stock = {};
      for (const d of ds) { st += (arr[d] || 0) - (use[d] || 0); stock[d] = st; if (run == null && st < 0) run = d; }
      const tot = Object.values(use).reduce((a, v) => a + v, 0); if (tot < 5) continue;
      const u28 = ds.slice(0, 28).reduce((a, d) => a + (use[d] || 0), 0) / 28;
      const sup = P.suppliers.filter((x) => x.plant === plant && x.code === code).sort((a, b) => a.prio - b.prio)[0];
      const needBy = run ? add(run, -SAFE[plant]) : null, dl = needBy && sup ? add(needBy, -sup.lt) : null;
      const kg = {}; for (const a of P.known || []) if (`${a.plant}:${a.code}` === k) kg[a.date] = (kg[a.date] || 0) + a.t;
      const rows = (P.known || []).filter((a) => `${a.plant}:${a.code}` === k && a.date > today);   // 입고 예정 발주별(업체·발주번호·근거)
      out.push({ k, plant, code, nm: (P.matCode || {})[code] || code, stock0: s0, past, use, arr, stock, run, u28, tot, sup, needBy, dl, rows,
        known: Object.entries(kg).sort().map(([d, t]) => ({ date: d, t })) });
    }
    SUPN = P.supNames || {};
    return out.sort((a, b) => (a.plant < b.plant ? 1 : a.plant > b.plant ? -1 : b.tot - a.tot));
  }
  let SUPN = {};
  const PLN = { G: '도금 FH', C: '컬러 구매' };
  const calAll = (sel = '[data-d]') => document.querySelectorAll(`#s-cal ${sel}, #s-cal2 ${sel}`);
  const ordSum = (k, d) => (D.ord[k][d] || []).reduce((a, x) => a + x[1], 0);
  const useNext = (a, d, n) => { let s = 0; for (let i = 1; i <= n; i++) { const x = D.self[`${a}|${add(d, i)}`]; if (x) s += x.use; } return s; };

  // ---------- 소재 유형 캘린더(2026-10-14 회의): 줄 = 팀 리드타임 표 소재 유형, 칸 = 그날 발주할 양 · 들어올 양 ----------
  // 발주 = 소재 발주 화면과 같은 계산(ui/proccalc.js: 재고·기발주 충당 후 부족분을 27년 배정 비중대로 업체별로 나눔) — 업체별 발주 마감일에 놓음, 마감이 지난 몫은 오늘 칸(빨강)
  // 입고 = MES 기발주 입고 예정 + 새 발주분이 들어와야 할 날(입고 필요일 = 첫 사용일 − 투입 여유)
  const TYPES = { G: ['P-FH', '수입-FH', '동종-FH', 'P-FH(STS)', '외부FH(STS)'], C: ['P-GI', '서림GI', '외부GI', '수입GI', '동종GI', 'P-EG', '외부EG', 'P-CR', '동종AZ', '수입AZ', 'P-MAC', 'P-SUS', '외부SUS', '외부Alu'] };
  const TPL = { G: '도금 소재', C: '컬러 소재' };
  function matPlan(P) {
    let S = null;
    const C = ProcCalc.make(() => ({ D: P, S }));
    S = C.load();
    const J = C.judge(), cls = {}, top = {}, T = {};
    for (const s_ of P.suppliers) { cls[`${s_.plant}:${s_.code}:${s_.sup}`] = s_.cls; const k = `${s_.plant}:${s_.code}`; if (!top[k] || (s_.share || 0) > (top[k].share || 0)) top[k] = s_; }
    const clsOf = (plant, code, sup) => ((P.supTypes || {})[sup] || {})[code] || cls[`${plant}:${code}:${sup}`] || (top[`${plant}:${code}`] || {}).cls || '기타(코드표에 없는 업체)';   // 제조사 코드(발주번호 앞 2자리) × 소재그룹 → 코드조회 소재제조업체의 소재유형
    const get = (plant, c) => (T[c] = T[c] || { plant, ord: {}, inb: {}, use: {} });
    const push = (o, d, e) => (o[d] = o[d] || []).push(e);
    for (const j of J) {                                                 // 생산 투입 = 그 주 소요(첫 사용일~주말에 고르게) × 업체 배정 비중 → 유형별
      if (j.kind === 'pos') continue;
      const el = j.cand.filter(j.specOk), ws = el.reduce((a, x) => a + (+x.share || 0), 0), end = add(j.wk, 6), nd = Math.max(1, diff(end, j.first < j.wk ? j.wk : j.first) + 1);
      for (const x of el) { const t = j.t * (ws > 0 ? (+x.share || 0) / ws : 1 / el.length) / nd; if (t < 0.01) continue; for (let i = 0; i < nd; i++) push(get(j.plant, x.cls || clsOf(j.plant, j.code, x.sup)).use, add(j.first < j.wk ? j.wk : j.first, i), { j, s: x, t, kind: 'use' }); }
    }
    for (const j of J) {
      if (j.kind === 'pos' || j.short < 1) continue;
      for (const x of j.split) {
        if (x.t < 1) continue;
        const R = get(j.plant, x.s.cls || clsOf(j.plant, j.code, x.s.sup)), late = x.dl < today;
        push(R.ord, late ? today : x.dl, { j, x, t: x.t, late });
        push(R.inb, j.needBy < today ? today : j.needBy, { j, x, t: x.t, kind: 'new' });
      }
    }
    for (const a of [...C.autoArr(), ...S.arr.map((a) => ({ ...a, plant: ProcCalc.plantOf(a.code), t: +a.t || 0 }))]) {
      if (a.plant === 'G' && a.code === 'N') continue;                     // 임가공(포스코 지급)
      push(get(a.plant, clsOf(a.plant, a.code, a.sup)).inb, a.date, { a, t: a.t, kind: 'arr' });
    }
    return { T, J, P, codeNm: (c) => (P.matCode || {})[c] || c, supNm: (s_) => (s_ ? ((P.supNames || {})[s_.sup] || s_.name || s_.sup) : '-') };
  }
  const sumT = (L) => (L || []).reduce((x, e) => x + e.t, 0);
  const typeList = () => ['G', 'C'].filter((pl) => UI.inScope(pl)).flatMap((pl) => [...TYPES[pl], ...Object.keys(MP.T).filter((c) => MP.T[c].plant === pl && !TYPES[pl].includes(c))].filter((c) => MP.T[c] && MP.T[c].plant === pl).map((c) => [pl, c]));
  function weekBox() {
    if (!MP) { $('s-mcal').innerHTML = '<p class="small">소재 발주 자료가 없습니다.</p>'; return; }
    const w0 = mondayOf(today), w1 = add(w0, 6);
    const rows = typeList().map(([pl, c]) => { const R = MP.T[c]; let t = 0, late = 0; for (const [d, L] of Object.entries(R.ord)) if (d >= w0 && d <= w1) { t += sumT(L); late += sumT(L.filter((e) => e.late)); } return { pl, c, t, late }; }).filter((r) => r.t >= 1);
    const tot = rows.reduce((x, r) => x + r.t, 0);
    $('s-mcal').innerHTML = `<div class="wkbox"><div class="wkh">이번 주 발주 <small>${md(w0)}~${md(w1)} · 소재 유형별 합계(마감 지난 몫 포함)</small> <b>${n0(tot)}t</b></div>
      <div class="wkl">${rows.map((r) => `<button type="button" class="wkc" data-c="${esc(r.c)}" data-d="${today}"><span>${esc(r.c)}</span><b>${n0(r.t)}t</b>${r.late >= 1 ? `<small class="neg">마감 지남 ${n0(r.late)}t</small>` : ''}</button>`).join('') || '<span class="muted">이번 주 발주할 소재 없음</span>'}</div></div>`;
    $('s-mcal').querySelectorAll('.wkc').forEach((b) => b.onclick = () => typeDetail(b.dataset.c, null, 'ord'));
  }
  const MK = [['ord', '발주', 'm-ord'], ['inb', '입고', 'm-inb'], ['use', '생산 투입', 'm-use']];
  function typeCal(ds, head) {
    if (!MP) { $('s-cal3').innerHTML = ''; return; }
    let h = '', last = '';
    for (const [pl, c] of typeList()) {
      const R = MP.T[c];
      if (!ds.some((d) => MK.some(([k]) => sumT(R[k][d]) >= 0.5))) continue;   // 이 달에 발주·입고·투입이 모두 없는 유형은 숨김
      if (pl !== last) { h += `<tr class="sec" data-dom="${pl}"><td class="lb">${TPL[pl]}</td><td colspan="${ds.length + 1}"></td></tr>`; last = pl; }
      MK.forEach(([k, nm, cl], ri) => {
        let s_ = 0;
        h += `<tr class="mt-r ${cl} ${ri === 0 ? 'first' : ''} ${ri === 2 ? 'last' : ''}"><td class="lb"><span class="tn">${ri === 0 ? esc(c) : ''}</span><span class="kd ${cl}">${nm}</span></td>${ds.map((d, i) => {
          const L = R[k][d] || [], t = sumT(L); s_ += t;
          const mon_ = wd(d) === 1 ? ' wk' : '';
          if (t < 0.5) return `<td class="e${mon_}" style="--ci:${i}"></td>`;
          const late = L.some((e) => e.late), nw = L.some((e) => e.kind === 'new');
          const tip = k === 'ord' ? `${md(d)} ${c} 발주 ${n0(t)}t${late ? ' — 마감 지난 몫 포함' : ''}` : k === 'inb' ? `${md(d)} ${c} 입고 ${n0(t)}t (기발주 ${n0(sumT(L.filter((e) => e.kind === 'arr')))}t · 새 발주분 ${n0(sumT(L.filter((e) => e.kind === 'new')))}t)` : `${md(d)} ${c} 생산 투입 ${n0(t)}t`;
          return `<td data-c="${esc(c)}" data-k="${k}" data-d="${d}" class="v${mon_}${late ? ' late' : ''}${k === 'inb' && nw ? ' nw' : ''}" style="--ci:${i}" title="${esc(tip)}">${n0(t)}</td>`;
        }).join('')}<td class="tot">${s_ >= 0.5 ? n0(s_) : ''}</td></tr>`;
      });
    }
    $('s-cal3').innerHTML = head.replace(/<th data-d="([^"]+)" class="/g, (m, d) => `<th data-d="${d}" class="${wd(d) === 1 ? 'wk ' : ''}`) + '<tbody>' + h + '</tbody>';
    $('s-cal3').querySelectorAll('td[data-c]').forEach((el) => el.onclick = () => typeDetail(el.dataset.c, el.dataset.d, el.dataset.k));
  }
  // 소재 유형 칸 상세: 어떤 소재(코드)를 어느 업체에 얼마 — 언제 들어와 언제 쓰고, 무엇을 만드는지(역으로 생산·용도)
  function typeDetail(c, d, k) {
    const R = MP.T[c]; if (!R) return;
    const w0 = mondayOf(today), inRange = (x) => (d ? x === d : x >= w0 && x <= add(w0, 6));
    const L = Object.entries(R[k]).filter(([x]) => inRange(x)).flatMap(([x, es]) => es.map((e) => ({ d: x, ...e })));
    const when = d ? `${md(d)}(${WD[wd(d)]})` : `이번 주(${md(w0)}~${md(add(w0, 6))})`;
    const useTxt = (j) => j.use.slice().sort((a, b) => b[3] - a[3]).slice(0, 4).map((r) => `${esc(r[0])} ${esc(r[1])} ${esc(r[2])} ${n0(r[3])}t`).join(' · ');
    const rows = L.sort((a, b) => b.t - a.t).map((e) => {
      if (e.kind === 'use') { const j = e.j; return `<tr><td class="l"><b>${esc(MP.codeNm(j.code))}</b></td><td class="l">${esc(MP.supNm(e.s))} <small class="muted">배정 ${Math.round((e.s.share || 0) * 100)}%</small></td><td>${n0(e.t)}</td><td>-</td><td>생산 투입</td><td>-</td><td>${md(j.first)}</td><td class="l small">${useTxt(j)}</td></tr>`; }
      if (e.kind === 'arr') { const a = e.a; return `<tr><td class="l"><b>${esc(MP.codeNm(a.code))}</b></td><td class="l">${esc((MP.P.supNames || {})[a.sup] || a.sup || '-')}</td><td>${n0(e.t)}</td><td>${a.po ? esc(a.po) : '-'}</td><td><span class="pos">입고 예정(기발주)</span></td><td>${md(e.d)}</td><td>-</td><td class="l small">${esc(a.note || '')}</td></tr>`; }
      const j = e.j, x = e.x;
      const st = k === 'ord' ? (e.late ? `<span class="neg">마감 ${md(x.dl)} 지남</span>` : `발주 마감 ${md(x.dl)}`) : (j.needBy < today ? `<span class="neg">입고 필요 ${md(j.needBy)} 지남</span>` : '입고 예정(새 발주분)');
      return `<tr><td class="l"><b>${esc(MP.codeNm(j.code))}</b>${j.thk ? ` <small class="muted">${j.thk[0]}~${j.thk[1]}mm</small>` : ''}</td><td class="l">${esc(MP.supNm(x.s))} <small class="muted">LT ${x.s.lt}일</small></td><td>${n0(e.t)}</td><td>${md(x.dl)}</td><td>${st}</td><td>${md(j.needBy)}</td><td>${md(j.first)}</td><td class="l small">${useTxt(j)}</td></tr>`;
    }).join('');
    $('s-det2').innerHTML = `<div class="dethd m"><span>${esc(c)} ${k === 'ord' ? '발주' : k === 'inb' ? '입고' : '생산 투입'} · ${when} <small>${TPL[R.plant]} — 업체·양·일정과 무엇을 만들려고 쓰는지. 업체·수량을 바꾸려면 <a href="procure.html">소재 발주</a></small></span></div>
      <section class="card wide"><div class="scroll"><table class="t mt"><thead><tr><th class="l">소재</th><th class="l">업체</th><th>톤</th><th>발주 마감</th><th>상태</th><th>입고 필요일</th><th>첫 사용일</th><th class="l">무엇을 만들려고 <small>(그 주 이 소재 전체 용도: 생산 그룹 · 품명 · 톤)</small></th></tr></thead><tbody>${rows || '<tr><td colspan="8">없음</td></tr>'}</tbody>
      <tfoot><tr><td class="l"><b>합계</b></td><td></td><td><b>${n0(sumT(L))}</b></td><td colspan="5"></td></tr></tfoot></table></div>
      <p class="small">발주 마감 = 입고 필요일 − 업체 리드타임(팀 리드타임 표). 입고 필요일 = 첫 사용일 − 투입 여유(컬러 7일 · 도금 5일). 양은 재고·기발주를 먼저 쓰고 모자라는 만큼을 27년 배정 비중대로 나눈 것.</p></section>`;
    $('s-det2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- 캘린더 ----------
  function tabs() {
    $('s-mon').innerHTML = D.months.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === mon}">${+m.slice(5)}월</button>`).join('');
    $('s-mon').querySelectorAll('button').forEach((b) => b.onclick = () => { mon = b.dataset.m; tabs(); cal(); });
  }
  function cal() {
    const ds = D.days.filter((d) => d.slice(0, 7) === mon);
    const head = `<thead><tr><th class="lb">구분</th>${ds.map((d) => `<th data-d="${d}" class="${[0, 6].includes(wd(d)) ? 'we' : ''} ${d === today ? 'today' : ''}">${+d.slice(8)} <span style="font-weight:500;font-size:11px">${WD[wd(d)]}</span></th>`).join('')}<th class="tot">계</th></tr></thead>`;
    const H = { a: '', b: '' }; let tg = 'a', ci = 0;
    const sec = (t, dom) => { H[tg] += `<tr class="sec" data-dom="${dom}"><td class="lb">${t}</td><td colspan="${ds.length + 1}"></td></tr>`; };
    const row = (lb, cell, tot, cls = '') => { let s = 0, h = ''; h += `<tr class="${cls}"><td class="lb">${lb}</td>`; ds.forEach((d, i) => { const c = cell(d); s += c.n || 0; h += `<td data-d="${d}" data-l="${lb}" class="${c.c || ''}" style="--ci:${i}"${c.tip ? ` title="${esc(c.tip)}"` : ''}>${c.x == null ? '' : c.x}</td>`; }); h += `<td class="tot">${tot === false ? '' : n0(tot != null ? tot : s)}</td></tr>`; ci++;  H[tg] += h; };
    sec(D.live && D.live.pl ? `가동 (생산량 — 도금 ~${md(D.live.pl.t0)} 실적·이후 오늘 아침 재계획${D.live.co ? `, 컬러 ~${md(D.live.co)} 실적·이후 확정 계획` : ''})` : '가동 (생산량)', 'G');
    for (const l of ['1CGL', '2CGL']) row(l, (d) => { const x = D.pl[`${l}|${d}`]; if (!x) return { x: '·', c: 'z' }; const mc = /M\/C|재가동/.test(x.ev); return { x: x.t > 0.5 ? n0(x.t) : (mc ? 'M/C' : '·'), n: x.t, c: `f${x.fam} ${mc ? 'mc' : ''}${x.act ? ' act' : ''}`, tip: `${md(d)} ${l} ${x.t > 0.5 ? `${x.fam} ${n0(x.t)}t` : '생산 없음'} ${x.ev}${x.act ? ' (실적)' : ''}` }; });
    for (const l of ['1CCL', '2CCL', '3CCL', '4CCL']) row(l, (d) => { const x = D.co[`${l}|${d}`]; if (!x || x.t < 0.5) return { x: '·', c: 'z' }; return { x: n0(x.t), n: x.t, c: x.act ? 'act' : '', tip: `${md(d)} ${l} ${n0(x.t)}t${x.act ? ' (실적)' : ''} · ${Object.entries(x.g).map(([k, v]) => k + ' ' + n0(v)).join(', ')}` }; }, null, 'sub');
    sec(D.live && D.live.st ? `제품 재고 (기말 — ~${md(D.live.st)} 실제, 이후 매일 롤링)` : '제품 재고 (기말 추정)', 'G');
    for (const g of D.groups) row(UI.grp(g), (d) => { const x = D.sw[`${g}|${d}`]; if (!x) return { x: '' }; return { x: n0(x.v), c: (x.tgt && x.v > x.tgt * 1.3 ? 'hi' : '') + (x.act ? ' act' : ''), tip: `${md(d)} ${UI.grp(g)} 재고 ${n0(x.v)}t${x.act ? '(실제)' : ''} / 목표 ${n0(x.tgt)}t (${Math.round(x.v / x.tgt * 100)}%)` }; }, false, 'sub');
    tg = 'b';
    sec('자가재 재고 (도금 → 컬러 소재, 기말)', 'C');
    for (const a of ['AZ', 'MAC', 'AL']) row(`자가재 ${a}`, (d) => { const x = D.self[`${a}|${d}`]; if (!x) return {}; const nx = useNext(a, d, 3); return { x: n0(x.stock), c: (x.stock < 0 ? 'neg' : nx > 0 && x.stock < nx ? 'lo' : '') + (d >= D.selfEst ? ' est' : ''), tip: `${d >= D.selfEst ? '[추정: 1월 초 컬러 출고 = 12월 일평균] ' : ''}${md(d)} 자가재 ${a}: 도금 입고 +${n0(x.prod)} · 컬러 출고 −${n0(x.use)} → 기말 재고 ${n0(x.stock)}t (향후 3일 소요 ${n0(nx)}t)` }; }, false, 'sub');
    if (PM && PM.length) {
      sec('구매 소재 (기말 예상 재고 — 추가 발주 없음 가정)', 'M');
      for (const m of PM) {
        if (!UI.inScope(m.plant)) continue;
        row(`${m.nm}`, (d) => {
          if (d < today) return { x: '', c: 'nd' };
          const v = m.stock[d], a = m.arr[d] || 0, u = m.use[d] || 0;
          const c = [v < 0 ? 'neg' : v < u * 7 ? 'lo' : '', a > 0.5 ? 'inb2' : '', d === m.dl ? 'dl' : ''].filter(Boolean).join(' ');
          return { x: n0(v), c, tip: `${md(d)} ${PLN[m.plant]} ${m.nm}: 소요 −${n0(u)}${a ? ` · 입고 +${n0(a)}(기발주)` : ''} → 기말 재고 ${n0(v)}t${d === m.dl ? ` · 발주 마감: ${m.sup ? m.sup.name : ''}(리드타임 ${m.sup ? m.sup.lt : '-'}일)` : ''}${m.run && d >= m.run ? ' · 재고 소진(추가 발주 필요)' : ''}` };
        }, false, 'sub');
      }
    }
    $('s-cal').innerHTML = head + '<tbody>' + H.a + '</tbody>';
    $('s-cal2').innerHTML = head + '<tbody>' + H.b + '</tbody>';
    typeCal(ds, head);
    document.querySelectorAll('#s-cal [data-d]').forEach((el) => el.onclick = () => pick(el.dataset.d, 'g'));      // 가동 캘린더 → 생산 상세
    document.querySelectorAll('#s-cal2 [data-d]').forEach((el) => el.onclick = () => pick(el.dataset.d, 'm'));     // 소재 캘린더 → 소재 상세
    for (const [w, t] of [[$('s-calw'), $('s-cal')], [$('s-calw3'), $('s-cal3')], [$('s-calw2'), $('s-cal2')]]) { const th = t.querySelector(`thead th[data-d="${add(today, -2)}"]`); if (th && w.scrollWidth > w.clientWidth) w.scrollLeft = th.getBoundingClientRect().left - t.getBoundingClientRect().left - 140; }
    const sync = (a, b) => a.addEventListener('scroll', () => { if (Math.abs(b.scrollLeft - a.scrollLeft) > 1) b.scrollLeft = a.scrollLeft; });   // 두 달력 가로 스크롤 함께
    if (!cal.synced) { const W3 = [$('s-calw'), $('s-calw3'), $('s-calw2')]; for (const x of W3) for (const y of W3) if (x !== y) sync(x, y); cal.synced = true; }
    charts(ds);
    const pm = PAGE === 'matcal' ? 'm' : 'g';
    if (sel && sel.slice(0, 7) === mon) pick(sel, pm); else pick(ds.includes(today) ? today : ds[0], pm);
  }

  // ---------- 자가재 도우미(도금 생산 → 컬러 투입 연결) ----------
  const span = (L) => { if (!L.length) return '-'; const ds = L.map((x) => x[0]).sort(); const ls = [...new Set(L.map((x) => x[1]))].sort(); return `${md(ds[0])}${ds.length > 1 && ds[ds.length - 1] !== ds[0] ? '~' + md(ds[ds.length - 1]) : ''} ${ls.join('·')}`; };
  const sum3 = (L) => L.reduce((a, x) => a + x[2], 0);
  const flowOf = (due, sec, a) => D.flow.find((f) => f.due === due && f.sec === sec && f.a === a);
  // ---------- 팀 소재 리드타임 표(2026-10-12) → 입고 예정일·발주일 ----------
  // need = 입고 필요일(컬러 생산 − 7일). 고정 일수형은 need 에 맞춰 입고, 달력형(○일 발주 → 차차월 ○일 입고)은 need 이전 가장 늦은 입고일
  const ymd = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  const mondayOf = (s_) => add(s_, -((wd(s_) + 6) % 7));
  const eom = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  function cal2(need, arrDay, ordFrom, ordTo, ok = () => true) {        // 차차월 arrDay 입고, ordFrom~ordTo 일 발주
    let y = +need.slice(0, 4), m = +need.slice(5, 7);
    for (let k = 0; k < 4; k++) {
      const a = ymd(y, m, Math.min(arrDay, eom(y, m)));
      if (a <= need && ok(m)) { const om = m - 2 <= 0 ? m + 10 : m - 2, oy = m - 2 <= 0 ? y - 1 : y; return { arrive: a, ord: ymd(oy, om, ordFrom), ordTo: ymd(oy, om, ordTo) }; }
      m -= 1; if (m === 0) { m = 12; y -= 1; }
    }
    return null;
  }
  function teamRule(code, cust, need) {
    const lg = /엘지|LG/i.test(cust || '');
    const fix = (type, days, weekly) => { const o = add(need, -days); return { type, arrive: need, ord: weekly ? mondayOf(o) : o, rule: `${weekly ? '매주 발주 · ' : ''}+${days % 7 === 0 ? days / 7 + '주' : days + '일'}` }; };
    switch (code) {
      case 'G': return fix('P-GI', 35, true);
      case 'E': return fix('P-EG', 35, true);
      case 'C': return fix('P-CR', 32, true);
      case 'S': return lg ? fix('외부SUS(LG)', 2) : fix('외부SUS', 28);
      case 'L': return fix('외부Alu', 45);
      case 'V': { const r = cal2(need, 20, 10, 15); return r && { type: '동종-AZ', ...r, rule: '10~15일 발주 → 차차월 20일 입고' }; }
      case 'O': { const r = cal2(need, 30, 1, 7, (m) => m % 2 === 0); return r && { type: 'MAC(P) 1.5', ...r, rule: '매월 초 발주 → 차차월 30일(1.5는 짝수달 생산)' }; }
      case 'W': { const r = cal2(need, 30, 1, 7, (m) => m % 2 === 1); return r && { type: 'MAC(P) 3.0', ...r, rule: '매월 초 발주 → 차차월 30일(3.0은 홀수달 생산)' }; }
      default: return null;
    }
  }

  // ---------- 품목 한 줄: 요청 납기 → 생산 → 소재(자가재: 도금 생산·컬러 입고 / 구매: 발주 시한·입고 필요일) → 판정 ----------
  // r = [구분, 품명, 규격/지역, 목적지, 선적, 톤, 분, t/h, 이유, 납기, 기본품명, 자가재비중, [[구역, 강종, 1t당]], 고객]
  function matLine(r, d, l) {
    const M = D.W.mat || {}, IN = (M.inLead || {}).C || 7, TL = M.selfLeadTeam || 8, out = [];
    const sh = r[11] || 0, base = r[10] || r[1];
    if (sh > 0.02) {
      for (const [sec, a, w] of r[12] || []) {
        const f = D.flow.find((x) => x.sec === sec && x.a === a && x.use.some((u) => u[0] === d && u[1] === l));
        const made = f ? f.made.map((m) => m[0]).sort() : [];
        const last = made[made.length - 1];
        const gap = last ? Math.round((new Date(d) - new Date(last)) / 864e5) : null;
        const st = !last ? ['warn', '도금 생산 연결 없음(재고에서)'] : gap >= TL ? ['ok', `여유 (도금 ${gap}일 전)`] : gap >= 1 ? ['warn', `빠듯 (도금 ${gap}일 전, 기준 ${TL}일)`] : ['warn', '재고 선사용 — 도금 생산이 더 늦음'];
        out.push({ kind: '자가재', what: `${a} ${Math.round(w * 100)}%`, src: last ? `도금 ${span(f.made)}` : '-', inb: last ? md(add(last, 1)) + ' 컬러 입고' : '-', ord: '-', st, f, steps: last ? [['도금 생산', span(f.made), made[0]], [add(last, 1) <= today ? '입고 완료' : '입고 예정', md(add(last, 1)), add(last, 1)]] : [['재고에서', '-', null]] });
      }
    }
    if (1 - sh > 0.02) {
      const mix = (M.codeMix || {})[base] || (M.codeMix || {})[String(base).slice(0, 3)] || null;
      const codes = mix ? Object.entries(mix).sort((x, y) => y[1] - x[1]) : [];
      const need = add(d, -IN);
      if (!codes.length) out.push({ kind: '구매', what: `${Math.round((1 - sh) * 100)}% (소재 미확인)`, src: '-', inb: `${md(need)}까지`, ord: '-', st: ['warn', '품명 → 소재 연결 없음'], steps: [[need <= today ? '입고 완료' : '입고 필요', md(need), need]] });
      for (const [code, w] of codes.slice(0, 2)) {
        const nm = (M.matCode || {})[code] || code;
        // 업체 유형별(27년 배정 업체 — P-GI·서림GI·수입GI 등) 발주일: 달력형(동종AZ·P-MAC)은 팀 규칙, 나머지는 입고 필요 − 리드타임
        const sups = MP ? MP.P.suppliers.filter((x) => x.plant === 'C' && x.code === code && (x.share || 0) > 0) : [];
        const byT = {}; for (const x of sups) { const t = (byT[x.cls] = byT[x.cls] || { lt: x.lt, sh: 0, n: [] }); t.sh += x.share || 0; t.n.push(MP.supNm(x)); }
        const tr0 = teamRule(code, r[13], need);
        let TT = Object.entries(byT).sort((x, y) => y[1].sh - x[1].sh).map(([c, t]) => { const cal = /동종|MAC/.test(c) && tr0 ? tr0 : null; return { c, sh: t.sh, n: t.n, ord: cal ? cal.ord : add(need, -t.lt), ordTo: cal ? cal.ordTo : null, arrive: cal ? cal.arrive : need }; });
        if (!TT.length && tr0) TT = [{ c: tr0.type, sh: 1, n: [], ord: tr0.ord, ordTo: tr0.ordTo, arrive: tr0.arrive }];
        const oTxt = (t) => (t.ordTo ? `${md(t.ord)}~${md(t.ordTo)}` : md(t.ord));
        const ordTxt = TT.length ? TT.map((t) => (TT.length > 1 ? `${esc(t.c)} ${oTxt(t)}` : oTxt(t))).join(' · ') : '-';
        const first = TT.length ? TT.map((t) => t.ordTo || t.ord).sort()[0] : null, last = TT.length ? TT.map((t) => t.ordTo || t.ord).sort().pop() : null;
        const st = !TT.length ? ['warn', '팀 리드타임 표에 없는 소재'] : first >= today ? ['ok', `발주 예정 ${md(first)}~`] : last >= today ? ['warn', '일부 업체 발주 시점 지남(기발주 확인)'] : ['info', '발주 시점 지남(기발주 확인)'];
        const arr = TT.length ? TT.map((t) => t.arrive).sort()[0] : need;
        const src = TT.length ? TT.map((t) => `${esc(t.c)} ${Math.round(t.sh * 100)}%${t.n.length ? ` (${esc(t.n.slice(0, 3).join('·'))}${t.n.length > 3 ? ` 외 ${t.n.length - 3}` : ''})` : ''}`).join(' · ') : '-';
        out.push({ kind: '구매', what: `${esc(nm)} ${Math.round((1 - sh) * w * 100)}%`, src, inb: `${md(arr)} 입고 예정`, ord: ordTxt, st, steps: [[last && last < today ? '발주(지난 시점)' : '발주', ordTxt, first], [arr <= today ? '입고 완료' : '입고 예정', md(arr), arr]] });
      }
    }
    return out;
  }

  // ---------- 일정 흐름(칩 → 칩): 지난 날짜 = 완료(회색 ✓), 오늘 생산 = 강조 ----------
  const flowHtml = (steps) => `<div class="flw">${steps.map(([lb, v, dt, cl], i) => `${i ? '<i>›</i>' : ''}<span class="fs ${cl || ''} ${dt && dt < today && !cl ? 'done' : ''}"><small>${esc(lb)}</small><b>${v}</b></span>`).join('')}</div>`;
  // 도금 소재(F/H): 강종 → 소재 코드, 입고 필요 = 생산일 − 투입 여유 5일, 발주 마감 = 입고 필요 − 업체 유형별 리드타임(27년 배정 업체)
  function matG(r, d) {
    const a = r[0] || '', code = /STS/.test(a) ? 'N' : /^AL/.test(a) ? 'H' : 'F', need = add(d, -5);
    if (code === 'N') return { what: '도금용 SUS', steps: [['포스코 지급(임가공)', '-', null]], st: ['info', '발주 대상 아님'] };
    const P = MP && MP.P, nm = P ? (P.matCode || {})[code] || code : code;
    const sups = P ? P.suppliers.filter((x) => x.plant === 'G' && x.code === code && (x.share || 0) > 0) : [];
    const byT = {}; for (const x of sups) { const t = (byT[x.cls] = byT[x.cls] || { lt: x.lt, sh: 0 }); t.sh += x.share || 0; }
    const ords = Object.entries(byT).sort((x, y) => y[1].sh - x[1].sh).map(([c, t]) => `${esc(c)} ${md(add(need, -t.lt))}`).join(' · ') || '-';
    const j = MP && MP.J.find((x) => x.plant === 'G' && x.code === code && x.wk === mondayOf(d));
    const st = !j ? ['info', '-'] : j.short < 1 ? ['ok', '재고·기발주로 충당'] : ['warn', `그 주 부족 ${n0(j.short)}t — 소재 발주에서 확인`];
    return { what: nm, steps: [['발주 마감', ords, null], [need <= today ? '입고 완료' : '입고 필요', md(need), need]], st };
  }

  // ---------- 날짜 상세 ----------
  function pick(d, mode = 'g') {
    sel = d;
    calAll('.sel').forEach((el) => el.classList.remove('sel'));
    document.querySelectorAll(`${mode === 'm' ? '#s-cal2' : '#s-cal'} [data-d="${d}"]`).forEach((el) => el.classList.add('sel'));
    if (mode === 'm') { $('s-det').innerHTML = ''; matDetail(d); return; }
    $('s-det2').innerHTML = '';
    const pcard = (l) => { const x = D.pl[`${l}|${d}`]; if (!x) return ''; return `<section class="card rv wide" data-noexport data-dom="G"><h3>${l} · ${x.t > 0.5 ? `${x.fam} ${n0(x.t)}t` : '생산 없음'} ${x.act ? '<small>(실적)</small>' : ''} ${x.ev ? `<small style="color:#8a5a00">${esc(x.ev)}</small>` : ''}</h3>
      <div class="scroll"><table class="dt mt fl"><thead><tr><th>강종 · 부서</th><th>목적지</th><th class="r">톤</th><th>소재</th><th>일정 (소재 → 생산 → 납기)</th><th>판정</th></tr></thead><tbody>${x.items.map((r) => { const f = r[1] === '자가재' ? flowOf(r[6], r[2], r[0]) : null, m = matG(r, d);
        const steps = [...m.steps, ['도금 생산', md(d), d, 'now'], ...(f ? [['컬러 투입', span(f.use), null]] : [['납기', md(r[6]), r[6]]])];
        return `<tr><td><b>${esc(r[0])}</b> <small>${esc(r[1])}</small></td><td>${esc([r[2], r[3]].filter(Boolean).join(' · '))}</td><td class="r">${n0(r[5])}</td><td>${esc(m.what)}</td><td>${flowHtml(steps)}</td><td class="st ${m.st[0]}">${esc(m.st[1])}</td></tr>`; }).join('') || '<tr><td colspan="6" class="small">생산 없음</td></tr>'}</tbody></table></div>
      ${x.why.length ? `<div class="why">${x.why.map(esc).join('<br>')}</div>` : ''}</section>`; };
    const ccard = (l) => { const x = D.co[`${l}|${d}`]; if (!x || x.t < 0.5) return ''; const fu = D.fUse[`${l}|${d}`] || []; return `<section class="card rv wide" data-noexport data-dom="C"><h3>${l} · ${n0(x.t)}t ${x.act ? '<small>(실적)</small>' : ''}</h3>
      ${fu.length ? `<div class="fin">${fu.map(([f, t]) => `<span>자가재 ${esc(f.a)} ${n0(t)}t ← 도금 ${span(f.made)}</span>`).join('')}</div>` : ''}
      ${x.rows.length ? `<div class="scroll"><table class="dt mt fl"><thead><tr><th>품명 · 구분</th><th>고객·지역</th><th class="r">톤</th><th>소재</th><th>일정 (소재 → 생산 → 납기)</th><th>판정</th></tr></thead><tbody>${x.rows.slice(0, 12).map((r) => { const ML = x.act ? [] : matLine(r, d, l); const n = Math.max(1, ML.length); const due = r[9] ? md(r[9]) : esc(r[4] || '-'); const head_ = (k) => (k ? '' : `<td rowspan="${n}"><b>${esc(r[1])}</b> <small>${esc(r[0] === '주문재' ? '건재 주문재' : r[0])}</small></td><td rowspan="${n}">${esc([r[13] || r[2], r[3]].filter(Boolean).join(' · '))}</td><td class="r" rowspan="${n}">${n0(r[5])}</td>`); return ML.length ? ML.map((m, k) => `<tr class="${k ? 'cont' : ''}"${r[8] ? ` title="배치 사유: ${esc(r[8])}"` : ''}>${head_(k)}<td><small class="kd2 ${m.kind === '자가재' ? 'self' : 'buy'}">${m.kind}</small> ${m.what}${m.src !== '-' && m.kind === '구매' ? `<div class="srcl">${m.src}</div>` : ''}</td><td>${flowHtml([...(m.steps || []), ['컬러 생산', md(d), d, 'now'], ['납기', due, r[9] || null]])}</td><td class="st ${m.st[0]}">${m.st[1]}</td></tr>`).join('') : `<tr>${head_(0)}<td colspan="3" class="small">실적일</td></tr>`; }).join('')}</tbody></table></div>${x.rows.length > 12 ? `<div class="why">외 ${x.rows.length - 12}건</div>` : ''}` : `<div class="why">${Object.entries(x.g).map(([k, v]) => `${esc(k)} ${n0(v)}t`).join(' · ')}</div>`}</section>`; };
    const sc = `<section class="card rv" data-noexport data-dom="C"><h3>자가재 (당일)</h3><table class="dt"><thead><tr><th>강종</th><th class="r">도금 입고</th><th class="r">컬러 출고</th><th class="r">기말 재고</th><th class="r">향후 3일 출고</th></tr></thead><tbody>${['AZ', 'MAC', 'AL'].map((a) => { const x = D.self[`${a}|${d}`] || {}; return `<tr><td>${a}</td><td class="r">${n0(x.prod)}</td><td class="r">${n0(x.use)}</td><td class="r"><b>${n0(x.stock)}</b></td><td class="r">${n0(useNext(a, d, 3))}</td></tr>`; }).join('')}</tbody></table></section>`;
    const mc = PM && PM.length ? `<section class="card rv" data-noexport data-dom="M"><h3>구매 소재 (당일, 추가 발주 없음 가정)</h3><table class="dt"><thead><tr><th>소재</th><th class="r">사용</th><th class="r">입고(기발주)</th><th class="r">재고</th><th>발주 마감</th></tr></thead><tbody>${PM.filter((m) => UI.inScope(m.plant)).slice(0, 10).map((m) => `<tr><td>${esc(m.nm)}</td><td class="r">${d < today ? '-' : n0(m.use[d] || 0)}</td><td class="r">${m.arr[d] ? n0(m.arr[d]) : ''}</td><td class="r">${d < today ? '-' : `<b class="${m.stock[d] < 0 ? 'neg' : ''}">${n0(m.stock[d])}</b>`}</td><td>${m.dl ? md(m.dl) : '-'}</td></tr>`).join('')}</tbody></table><div class="why">자세한 업체 판단·구매 요청은 <a href="procure.html">소재 발주</a></div></section>` : '';
    $('s-det').innerHTML = `<div class="dethd g"><span>${md(d)}(${WD[wd(d)]}) 가동 상세 <small>도금·컬러 라인별 품목 · 납기 · 소재 연결 — 소재 발주·입고는 <a href="matcal.html">소재 캘린더</a>에서</small></span>${foldBtn('s-det')}</div>` + ['1CGL', '2CGL'].map(pcard).join('') + ['1CCL', '2CCL', '3CCL', '4CCL'].map(ccard).join('');
    UI.reveal($('s-det'));
  }


  // ---------- 상세 접기·펼치기(상태는 이 브라우저에 기억, 날짜를 다시 골라도 유지) ----------
  const FKEY = 'cgl-supply-fold';
  let fold = {}; try { fold = JSON.parse(localStorage.getItem(FKEY) || '{}'); } catch (e) { /* 무시 */ }
  const foldBtn = (id) => { $(id).classList.toggle('folded', !!fold[id]); return `<button type="button" class="fold noprint" data-fold="${id}" aria-expanded="${!fold[id]}">${fold[id] ? '펼치기 ▾' : '접기 ▴'}</button>`; };
  ['s-det', 's-det2'].forEach((id) => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-fold]'); if (!b) return;
    fold[id] = !fold[id]; try { localStorage.setItem(FKEY, JSON.stringify(fold)); } catch (x) { /* 무시 */ }
    $(id).classList.toggle('folded', fold[id]); b.textContent = fold[id] ? '펼치기 ▾' : '접기 ▴'; b.setAttribute('aria-expanded', String(!fold[id]));
  }));

  // ---------- 소재 상세(소재 캘린더에서 날짜를 누를 때): 자가재 입출고 · 구매 소재 재고·입고·발주 마감 · 당일 투입 소재 ----------
  function matDetail(d) {
    const M = D.W.mat || {};
    // ① 자가재: 그날 도금 생산(라인) → 언제 컬러에 투입 / 그날 컬러 사용(라인) ← 언제 도금 생산
    const selfRows = ['AZ', 'MAC', 'AL'].map((a) => { const x = D.self[`${a}|${d}`] || {};
      const made = ['1CGL', '2CGL'].flatMap((l) => (D.fMade[`${l}|${d}`] || []).filter(([f]) => f.a === a).map(([f, t]) => `${l} ${n0(t)}t → 컬러 ${span(f.use)}`));
      const used = ['1CCL', '2CCL', '3CCL', '4CCL'].flatMap((l) => (D.fUse[`${l}|${d}`] || []).filter(([f]) => f.a === a).map(([f, t]) => `${l} ${n0(t)}t ← 도금 ${span(f.made)}`));
      return `<tr><td><b>${a}</b></td><td>${n0(x.prod)}</td><td>${n0(x.use)}</td><td class="${x.stock < 0 ? 'neg' : ''}"><b>${n0(x.stock)}</b></td><td>${n0(useNext(a, d, 3))}</td><td class="para">${made.join('<br>') || '-'}</td><td class="para">${used.join('<br>') || '-'}</td></tr>`; }).join('');
    const sc = `<section class="card rv wide" data-noexport><h3>자가재 (도금 → 컬러)</h3><div class="scroll"><table class="dt"><thead><tr><th>강종</th><th>입고 <small>(도금 생산)</small></th><th>출고 <small>(컬러 투입 5일 전)</small></th><th>기말 재고</th><th>향후 3일 출고</th><th>당일 입고분 → 컬러 투입일</th><th>당일 컬러 투입분 ← 도금 생산일</th></tr></thead><tbody>${selfRows}</tbody></table></div></section>`;
    // ② 구매 소재: 전 소재
    const pm = (PM || []).filter((m) => UI.inScope(m.plant)).map((m) => { const past = d < today, v = m.stock[d], u = m.use[d] || 0, a = m.arr[d] || 0;
      const left = !past && m.u28 > 0 ? Math.round(v / m.u28) : null;
      const flags = [a > 0.5 ? `<span class="tag good">입고 ${n0(a)}t</span>` : '', d === m.dl ? '<span class="tag bad">발주 마감</span>' : '', m.run && !past && d >= m.run ? '<span class="tag bad">소진</span>' : ''].filter(Boolean).join(' ');
      return `<tr><td><b>${esc(m.nm)}</b> <small class="muted">${PLN[m.plant]}</small></td><td>${past ? '-' : n0(u)}</td><td>${past ? '-' : `<b class="${v < 0 ? 'neg' : ''}">${n0(v)}</b>`}</td><td>${left != null ? left + '일' : '-'}</td><td>${m.run ? md(m.run) : '없음'}</td><td>${m.dl ? md(m.dl) : '-'}</td><td>${m.sup ? `${esc(m.sup.name)} · ${m.sup.lt}일` : '-'}</td><td>${flags || '-'}</td></tr>`; }).join('');
    const mc = PM && PM.length ? `<section class="card rv wide" data-noexport><h3>구매 소재 <small>${d < today ? '과거 일자 — 예상 재고는 당일부터 표시' : '추가 발주 없음 가정'}</small></h3><div class="scroll"><table class="dt"><thead><tr><th>소재</th><th>당일 사용</th><th>기말 재고</th><th>재고 일수</th><th>소진 예정일</th><th>발주 마감</th><th>기본 업체 · 리드타임</th><th>당일 조치</th></tr></thead><tbody>${pm}</tbody></table></div></section>` : '';
    // ③ 그날 컬러가 쓰는 소재(라인 × 소재): 자가재 = 품명별 강종 비중, 구매 = 품명 → 소재 코드 비중(13주 실적)
    const use = {}, lines = ['1CCL', '2CCL', '3CCL', '4CCL'];
    for (const l of lines) { const x = D.co[`${l}|${d}`]; if (!x) continue;
      for (const r of x.rows || []) { const t = +r[5] || 0, sh = r[11] || 0, base = r[10] || r[1];
        for (const [sec, a, w] of r[12] || []) { const k = `자가재 ${a}`; (use[k] = use[k] || {})[l] = (use[k][l] || 0) + t * w; }
        const mix = (M.codeMix || {})[base] || (M.codeMix || {})[String(base).slice(0, 3)] || null;
        if (1 - sh > 0.02) { if (mix) for (const [c, w] of Object.entries(mix)) { const k = (M.matCode || {})[c] || c; (use[k] = use[k] || {})[l] = (use[k][l] || 0) + t * (1 - sh) * w; } else { (use['소재 미확인'] = use['소재 미확인'] || {})[l] = (use['소재 미확인'][l] || 0) + t * (1 - sh); } } } }
    const keys = Object.keys(use).sort((a, b) => lines.reduce((s_, l) => s_ + (use[b][l] || 0), 0) - lines.reduce((s_, l) => s_ + (use[a][l] || 0), 0)).filter((k) => lines.reduce((s_, l) => s_ + (use[k][l] || 0), 0) >= 0.5);
    const uc = keys.length ? `<section class="card rv wide" data-noexport><h3>당일 컬러 생산 투입 소재 <small>라인별 · 제품 톤 기준(품명별 소재 비중) — 자가재 표의 출고는 투입 5일 전 기준이라 수치가 다름</small></h3><div class="scroll"><table class="dt"><thead><tr><th>소재</th>${lines.map((l) => `<th>${l}</th>`).join('')}<th>합계</th></tr></thead><tbody>${keys.map((k) => `<tr><td><b>${esc(k)}</b></td>${lines.map((l) => `<td>${use[k][l] ? n0(use[k][l]) : ''}</td>`).join('')}<td><b>${n0(lines.reduce((s_, l) => s_ + (use[k][l] || 0), 0))}</b></td></tr>`).join('')}</tbody></table></div></section>` : '';
    $('s-det2').innerHTML = `<div class="dethd m"><span>${md(d)}(${WD[wd(d)]}) 소재 상세 <small>자가재 입출고 · 구매 소재 재고·입고·발주 마감 · 당일 투입 소재 — 라인별 품목은 <a href="supply.html">가동 캘린더</a>에서</small></span>${foldBtn('s-det2')}</div>` + sc + mc + uc;
    UI.reveal($('s-det2'));
    if (matDetail.n++) $('s-det2').scrollIntoView({ behavior: 'smooth', block: 'start' });   // 처음 열 때(오늘 자동 선택)는 스크롤하지 않음
  }
  matDetail.n = 0;

  // ---------- 추이 그래프(달 단위) ----------
  function lineChart(title, series, ds, tgt) {
    const W = 600, H = 190, L = 44, R = 10, T = 14, B = 22, all = series.flatMap((s) => s.v).concat(tgt ? tgt.map((t) => t.v) : []).filter((v) => v != null);
    const sc = UI.scale(Math.max(...all, 1), Math.min(0, ...all)), mx = sc.hi, mn = sc.lo;
    const X = (i) => L + i * (W - L - R) / Math.max(1, ds.length - 1), Y = (v) => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
    let g = '';
    for (const v of sc.ticks) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 4}" y="${Y(v) + 4}" text-anchor="end">${+(v / 1000).toFixed(sc.step < 1000 ? 1 : 0)}k</text>`;
    ds.forEach((d, i) => { if (i % 5 === 0) g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${+d.slice(8)}</text>`; });
    (tgt || []).forEach((t) => { g += `<line x1="${L}" x2="${W - R}" y1="${Y(t.v)}" y2="${Y(t.v)}" stroke="${t.c}" stroke-dasharray="4 3" opacity=".7"/>`; });
    for (const s of series) { const pts = s.v.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean); if (pts.length) g += `<path class="ln" d="M${pts.join(' L')}" fill="none" stroke="${s.c}" stroke-width="2.2" stroke-linejoin="round"/>`; }
    return `<h2>${title}</h2><div class="legend" style="display:flex;gap:12px;font-size:12px;color:var(--ink-2)">${series.map((s) => `<span><i style="display:inline-block;width:10px;height:3px;background:${s.c};margin-right:5px;vertical-align:3px"></i>${s.n}</span>`).join('')}${tgt ? (tgt.length === 1 && tgt[0].v === 0 ? '<span>빨간 점선 = 재고 0</span>' : '<span>점선 = 목표</span>') : ''}</div><svg class="tr cv" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg>`;
  }
  // 주별 발주량(소재 유형별 누적 막대): 이번 주부터 13주 — 구매팀이 주마다 낼 양. 이번 주 막대에는 마감 지난 몫(빗금)이 포함
  function weekOrdChart() {
    const w0 = mondayOf(today), WK = Array.from({ length: 13 }, (_, i) => add(w0, i * 7)), TL = typeList().map((x) => x[1]);
    const COL = ['#1660c9', '#e8590c', '#0a9e8f', '#5b4bb7', '#c46f00', '#c2255c', '#2f9e44', '#7a6a00', '#495057', '#0b7285', '#862e9c', '#a61e4d'];
    const V = WK.map((w) => TL.map((c) => { let t = 0, late = 0; for (const [d, L] of Object.entries(MP.T[c].ord)) if (d >= w && d < add(w, 7)) { t += sumT(L); late += sumT(L.filter((e) => e.late)); } return { c, t, late }; }));
    const used = TL.filter((c, k) => V.some((r) => r[k].t >= 1)), tot = V.map((r) => r.reduce((x, e) => x + e.t, 0));
    const W = 600, H = 210, L = 44, R = 10, T = 14, B = 22, sc = UI.scale(Math.max(...tot, 1), 0), bw = (W - L - R) / WK.length;
    const Y = (v) => T + (H - T - B) * (1 - v / sc.hi);
    let g = '<defs><pattern id="hz" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="#fff" opacity=".55"/></pattern></defs>';
    for (const v of sc.ticks) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 4}" y="${Y(v) + 4}" text-anchor="end">${+(v / 1000).toFixed(sc.step < 1000 ? 1 : 0)}k</text>`;
    WK.forEach((w, i) => {
      let y0 = 0; const x = L + i * bw + bw * 0.15, ww = bw * 0.7;
      V[i].forEach((e) => { if (e.t < 1) return; const k = TL.indexOf(e.c), y1 = y0 + e.t; g += `<rect x="${x.toFixed(1)}" y="${Y(y1).toFixed(1)}" width="${ww.toFixed(1)}" height="${(Y(y0) - Y(y1)).toFixed(1)}" fill="${COL[k % COL.length]}"><title>${md(w)} 주 ${e.c} ${n0(e.t)}t${e.late >= 1 ? ` (마감 지난 몫 ${n0(e.late)}t)` : ''}</title></rect>`; if (e.late >= 1) g += `<rect x="${x.toFixed(1)}" y="${Y(y0 + e.late).toFixed(1)}" width="${ww.toFixed(1)}" height="${(Y(y0) - Y(y0 + e.late)).toFixed(1)}" fill="url(#hz)"/>`; y0 = y1; });
      if (tot[i] >= 1) g += `<text x="${(x + ww / 2).toFixed(1)}" y="${(Y(tot[i]) - 3).toFixed(1)}" text-anchor="middle" style="font-weight:700">${tot[i] >= 1000 ? (tot[i] / 1000).toFixed(1) + 'k' : n0(tot[i])}</text>`;
      g += `<text x="${(x + ww / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${md(w)}</text>`;
    });
    return `<h2>주별 발주량 <small>소재 유형별 · 이번 주부터 13주 · 빗금 = 마감 지난 몫(이번 주에 모음)</small><span class="unit">톤</span></h2><div class="legend" style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--ink-2)">${used.map((c) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COL[TL.indexOf(c) % COL.length]};margin-right:5px;vertical-align:-1px"></i>${esc(c)}</span>`).join('')}</div><svg class="tr cv" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg>`;
  }
  function charts(ds) {
    $('s-ch1').innerHTML = lineChart('자가재 재고 추이 <small>도금 → 컬러 소재, 계획 기준 기말 재고</small>', [['AZ', '#e8590c'], ['MAC', '#0a9e8f'], ['AL', '#1660c9']].map(([a, c]) => ({ n: a, c, v: ds.map((d) => (D.self[`${a}|${d}`] || {}).stock) })), ds);
    $('s-ch2').innerHTML = MP ? weekOrdChart() : '';
  }

  async function render(W, pw) {
    D = prep(W);
    D.live = await live(pw);
    try { const pe = await GP.latest('procure.enc.json'); const P = pe ? await GP.decryptJSON(pe, pw) : null; PM = P ? prepMat(P) : null; MP = P ? matPlan(P) : null; } catch (e) { PM = null; MP = null; }
    mon = D.months.includes(today.slice(0, 7)) ? today.slice(0, 7) : D.months[0];
    const LV = D.live || {};
    $('s-meta').innerHTML = LV.pl ? `도금 <b>매일 재계획</b> ${esc(LV.pl.at)} · 실적 ~${esc(LV.pl.t0)} · 자가재·소재·컬러 이후 = 확정 계획(${esc(String(W.built).slice(0, 10))})` : `기준 <b>확정 계획</b> · 계산 ${esc(String(W.built).replace('T', ' '))} · 실적 ~${esc(W.asOf)}`;
    $('main').hidden = false; $('lock').hidden = true;
    tabs(); weekBox(); cal(); UI.reveal(document);
  }
  let env = null;
  async function open(pw) {
    try { const W = await GP.decryptJSON(env, pw); try { localStorage.setItem(KEY, pw); } catch (e) { /* 무시 */ } await render(W, pw); }
    catch (e) { console.error(e); $('lock').hidden = false; $('msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('f').onsubmit = (e) => { e.preventDefault(); open($('pw').value); };
  GP.latest('integrated.enc.json').then((e) => { if (!e) throw new Error(); env = e; let s = null; try { s = localStorage.getItem(KEY); } catch (x) { /* 무시 */ } if (s) open(s); else $('lock').hidden = false; })
    .catch(() => { $('lock').hidden = false; $('msg').textContent = '자료를 찾을 수 없습니다'; });
})();
