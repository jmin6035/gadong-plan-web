/* 수급 캘린더: published/integrated.enc.json(확정 통합 계획 V1) — 일별 가동·자가재·구매 소재(발주·입고·재고)·제품 재고 + 날짜 상세 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => new Date(d + 'T00:00:00').getDay();
  const add = (d, k) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + k); return x.toLocaleDateString('sv-SE'); };
  const today = new Date().toLocaleDateString('sv-SE');
  const FAM = (a) => (/^AZ/.test(a) ? 'AZ' : /^MAC/.test(a) ? 'MAC' : 'AL');
  const KEY = 'cgl-analysis-pw';
  let D = null, mon = null, sel = null;

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
  const ordSum = (k, d) => (D.ord[k][d] || []).reduce((a, x) => a + x[1], 0);
  const useNext = (a, d, n) => { let s = 0; for (let i = 1; i <= n; i++) { const x = D.self[`${a}|${add(d, i)}`]; if (x) s += x.use; } return s; };

  // ---------- 맨 위: 이번 주 발주 · 알림 ----------
  function top() {
    const w0 = add(today, -((wd(today) + 6) % 7)), w1 = add(w0, 6), n0w = add(w1, 1), n1w = add(n0w, 6);
    const rng = (k, a, b) => Object.entries(D.ord[k]).filter(([d]) => d >= a && d <= b).flatMap(([d, L]) => L.map(([arr, t]) => [d, arr, t]));
    const box = (k, nm, a, b, lbl) => { const L = rng(k, a, b), t = L.reduce((s, x) => s + x[2], 0); const arr = L.map((x) => x[1]).sort(); return `<div class="ob"><div class="t">${lbl} ${nm} 발주</div><div class="v">${n0(t)}<small>t</small></div><div class="s">${L.length ? `입고 ${md(arr[0])}~${md(arr[arr.length - 1])} 분 · 리드타임 ${D.matInfo[k].lt}일` : '발주할 것 없음'}</div></div>`; };
    const A = [];
    for (const a of ['AZ', 'MAC', 'AL']) for (const d of D.days) {
      if (d < today) continue; const x = D.self[`${a}|${d}`]; if (!x) continue;
      if (x.stock < 0) { A.push(['bad', d, `자가재 ${a} 재고 바닥(${n0(x.stock)}t) — 컬러 생산 차질 위험`]); break; }
      const nx = useNext(a, d, 3); if (nx > 0 && x.stock < nx) { A.push(['warn', d, `자가재 ${a} 재고 ${n0(x.stock)}t < 다음 3일 사용 ${n0(nx)}t`]); break; }
    }
    for (const k of ['FH', 'CMAT']) { const tg = D.matInfo[k].target; const d = D.days.find((d) => d >= today && D.mat[`${k}|${d}`] && D.mat[`${k}|${d}`].stock < tg * 0.9); if (d) A.push(['warn', d, `${k === 'FH' ? 'F/H' : '컬러 소재'} 재고 ${n0(D.mat[`${k}|${d}`].stock)}t — 목표 ${n0(tg)}t의 90% 미만`]); }
    for (const g of D.groups) { const w = D.W.weeks.find((w) => w >= add(today, -6) && D.sw[`${g}|${w}`] && D.sw[`${g}|${w}`].tgt && D.sw[`${g}|${w}`].v > D.sw[`${g}|${w}`].tgt * 1.3); if (w) A.push(['bad', w, `${g} 제품 재고 ${n0(D.sw[`${g}|${w}`].v)}t — 목표 ${n0(D.sw[`${g}|${w}`].tgt)}t의 ${Math.round(D.sw[`${g}|${w}`].v / D.sw[`${g}|${w}`].tgt * 100)}%`]); }
    A.sort((a, b) => (a[1] < b[1] ? -1 : 1));
    $('s-top').innerHTML = `<h2>이번 주 · 다음 주 소재 발주 <small>필요 입고일에서 리드타임만큼 거꾸로 계산</small><span class="unit">톤</span></h2>
      <div class="order">${box('FH', 'F/H(도금 소재)', w0, w1, `이번 주(${md(w0)}~${md(w1)})`)}${box('CMAT', '컬러 구매 소재', w0, w1, '이번 주')}${box('FH', 'F/H(도금 소재)', n0w, n1w, `다음 주(${md(n0w)}~${md(n1w)})`)}${box('CMAT', '컬러 구매 소재', n0w, n1w, '다음 주')}</div>
      <div class="alerts">${A.map(([l, d, t]) => `<div class="al ${l}" data-d="${d}"><i></i><b>${md(d)}(${WD[wd(d)]})</b><span>${esc(t)}</span></div>`).join('') || '<p class="small" style="margin:6px 0 0">앞으로 기준을 넘는 위험 없음</p>'}</div>`;
    $('s-top').querySelectorAll('.al').forEach((el) => el.onclick = () => { const d = el.dataset.d; if (d.slice(0, 7) !== mon) { mon = d.slice(0, 7); tabs(); cal(); } pick(d); });
  }

  // ---------- 캘린더 ----------
  function tabs() {
    $('s-mon').innerHTML = D.months.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === mon}">${+m.slice(5)}월</button>`).join('');
    $('s-mon').querySelectorAll('button').forEach((b) => b.onclick = () => { mon = b.dataset.m; tabs(); cal(); });
  }
  function cal() {
    const ds = D.days.filter((d) => d.slice(0, 7) === mon);
    const head = `<thead><tr><th class="lb">구분</th>${ds.map((d) => `<th data-d="${d}" class="${[0, 6].includes(wd(d)) ? 'we' : ''} ${d === today ? 'today' : ''}">${+d.slice(8)}<br><span style="font-weight:500;font-size:11px">${WD[wd(d)]}</span></th>`).join('')}<th class="tot">계</th></tr></thead>`;
    let h = '', ci = 0;
    const sec = (t, dom) => { h += `<tr class="sec" data-dom="${dom}"><td class="lb">${t}</td><td colspan="${ds.length + 1}"></td></tr>`; };
    const row = (lb, cell, tot, cls = '') => { let s = 0; h += `<tr class="${cls}"><td class="lb">${lb}</td>`; ds.forEach((d, i) => { const c = cell(d); s += c.n || 0; h += `<td data-d="${d}" data-l="${lb}" class="${c.c || ''}" style="--ci:${i}"${c.tip ? ` title="${esc(c.tip)}"` : ''}>${c.x == null ? '' : c.x}</td>`; }); h += `<td class="tot">${tot === false ? '' : n0(tot != null ? tot : s)}</td></tr>`; ci++; };
    sec('가동 (생산량)', 'G');
    for (const l of ['1CGL', '2CGL']) row(l, (d) => { const x = D.pl[`${l}|${d}`]; if (!x) return { x: '·', c: 'z' }; const mc = /M\/C|재가동/.test(x.ev); return { x: x.t > 0.5 ? n0(x.t) : (mc ? 'M/C' : '·'), n: x.t, c: `f${x.fam} ${mc ? 'mc' : ''}`, tip: `${md(d)} ${l} ${x.fam} ${n0(x.t)}t ${x.ev}` }; });
    for (const l of ['1CCL', '2CCL', '3CCL', '4CCL']) row(l, (d) => { const x = D.co[`${l}|${d}`]; if (!x || x.t < 0.5) return { x: '·', c: 'z' }; return { x: n0(x.t), n: x.t, c: x.act ? 'act' : '', tip: `${md(d)} ${l} ${n0(x.t)}t${x.act ? ' (실적)' : ''} · ${Object.entries(x.g).map(([k, v]) => k + ' ' + n0(v)).join(', ')}` }; }, null, 'sub');
    sec('자가재 재고 (도금 → 컬러 소재, 그날 끝)', 'C');
    for (const a of ['AZ', 'MAC', 'AL']) row(`자가재 ${a}`, (d) => { const x = D.self[`${a}|${d}`]; if (!x) return {}; const nx = useNext(a, d, 3); return { x: n0(x.stock), c: (x.stock < 0 ? 'neg' : nx > 0 && x.stock < nx ? 'lo' : '') + (d >= D.selfEst ? ' est' : ''), tip: `${d >= D.selfEst ? '[추정: 1월 초 컬러 사용 = 12월 하루 평균] ' : ''}${md(d)} 자가재 ${a}: 도금 생산 +${n0(x.prod)} · 컬러 사용 −${n0(x.use)} → 재고 ${n0(x.stock)}t (다음 3일 사용 ${n0(nx)}t)` }; }, false, 'sub');
    sec('구매 소재 (발주 → 입고 → 재고)', 'M');
    for (const [k, nm] of [['FH', 'F/H(도금)'], ['CMAT', '컬러 소재']]) {
      const tg = D.matInfo[k].target;
      row(`${nm} 재고`, (d) => { const x = D.mat[`${k}|${d}`]; if (!x) return {}; return { x: n0(x.stock), c: x.stock < tg * 0.9 ? 'lo' : '', tip: `${md(d)} ${nm}: 사용 −${n0(x.use)} · 입고 +${n0(x.inb)} → 재고 ${n0(x.stock)}t (목표 ${n0(tg)}t)` }; }, false, 'sub');
      row(`${nm} 입고`, (d) => { const x = D.mat[`${k}|${d}`]; return x && x.inb > 0.5 ? { x: n0(x.inb), n: x.inb, c: 'inb', tip: `${md(d)} 입고 필요 ${n0(x.inb)}t — 발주 ${x.od ? md(x.od) : '-'}` } : { x: '', n: 0 }; }, null, 'sub');
      row(`${nm} 발주`, (d) => { const t = ordSum(k, d); return t > 0.5 ? { x: n0(t), n: t, c: 'ord' + (D.est[`${k}|${d}`] ? ' est' : ''), tip: `${D.est[`${k}|${d}`] ? '[추정: 1월 이후 사용 = 4분기 하루 평균] ' : ''}${md(d)} 발주해야 할 양 ${n0(t)}t → 입고 ${(D.ord[k][d] || []).map((x) => md(x[0])).join(', ')}` } : { x: '', n: 0 }; }, null, 'sub');
    }
    sec('제품 재고 (그날 끝, 추정)', 'G');
    for (const g of D.groups) row(g, (d) => { const x = D.sw[`${g}|${d}`]; if (!x) return { x: '' }; return { x: n0(x.v), c: x.tgt && x.v > x.tgt * 1.3 ? 'hi' : '', tip: `${md(d)} ${g} 재고 ${n0(x.v)}t / 목표 ${n0(x.tgt)}t (${Math.round(x.v / x.tgt * 100)}%)` }; }, false, 'sub');
    $('s-cal').innerHTML = head + '<tbody>' + h + '</tbody>';
    $('s-cal').querySelectorAll('[data-d]').forEach((el) => el.onclick = () => pick(el.dataset.d));
    const w = $('s-calw'), th = $('s-cal').querySelector(`thead th[data-d="${add(today, -2)}"]`);
    if (th && w.scrollWidth > w.clientWidth) w.scrollLeft = th.getBoundingClientRect().left - $('s-cal').getBoundingClientRect().left - 140;
    charts(ds); flows();
    if (sel && sel.slice(0, 7) === mon) pick(sel); else pick(ds.includes(today) ? today : ds[0]);
  }

  // ---------- 자가재 흐름: 도금 생산 → 컬러 투입 ----------
  const span = (L) => { if (!L.length) return '-'; const ds = L.map((x) => x[0]).sort(); const ls = [...new Set(L.map((x) => x[1]))].sort(); return `${md(ds[0])}${ds.length > 1 && ds[ds.length - 1] !== ds[0] ? '~' + md(ds[ds.length - 1]) : ''} ${ls.join('·')}`; };
  const sum3 = (L) => L.reduce((a, x) => a + x[2], 0);
  const flowOf = (due, sec, a) => D.flow.find((f) => f.due === due && f.sec === sec && f.a === a);
  function hiFlow(f) {
    $('s-cal').querySelectorAll('.fm,.fu').forEach((el) => el.classList.remove('fm', 'fu'));
    $('s-flow').querySelectorAll('tr.on').forEach((el) => el.classList.remove('on'));
    if (!f) return;
    for (const [d, l] of f.made) { const el = $('s-cal').querySelector(`td[data-d="${d}"][data-l="${l}"]`); if (el) el.classList.add('fm'); }
    for (const [d, l] of f.use) { const el = $('s-cal').querySelector(`td[data-d="${d}"][data-l="${l}"]`); if (el) el.classList.add('fu'); }
    const tr = $('s-flow').querySelector(`tr[data-f="${f.i}"]`); if (tr) tr.classList.add('on');
  }
  function flows() {
    const L = D.flow.filter((f) => f.due.slice(0, 7) === mon);
    const half = (due) => { const k = +due.slice(8); return k <= 10 ? '상순' : k <= 20 ? '중순' : '하순'; };
    $('s-flow').innerHTML = `<h2>자가재 흐름 <small>도금이 반순별로 만든 자가재를 컬러가 언제·어느 라인에서 쓰는지. 줄을 누르면 위 달력에 <b style="color:#5b4bb7">도금 생산</b>·<b style="color:#0a7d71">컬러 투입</b> 칸이 표시됨</small><span class="unit">톤</span></h2>
      <div style="overflow-x:auto"><table class="dt fl"><thead><tr><th>반순</th><th>컬러 구역</th><th>강종</th><th>도금 생산 (날짜 · 라인)</th><th class="r">도금 톤</th><th>컬러 투입 (날짜 · 라인)</th><th class="r">컬러 톤</th><th class="r">재고에서</th></tr></thead><tbody>
      ${L.map((f) => { const m = sum3(f.made), u = sum3(f.use); const mLast = f.made.map((x) => x[0]).sort().pop() || '', uFirst = f.use.map((x) => x[0]).sort()[0] || ''; const pre = mLast && uFirst && add(mLast, 5) > uFirst; return `<tr data-f="${f.i}"><td>${+f.due.slice(5, 7)}월 ${half(f.due)}</td><td>${esc(f.sec)}</td><td>${esc(f.a)}</td><td>${span(f.made)}${pre ? ' <span class="pre" title="컬러 투입(필요일 = 투입 − 5일)이 도금 생산보다 먼저라, 컬러가 기존 자가재 재고를 먼저 쓰고 이 도금 생산분이 재고를 다시 채움">재고 선사용</span>' : ''}</td><td class="r">${n0(m)}</td><td>${span(f.use)}</td><td class="r">${n0(u)}</td><td class="r">${u - m > 0.5 ? n0(u - m) : '-'}</td></tr>`; }).join('') || '<tr><td colspan="8" class="small">이 달 자가재 품목 없음</td></tr>'}</tbody></table></div>
      <div class="why">컬러 투입 = 그 반순 안에 소재가 필요한 컬러 생산(필요일 = 컬러 생산일 − 5일). 도금 톤이 컬러 톤보다 작으면 차이는 이미 있는 자가재 재고에서 씀. '재고 선사용' = 컬러가 재고를 먼저 쓰고 도금 생산분이 나중에 채우는 줄(재고가 바닥나지 않는지는 위 자가재 재고 줄에서 확인). 다음 반순 투입분을 미리 만들어 두는 양(목표 재고)도 도금 톤에 포함.</div>`;
    $('s-flow').querySelectorAll('tr[data-f]').forEach((tr) => tr.onclick = () => { const f = D.flow[+tr.dataset.f]; hiFlow(f); const d0 = (f.made[0] || f.use[0] || [])[0]; if (d0 && d0.slice(0, 7) === mon) pick(d0); hiFlow(f); $('s-calw').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  }

  // ---------- 날짜 상세 ----------
  function pick(d) {
    sel = d;
    $('s-cal').querySelectorAll('.sel').forEach((el) => el.classList.remove('sel'));
    $('s-cal').querySelectorAll(`[data-d="${d}"]`).forEach((el) => el.classList.add('sel'));
    const pcard = (l) => { const x = D.pl[`${l}|${d}`]; if (!x) return ''; return `<section class="card rv" data-noexport data-dom="G"><h3>${l} · ${x.fam} ${n0(x.t)}t ${x.ev ? `<small style="color:#8a5a00">${esc(x.ev)}</small>` : ''}</h3>
      <table class="dt"><thead><tr><th>강종</th><th>부서</th><th>목적지</th><th class="r">톤</th><th>납기</th></tr></thead><tbody>${x.items.map((r) => { const f = r[1] === '자가재' ? flowOf(r[6], r[2], r[0]) : null; return `<tr${f ? ` class="fl-r" data-f="${f.i}"` : ''}><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc([r[2], r[3]].filter(Boolean).join(' · '))}${f ? `<div class="fto">→ 컬러 투입 ${span(f.use)}</div>` : ''}</td><td class="r">${n0(r[5])}</td><td>${md(r[6])}</td></tr>`; }).join('') || '<tr><td colspan="5" class="small">생산 없음</td></tr>'}</tbody></table>
      ${x.why.length ? `<div class="why">${x.why.map(esc).join('<br>')}</div>` : ''}</section>`; };
    const ccard = (l) => { const x = D.co[`${l}|${d}`]; if (!x || x.t < 0.5) return ''; const fu = D.fUse[`${l}|${d}`] || []; return `<section class="card rv" data-noexport data-dom="C"><h3>${l} · ${n0(x.t)}t ${x.act ? '<small>(실적)</small>' : ''}</h3>
      ${fu.length ? `<div class="fin">${fu.map(([f, t]) => `<span class="fl-r" data-f="${f.i}">자가재 ${esc(f.a)} ${n0(t)}t ← 도금 ${span(f.made)}</span>`).join('')}</div>` : ''}
      ${x.rows.length ? `<table class="dt"><thead><tr><th>구분</th><th>품명</th><th>고객·지역</th><th class="r">톤</th></tr></thead><tbody>${x.rows.slice(0, 12).map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc([r[2], r[3]].filter(Boolean).join(' · '))}</td><td class="r">${n0(r[5])}</td></tr>`).join('')}</tbody></table>${x.rows.length > 12 ? `<div class="why">외 ${x.rows.length - 12}건</div>` : ''}` : `<div class="why">${Object.entries(x.g).map(([k, v]) => `${esc(k)} ${n0(v)}t`).join(' · ')}</div>`}</section>`; };
    const sc = `<section class="card rv" data-noexport data-dom="C"><h3>자가재 (그날)</h3><table class="dt"><thead><tr><th>강종</th><th class="r">도금 생산</th><th class="r">컬러 사용</th><th class="r">재고</th><th class="r">다음 3일 사용</th></tr></thead><tbody>${['AZ', 'MAC', 'AL'].map((a) => { const x = D.self[`${a}|${d}`] || {}; return `<tr><td>${a}</td><td class="r">${n0(x.prod)}</td><td class="r">${n0(x.use)}</td><td class="r"><b>${n0(x.stock)}</b></td><td class="r">${n0(useNext(a, d, 3))}</td></tr>`; }).join('')}</tbody></table></section>`;
    const mc = `<section class="card rv" data-noexport data-dom="M"><h3>구매 소재 (그날)</h3><table class="dt"><thead><tr><th>소재</th><th class="r">사용</th><th class="r">입고</th><th class="r">재고</th><th>이 입고의 발주일</th></tr></thead><tbody>${[['FH', 'F/H(도금)'], ['CMAT', '컬러 소재']].map(([k, nm]) => { const x = D.mat[`${k}|${d}`] || {}; return `<tr><td>${nm}</td><td class="r">${n0(x.use)}</td><td class="r">${n0(x.inb)}</td><td class="r"><b>${n0(x.stock)}</b></td><td>${x.od ? md(x.od) : '-'}</td></tr>`; }).join('')}</tbody></table>
      ${['FH', 'CMAT'].map((k) => (D.ord[k][d] || []).length ? `<div class="why"><b>이 날 ${k === 'FH' ? 'F/H' : '컬러 소재'} 발주 ${n0(ordSum(k, d))}t</b> → 입고 ${(D.ord[k][d]).map((x) => `${md(x[0])} ${n0(x[1])}t`).join(', ')}</div>` : '').join('')}</section>`;
    $('s-det').innerHTML = `<div style="grid-column:1/-1;font-size:15px;font-weight:800;margin-top:6px">${md(d)}(${WD[wd(d)]}) 상세</div>` + ['1CGL', '2CGL'].map(pcard).join('') + ['1CCL', '2CCL', '3CCL', '4CCL'].map(ccard).join('') + sc + mc;
    UI.reveal($('s-det'));
    $('s-det').querySelectorAll('.fl-r').forEach((el) => el.onclick = () => hiFlow(D.flow[+el.dataset.f]));
  }

  // ---------- 추이 그래프(달 단위) ----------
  function lineChart(title, series, ds, tgt) {
    const W = 600, H = 190, L = 44, R = 10, T = 14, B = 22, all = series.flatMap((s) => s.v).concat(tgt ? tgt.map((t) => t.v) : []).filter((v) => v != null);
    const sc = UI.scale(Math.max(...all, 1), Math.min(0, ...all)), mx = sc.hi, mn = sc.lo;
    const X = (i) => L + i * (W - L - R) / Math.max(1, ds.length - 1), Y = (v) => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
    let g = '';
    for (const v of sc.ticks) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 4}" y="${Y(v) + 4}" text-anchor="end">${+(v / 1000).toFixed(sc.step < 1000 ? 1 : 0)}k</text>`;
    ds.forEach((d, i) => { if (i % 5 === 0) g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${+d.slice(8)}</text>`; });
    (tgt || []).forEach((t) => { g += `<line x1="${L}" x2="${W - R}" y1="${Y(t.v)}" y2="${Y(t.v)}" stroke="${t.c}" stroke-dasharray="4 3" opacity=".7"/>`; });
    for (const s of series) g += `<path d="M${s.v.map((v, i) => `${X(i).toFixed(1)},${Y(v || 0).toFixed(1)}`).join(' L')}" fill="none" stroke="${s.c}" stroke-width="2.2" stroke-linejoin="round"/>`;
    return `<h2>${title}</h2><div class="legend" style="display:flex;gap:12px;font-size:12px;color:var(--ink-2)">${series.map((s) => `<span><i style="display:inline-block;width:10px;height:3px;background:${s.c};margin-right:5px;vertical-align:3px"></i>${s.n}</span>`).join('')}${tgt ? '<span>점선 = 목표</span>' : ''}</div><svg class="tr cv" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg>`;
  }
  function charts(ds) {
    $('s-ch1').innerHTML = lineChart('자가재 재고 추이', [['AZ', '#e8590c'], ['MAC', '#0a9e8f'], ['AL', '#1660c9']].map(([a, c]) => ({ n: a, c, v: ds.map((d) => (D.self[`${a}|${d}`] || {}).stock) })), ds);
    $('s-ch2').innerHTML = lineChart('구매 소재 재고 추이', [['FH', 'F/H(도금)', '#5b4bb7'], ['CMAT', '컬러 소재', '#c46f00']].map(([k, n, c]) => ({ n, c, v: ds.map((d) => (D.mat[`${k}|${d}`] || {}).stock) })), ds, [{ v: D.matInfo.FH.target, c: '#5b4bb7' }, { v: D.matInfo.CMAT.target, c: '#c46f00' }]);
  }

  function render(W) {
    D = prep(W);
    mon = D.months.includes(today.slice(0, 7)) ? today.slice(0, 7) : D.months[0];
    $('s-meta').innerHTML = `기준 <b>확정 ${esc(W.rec)}</b> · 계산 ${esc(String(W.built).replace('T', ' '))} · 실적 ~${esc(W.asOf)}`;
    $('main').hidden = false; $('lock').hidden = true;
    tabs(); top(); cal(); UI.reveal(document);
  }
  let env = null;
  async function open(pw) {
    try { const W = await GP.decryptJSON(env, pw); try { localStorage.setItem(KEY, pw); } catch (e) { /* 무시 */ } render(W); }
    catch (e) { $('lock').hidden = false; $('msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('f').onsubmit = (e) => { e.preventDefault(); open($('pw').value); };
  GP.latest('integrated.enc.json').then((e) => { if (!e) throw new Error(); env = e; let s = null; try { s = localStorage.getItem(KEY); } catch (x) { /* 무시 */ } if (s) open(s); else $('lock').hidden = false; })
    .catch(() => { $('lock').hidden = false; $('msg').textContent = '자료를 찾을 수 없습니다'; });
})();
