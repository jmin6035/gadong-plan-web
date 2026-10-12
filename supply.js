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
  const calAll = (sel = '[data-d]') => document.querySelectorAll(`#s-cal ${sel}, #s-cal2 ${sel}`);
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
    for (const g of D.groups) { const w = D.W.weeks.find((w) => w >= add(today, -6) && D.sw[`${g}|${w}`] && D.sw[`${g}|${w}`].tgt && D.sw[`${g}|${w}`].v > D.sw[`${g}|${w}`].tgt * 1.3); if (w) A.push(['bad', w, `${g} 제품 재고 ${n0(D.sw[`${g}|${w}`].v)}t — 목표 ${n0(D.sw[`${g}|${w}`].tgt)}t의 ${Math.round(D.sw[`${g}|${w}`].v / D.sw[`${g}|${w}`].tgt * 100)}%`]); }
    A.sort((a, b) => (a[1] < b[1] ? -1 : 1));
    $('s-top').innerHTML = `<h2>앞으로 볼 위험 <small>자가재 재고 부족 · 제품 재고 목표 초과 — 누르면 그 날짜로</small></h2>
      <div class="alerts">${A.map(([l, d, t]) => `<div class="al ${l}" data-d="${d}"><i></i><b>${md(d)}(${WD[wd(d)]})</b><span>${esc(t)}</span></div>`).join('') || '<p class="small" style="margin:6px 0 0">앞으로 기준을 넘는 위험 없음</p>'}</div>
      <p class="small" style="margin:10px 0 0">구매 소재(F/H · 컬러 소재)의 발주 마감과 입고 필요일은 <a href="procure.html"><b>소재 발주</b></a> 캘린더에서 봅니다.</p>`;
    $('s-top').querySelectorAll('.al').forEach((el) => el.onclick = () => { const d = el.dataset.d; if (d.slice(0, 7) !== mon) { mon = d.slice(0, 7); tabs(); cal(); } pick(d); });
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
    sec('가동 (생산량)', 'G');
    for (const l of ['1CGL', '2CGL']) row(l, (d) => { const x = D.pl[`${l}|${d}`]; if (!x) return { x: '·', c: 'z' }; const mc = /M\/C|재가동/.test(x.ev); return { x: x.t > 0.5 ? n0(x.t) : (mc ? 'M/C' : '·'), n: x.t, c: `f${x.fam} ${mc ? 'mc' : ''}`, tip: `${md(d)} ${l} ${x.fam} ${n0(x.t)}t ${x.ev}` }; });
    for (const l of ['1CCL', '2CCL', '3CCL', '4CCL']) row(l, (d) => { const x = D.co[`${l}|${d}`]; if (!x || x.t < 0.5) return { x: '·', c: 'z' }; return { x: n0(x.t), n: x.t, c: x.act ? 'act' : '', tip: `${md(d)} ${l} ${n0(x.t)}t${x.act ? ' (실적)' : ''} · ${Object.entries(x.g).map(([k, v]) => k + ' ' + n0(v)).join(', ')}` }; }, null, 'sub');
    sec('제품 재고 (그날 끝, 추정)', 'G');
    for (const g of D.groups) row(g, (d) => { const x = D.sw[`${g}|${d}`]; if (!x) return { x: '' }; return { x: n0(x.v), c: x.tgt && x.v > x.tgt * 1.3 ? 'hi' : '', tip: `${md(d)} ${g} 재고 ${n0(x.v)}t / 목표 ${n0(x.tgt)}t (${Math.round(x.v / x.tgt * 100)}%)` }; }, false, 'sub');
    tg = 'b';
    sec('자가재 재고 (도금 → 컬러 소재, 그날 끝)', 'C');
    for (const a of ['AZ', 'MAC', 'AL']) row(`자가재 ${a}`, (d) => { const x = D.self[`${a}|${d}`]; if (!x) return {}; const nx = useNext(a, d, 3); return { x: n0(x.stock), c: (x.stock < 0 ? 'neg' : nx > 0 && x.stock < nx ? 'lo' : '') + (d >= D.selfEst ? ' est' : ''), tip: `${d >= D.selfEst ? '[추정: 1월 초 컬러 사용 = 12월 하루 평균] ' : ''}${md(d)} 자가재 ${a}: 도금 생산 +${n0(x.prod)} · 컬러 사용 −${n0(x.use)} → 재고 ${n0(x.stock)}t (다음 3일 사용 ${n0(nx)}t)` }; }, false, 'sub');
    $('s-cal').innerHTML = head + '<tbody>' + H.a + '</tbody>';
    $('s-cal2').innerHTML = head + '<tbody>' + H.b + '</tbody>';
    calAll().forEach((el) => el.onclick = () => pick(el.dataset.d));
    for (const [w, t] of [[$('s-calw'), $('s-cal')], [$('s-calw2'), $('s-cal2')]]) { const th = t.querySelector(`thead th[data-d="${add(today, -2)}"]`); if (th && w.scrollWidth > w.clientWidth) w.scrollLeft = th.getBoundingClientRect().left - t.getBoundingClientRect().left - 140; }
    const sync = (a, b) => a.addEventListener('scroll', () => { if (Math.abs(b.scrollLeft - a.scrollLeft) > 1) b.scrollLeft = a.scrollLeft; });   // 두 달력 가로 스크롤 함께
    if (!cal.synced) { sync($('s-calw'), $('s-calw2')); sync($('s-calw2'), $('s-calw')); cal.synced = true; }
    charts(ds);
    if (sel && sel.slice(0, 7) === mon) pick(sel); else pick(ds.includes(today) ? today : ds[0]);
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
        const st = !last ? ['warn', '도금 생산 연결 없음(재고에서)'] : gap >= TL ? ['ok', `여유 — 도금 생산 ${gap}일 전`] : gap >= 1 ? ['warn', `빠듯 — 도금 생산 ${gap}일 전(팀 기준 ${TL}일)`] : ['warn', '재고 선사용 — 도금 생산이 더 늦음'];
        out.push({ kind: '자가재', what: `${a} ${Math.round(w * 100)}%`, src: last ? `도금 ${span(f.made)}` : '-', inb: last ? md(add(last, 1)) + ' 컬러 입고' : '-', ord: '-', st, f });
      }
    }
    if (1 - sh > 0.02) {
      const mix = (M.codeMix || {})[base] || (M.codeMix || {})[String(base).slice(0, 3)] || null;
      const codes = mix ? Object.entries(mix).sort((x, y) => y[1] - x[1]) : [];
      const need = add(d, -IN);
      if (!codes.length) out.push({ kind: '구매', what: `${Math.round((1 - sh) * 100)}% (소재 미확인)`, src: '-', inb: `${md(need)}까지`, ord: '-', st: ['warn', '품명 → 소재 연결 없음'] });
      for (const [code, w] of codes.slice(0, 2)) {
        const nm = (M.matCode || {})[code] || code, tr = teamRule(code, r[13], need);
        const ordTxt = tr ? (tr.ordTo ? `${md(tr.ord)}~${md(tr.ordTo)}` : md(tr.ord)) : '-';
        const st = !tr ? ['warn', '팀 리드타임 표에 없는 소재'] : (tr.ordTo || tr.ord) >= today ? ['ok', `발주 예정 ${ordTxt}`] : ['info', `${ordTxt} 발주분(이미 발주됐어야 할 시점) — 부족 여부는 조달 판단`];
        out.push({ kind: '구매', what: `${esc(nm)} ${Math.round((1 - sh) * w * 100)}%`, src: tr ? `${esc(tr.type)} · ${esc(tr.rule)}` : '-', inb: tr ? `${md(tr.arrive)} 입고 예정` : `${md(need)}까지`, ord: ordTxt, st });
      }
    }
    return out;
  }

  // ---------- 날짜 상세 ----------
  function pick(d) {
    sel = d;
    calAll('.sel').forEach((el) => el.classList.remove('sel'));
    calAll(`[data-d="${d}"]`).forEach((el) => el.classList.add('sel'));
    const pcard = (l) => { const x = D.pl[`${l}|${d}`]; if (!x) return ''; return `<section class="card rv" data-noexport data-dom="G"><h3>${l} · ${x.fam} ${n0(x.t)}t ${x.ev ? `<small style="color:#8a5a00">${esc(x.ev)}</small>` : ''}</h3>
      <table class="dt"><thead><tr><th>강종</th><th>부서</th><th>목적지</th><th class="r">톤</th><th>납기</th></tr></thead><tbody>${x.items.map((r) => { const f = r[1] === '자가재' ? flowOf(r[6], r[2], r[0]) : null; return `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc([r[2], r[3]].filter(Boolean).join(' · '))}${f ? `<div class="fto">→ 컬러 투입 ${span(f.use)}</div>` : ''}</td><td class="r">${n0(r[5])}</td><td>${md(r[6])}</td></tr>`; }).join('') || '<tr><td colspan="5" class="small">생산 없음</td></tr>'}</tbody></table>
      ${x.why.length ? `<div class="why">${x.why.map(esc).join('<br>')}</div>` : ''}</section>`; };
    const ccard = (l) => { const x = D.co[`${l}|${d}`]; if (!x || x.t < 0.5) return ''; const fu = D.fUse[`${l}|${d}`] || []; return `<section class="card rv wide" data-noexport data-dom="C"><h3>${l} · ${n0(x.t)}t ${x.act ? '<small>(실적)</small>' : ''}</h3>
      ${fu.length ? `<div class="fin">${fu.map(([f, t]) => `<span>자가재 ${esc(f.a)} ${n0(t)}t ← 도금 ${span(f.made)}</span>`).join('')}</div>` : ''}
      ${x.rows.length ? `<table class="dt mt"><thead><tr><th>구분 · 품명</th><th>고객·지역</th><th class="r">톤</th><th>요청 납기</th><th>소재</th><th>공급 · 발주</th><th>입고</th><th>판정</th></tr></thead><tbody>${x.rows.slice(0, 12).map((r) => { const ML = x.act ? [] : matLine(r, d, l); const n = Math.max(1, ML.length); const due = r[9] ? `${md(r[9])} <small>(${Math.round((new Date(r[9]) - new Date(d)) / 864e5)}일 뒤)</small>` : esc(r[4] || '-'); return ML.length ? ML.map((m, k) => `<tr class="${k ? 'cont' : ''}"${r[8] ? ` title="배치 이유: ${esc(r[8])}"` : ''}>${k ? '' : `<td rowspan="${n}"><b>${esc(r[1])}</b> <small>${esc(r[0])}</small></td><td rowspan="${n}">${esc([r[13] || r[2], r[3]].filter(Boolean).join(' · '))}</td><td class="r" rowspan="${n}">${n0(r[5])}</td><td rowspan="${n}">${due}</td>`}<td><small>${m.kind}</small> ${m.what}</td><td>${m.src}${m.ord !== '-' ? ` <small>· 발주 시한 ${m.ord}</small>` : ''}</td><td>${m.inb}</td><td class="st ${m.st[0]}">${m.st[1]}</td></tr>`).join('') : `<tr><td><b>${esc(r[1])}</b> <small>${esc(r[0])}</small></td><td>${esc([r[13] || r[2], r[3]].filter(Boolean).join(' · '))}</td><td class="r">${n0(r[5])}</td><td>${due}</td><td colspan="4" class="small">실적일</td></tr>`; }).join('')}</tbody></table>${x.rows.length > 12 ? `<div class="why">외 ${x.rows.length - 12}건</div>` : ''}` : `<div class="why">${Object.entries(x.g).map(([k, v]) => `${esc(k)} ${n0(v)}t`).join(' · ')}</div>`}</section>`; };
    const sc = `<section class="card rv" data-noexport data-dom="C"><h3>자가재 (그날)</h3><table class="dt"><thead><tr><th>강종</th><th class="r">도금 생산</th><th class="r">컬러 사용</th><th class="r">재고</th><th class="r">다음 3일 사용</th></tr></thead><tbody>${['AZ', 'MAC', 'AL'].map((a) => { const x = D.self[`${a}|${d}`] || {}; return `<tr><td>${a}</td><td class="r">${n0(x.prod)}</td><td class="r">${n0(x.use)}</td><td class="r"><b>${n0(x.stock)}</b></td><td class="r">${n0(useNext(a, d, 3))}</td></tr>`; }).join('')}</tbody></table></section>`;
    const mc = `<section class="card rv" data-noexport data-dom="M"><h3>구매 소재 (그날)</h3><table class="dt"><thead><tr><th>소재</th><th class="r">사용</th><th class="r">입고</th><th class="r">재고</th><th>이 입고의 발주일</th></tr></thead><tbody>${[['FH', 'F/H(도금)'], ['CMAT', '컬러 소재']].map(([k, nm]) => { const x = D.mat[`${k}|${d}`] || {}; return `<tr><td>${nm}</td><td class="r">${n0(x.use)}</td><td class="r">${n0(x.inb)}</td><td class="r"><b>${n0(x.stock)}</b></td><td>${x.od ? md(x.od) : '-'}</td></tr>`; }).join('')}</tbody></table>
      ${['FH', 'CMAT'].map((k) => (D.ord[k][d] || []).length ? `<div class="why"><b>이 날 ${k === 'FH' ? 'F/H' : '컬러 소재'} 발주 ${n0(ordSum(k, d))}t</b> → 입고 ${(D.ord[k][d]).map((x) => `${md(x[0])} ${n0(x[1])}t`).join(', ')}</div>` : '').join('')}</section>`;
    $('s-det').innerHTML = `<div style="grid-column:1/-1;font-size:15px;font-weight:800;margin-top:6px">${md(d)}(${WD[wd(d)]}) 상세</div>` + ['1CGL', '2CGL'].map(pcard).join('') + ['1CCL', '2CCL', '3CCL', '4CCL'].map(ccard).join('') + sc + mc;
    UI.reveal($('s-det'));
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
    $('s-meta').innerHTML = `기준 <b>확정 계획</b> · 계산 ${esc(String(W.built).replace('T', ' '))} · 실적 ~${esc(W.asOf)}`;
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
