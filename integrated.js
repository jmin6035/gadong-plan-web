/* 4분기 통합 가동계획: published/integrated.enc.json(분석 암호, tools/integrated_web.py)
   ① 결론(안 비교) ② 재고·소재 추이 표 ③ 일별 가동(달력 표) ④ 일별 배치 기준 ⑤ 주간 재계획 ⑥ 더 필요한 데이터
   V1 = 자가재 컬러 계획에서 계산, V2 = 자가재계획 유지, V3 = V1 + M/C 2회 추가 허용. 컬러 계획은 공통. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1));
  const k1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v / 100) / 10).toFixed(1));
  const kt = (v) => k1(v) + '천t';
  const pc = (v) => (v == null ? '-' : Math.round(v * 100) + '%');
  const md = (s) => { const p = String(s).slice(-5).split('-'); return `${+p[0]}/${+p[1]}`; };
  const SER = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];
  const CG = ['계획재', '주문재', '건재수출', '가전수출', '가전내수', '수요개발'];
  const PC = ['도금국내', '도금수출', '자동차내수', '자동차수출', '자가재'];
  const FAM = { AL: '--s1', 'AL-LG': '--s1', 'AL-STS': '--s1', AZ: '--s2', MAC: '--s3' };
  const MONTHS = ['2026-10', '2026-11', '2026-12'];
  const VN = { V1: 'V1 자가재 계산', V2: 'V2 자가재계획', V3: 'V3 계산 + M/C 2회 추가' };
  const GN = { C건재: '컬러 건재', C수출: '컬러 수출·가전', G국내: '도금 국내', G수출: '도금 수출', G자동차: '도금 자동차' };
  let O = null, V = 'V3', mon = '2026-10', sel = null;
  const inS = (p) => !window.UI || UI.inScope(p);                 // 보기 전환(전체/도금/컬러)
  const plOf = (k) => (/^(C|컬러)/.test(k) ? 'C' : /^(G|FH)/.test(k) ? 'G' : 'GC');
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function legend(items) {
    return `<div class="legend">${items.map((s) => `<span><i class="${s.box ? 'box' : ''} ${s.dash ? 'dash' : ''}" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }
  function lineChart(el, { x, series, unit = 't', fmt = n0, H = 220, W = 560, refs = [], tipExtra }) {
    W = Math.max(340, el.clientWidth || W);                   // 화면 폭 그대로(글자가 줄어들지 않게)
    const L = 50, R = 74, T = 12, B = 24;
    const vals = series.flatMap((s) => s.v.filter((v) => v != null)).concat(refs.map((r) => r.v));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
    if (Math.min(...vals) >= 0) lo = Math.max(0, lo);
    const step = niceStep((hi - lo) / 4); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (i) => L + (i * (W - L - R)) / Math.max(1, x.length - 1);
    const Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
    let g = '';
    for (let v = lo; v <= hi + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${fmt(v)}</text>`;
    if (lo < 0) g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink-3)" stroke-width="1"/>`;
    x.forEach((d, i) => { if (/-01$|-15$/.test(d) || i === 0) g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(md(d))}</text>`; });
    refs.forEach((r) => {
      g += `<line x1="${L}" x2="${W - R}" y1="${Y(r.v)}" y2="${Y(r.v)}" stroke="var(--ink-2)" stroke-width="1.2" stroke-dasharray="6 4"/>`;
      g += `<text x="${L + 4}" y="${Y(r.v) - 5}" font-size="11" fill="var(--ink-2)">${esc(r.name)} ${fmt(r.v)}</text>`;
    });
    const ends = series.map((s, k) => ({ k, y: Y(s.v[s.v.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    series.forEach((s, k) => {
      let d = '';
      s.v.forEach((v, i) => { d += `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; });
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const j = s.v.length - 1;
      g += `<circle cx="${X(j)}" cy="${Y(s.v[j])}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`;
      g += `<text x="${X(j) + 8}" y="${ends.find((e) => e.k === k).y + 4}" font-size="11" font-weight="600" fill="var(--ink)">${esc(s.name)} ${fmt(s.v[j])}</text>`;
      if (s.markMin) {
        let k = 0; s.v.forEach((v, i) => { if (v < s.v[k]) k = i; });
        if (s.v[k] < 0) g += `<circle cx="${X(k)}" cy="${Y(s.v[k])}" r="4.5" fill="var(--bad)" stroke="var(--surface)" stroke-width="2"/><text x="${X(k)}" y="${Y(s.v[k]) + 17}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--bad)">${md(x[k])} ${fmt(s.v[k])}t</text>`;
      }
    });
    g += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-dasharray="3 3" visibility="hidden"/>`;
    const w = (W - L - R) / Math.max(1, x.length - 1);
    x.forEach((_, i) => { g += `<rect class="hb" data-i="${i}" x="${X(i) - w / 2}" y="${T}" width="${w}" height="${H - T - B}" fill="transparent"/>`; });
    el.innerHTML = legend(series.map((s) => ({ name: s.name, color: s.color }))) + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))}">${g}</svg><div class="tip"></div>`;
    const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = svg.querySelector('.xh');
    svg.querySelectorAll('.hb').forEach((b) => {
      b.addEventListener('mousemove', () => {
        const i = +b.dataset.i, r = svg.getBoundingClientRect();
        xh.setAttribute('x1', X(i)); xh.setAttribute('x2', X(i)); xh.setAttribute('visibility', 'visible');
        tip.innerHTML = `<div class="muted">${md(x[i])}</div>` + series.map((s) => `<div><span class="sw" style="background:${s.color}"></span>${esc(s.name)} <b>${fmt(s.v[i])}</b> ${unit}</div>`).join('') + (tipExtra ? tipExtra(i) : '');
        tip.style.display = 'block';
        tip.style.left = Math.max(0, Math.min((X(i) / W) * r.width + 12, r.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = '28px';
      });
      b.addEventListener('mouseleave', () => { tip.style.display = 'none'; xh.setAttribute('visibility', 'hidden'); });
    });
  }


  const card = (id, num, title, sm, body) => `<section class="card" id="${id}"><h2><span class="n">${num}</span> ${esc(title)} ${sm ? `<small>${esc(sm)}</small>` : ''}</h2>${body}</section>`;
  const vlist = () => Object.keys(O.variants);

  // ---------- ① 결론 ----------
  function secRec() {
    const C = O.cmp, vs = vlist(), rec = O.rec;
    const best = (f, lowGood = true) => { const xs = vs.map((v) => f(C[v])); const b = lowGood ? Math.min(...xs) : Math.max(...xs); return (v) => f(C[v]) === b; };
    const rows = [
      ['자가재 10/11/12월', (c) => c.self.map(k1).join(' / ') + '천t', null, 'GC'],
      ['컬러 AZ 소재 부족일', (c) => (c.azNegDays ? `<span class="neg">${c.azNegDays}일 (최대 ${n0(-c.azMin)}t)</span>` : '없음'), best((c) => c.azNegDays), 'C'],
      ['AZ 자가재 재고 최고', (c) => n0(c.azMax) + 't', best((c) => c.azMax), 'GC'],
      ['자가재 평균 재고', (c) => n0(c.selfStockAvg) + 't', best((c) => c.selfStockAvg), 'GC'],
      ['1CGL 월 생산 10/11/12', (c) => c.g1.map(k1).join(' / ') + (Math.min(...c.g1) < 0.7 * Math.max(...c.g1) ? ' <span class="st warn">공백</span>' : ''), best((c) => Math.max(...c.g1) - Math.min(...c.g1)), 'G'],
      ['2CGL 월 생산 10/11/12', (c) => c.g2.map(k1).join(' / '), null, 'G'],
      ['M/C 횟수', (c) => c.mc + '회', null, 'G'],
      ['결품 · 납기 지연', (c) => `${n0(c.short)}t · ${n0(c.late)}`, null, 'G'],
    ].filter((r) => inS(r[3]));
    const tb = `<div class="scroll"><table class="t cmp"><thead><tr><th></th>${vs.map((v) => `<th class="${v === rec ? 'rec' : ''}">${esc(VN[v])}${v === rec ? ' ★추천' : ''}</th>`).join('')}</tr></thead><tbody>${rows.map(([nm, f, b]) => `<tr><td class="l">${nm}</td>${vs.map((v) => `<td class="${v === rec ? 'rec' : ''} ${b && b(v) ? 'best' : ''}">${f(C[v])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const x = O.variants[vs[0]].self.AZ.map((r) => '2026-' + r[0]);
    const col = { V1: 'var(--s1)', V2: 'var(--s2)', V3: 'var(--s3)' };
    return { html: card('s-rec', '①', '결론', '', `<p class="lead">★ ${esc(O.recWhy)}</p>${tb}<p class="small">초록 = 그 지표에서 가장 좋은 안. 컬러 계획·판매·월 물량 기준은 세 안 공통이고, 다른 것은 자가재 납기(V2 월말 / V1·V3 10일 단위)와 M/C 허용 횟수뿐.</p>
      <h3>AZ 자가재 재고 — 0 밑 = 컬러가 소재를 못 받는 날</h3><div class="chart" id="c-az"></div>`),
      after: () => lineChart($('c-az'), { x, W: 1000, H: 240, series: vs.map((v) => ({ name: v, color: col[v], v: O.variants[v].self.AZ.map((r) => r[3]), markMin: v === 'V2' })) }) };
  }

  // ---------- ② 재고·소재 추이 표 ----------
  function secStock() {
    const P = O.variants[V], W = O.weeks;
    const cls = (r, i) => {
      const v = r.v[i];
      if (v < 0) return 'h-bad';
      if (r.ss && r.ss[i] && v < r.ss[i]) return 'h-bad';
      if (r.tgt && v < r.tgt[i] * 0.9) return 'h-warn';
      if (r.tgt && v > r.tgt[i] * 1.3) return 'h-over';
      return 'h-ok';
    };
    const head = `<tr><th class="l">주 끝</th>${W.map((d) => `<th>${md(d)}</th>`).join('')}<th>목표</th></tr>`;
    let prevGrp = null;
    const body = P.stockWeek.filter((r) => inS(plOf(r.k))).map((r, ri) => {
      const grp = /^자가재/.test(r.k) ? 'S' : /^(FH|컬러 구매)/.test(r.k) ? 'M' : 'P'; const sep = ri && grp !== prevGrp ? ' class="sep"' : ''; prevGrp = grp;
      return `<tr${sep}><td class="l nm">${esc(GN[r.k] || r.k)}</td>${r.v.map((v, i) => `<td class="${cls(r, i)}" title="${md(W[i])} ${n0(v)}t${r.tgt ? ' / 목표 ' + n0(r.tgt[i]) : ''}${r.in ? ' / 그 주 입고 필요 ' + n0(r.in[i]) : ''}">${k1(v)}</td>`).join('')}<td class="muted">${r.tgt ? k1(r.tgt[r.tgt.length - 1]) : '0 이상'}</td></tr>`;
    }).join('');
    const fh = P.stockWeek.find((r) => r.k.startsWith('FH')), cm = P.stockWeek.find((r) => r.k.startsWith('컬러 구매'));
    const inRow = (r, nm) => `<tr><td class="l nm">${nm}</td>${r.in.map((v) => `<td>${v > 0.5 ? k1(v) : ''}</td>`).join('')}<td></td></tr>`;
    return { html: card('s-stock', '②', '재고·소재 추이', `${VN[V]} · 단위 천t, 주말 재고`, `
      <div class="legend"><span><i class="box h-ok"></i>목표 부근</span><span><i class="box h-warn"></i>목표의 90% 미만</span><span><i class="box h-bad"></i>안전재고 미만·부족</span><span><i class="box h-over"></i>목표의 130% 초과</span></div>
      <div class="scroll"><table class="t heat"><thead>${head}</thead><tbody>${body}
      <tr class="sep"><td class="l" colspan="${W.length + 2}"><b>소재 입고 필요(그 주)</b> — 발주 = 입고 − 리드타임(FH 32일 · 컬러 45일)</td></tr>${inS('G') ? inRow(fh, 'FH 입고') : ''}${inS('C') ? inRow(cm, '컬러소재 입고') : ''}</tbody></table></div>
      <p class="small">제품 = 9월말 재고 + 생산(컬러 실적·계획, 도금 MILP) − 판매(컬러 = 월 판매 ÷ 일수, 도금 = 판매계획 품목이 납기일에 나감). 자가재 = 9월말 + 도금 자가재 − 컬러 필요(생산일 − 5일). 소재 = 9월말 + 입고 필요 − 사용.</p>`) };
  }

  // ---------- ③ 일별 가동(달력 표) ----------
  function days(m) { const nd = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate(); return Array.from({ length: nd }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`); }
  function secDaily() {
    const P = O.variants[V], ds = days(mon), cI = {}, pI = {};
    O.color.forEach((c) => { cI[c.d + '|' + c.l] = c; });
    P.plating.forEach((c) => { pI[c.d + '|' + c.l] = c; });
    const wd = (d) => new Date(d + 'T00:00:00').getDay();
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    let h = `<div class="scroll cal"><table class="t calt"><thead><tr><th class="l stick">라인</th>${ds.map((d) => `<th class="${[0, 6].includes(wd(d)) ? 'we' : ''}">${+d.slice(8)}</th>`).join('')}<th>월계</th></tr></thead><tbody>`;
    ['1CCL', '2CCL', '3CCL', '4CCL'].filter(() => inS('C')).forEach((l) => {
      let sum = 0;
      h += `<tr><td class="l stick nm">${l}</td>` + ds.map((d) => {
        const c = cI[d + '|' + l]; if (!c) return `<td class="off" data-k="c|${d}|${l}">·</td>`;
        const t = Object.values(c.g).reduce((a, b) => a + b, 0); sum += t; const [g] = top(c.g);
        return `<td class="cell ${c.act ? 'act' : ''}" data-k="c|${d}|${l}" style="--c:var(${SER[CG.indexOf(g)] || '--s1'})" title="${md(d)} ${l} ${n0(t)}t · ${esc(Object.entries(c.g).map(([k, v]) => k + ' ' + n0(v)).join(', '))}">${n0(t)}</td>`;
      }).join('') + `<td class="sum">${n0(sum)}</td></tr>`;
    });
    ['1CGL', '2CGL'].filter(() => inS('G')).forEach((l, li) => {
      // 강종 캠페인 띠(병합)
      const camp = P.campaigns[l].filter((c) => c[1] >= ds[0] && c[0] <= ds[ds.length - 1]);
      h += `<tr class="${li === 0 && inS('C') ? 'sep' : ''}"><td class="l stick small">${l} 강종</td>`;
      camp.forEach((c) => {
        const a = c[0] < ds[0] ? ds[0] : c[0], b = c[1] > ds[ds.length - 1] ? ds[ds.length - 1] : c[1];
        const n = ds.indexOf(b) - ds.indexOf(a) + 1;
        h += `<td colspan="${n}" class="camp" style="--c:var(${FAM[c[2]]})">${n >= 3 ? `${esc(c[2])} ${md(c[0])}~${md(c[1])}` : esc(c[2])}</td>`;
      });
      h += '<td></td></tr>';
      let sum = 0;
      h += `<tr><td class="l stick nm">${l}</td>` + ds.map((d) => {
        const c = pI[d + '|' + l];
        if (!c || !Object.keys(c.cls).length) return `<td class="off ${c && /정기수리/.test(c.ev) ? 'sd' : ''} ${c && /M\/C|재가동/.test(c.ev) ? 'mc' : ''}" data-k="p|${d}|${l}" title="${c ? esc(c.ev) : ''}">${c && /정기수리/.test(c.ev) ? '수리' : (c && /M\/C|재가동/.test(c.ev) ? '<b>M/C</b>' : '·')}</td>`;
        const t = Object.values(c.cls).reduce((a, b) => a + b, 0); sum += t; const [g] = top(c.cls);
        const mc = /M\/C|재가동/.test(c.ev);
        return `<td class="cell ${mc ? 'mc' : ''}" data-k="p|${d}|${l}" style="--c:var(${SER[PC.indexOf(g)]})" title="${md(d)} ${l} ${n0(t)}t ${esc(c.ev)} · ${esc(Object.entries(c.cls).map(([k, v]) => k + ' ' + n0(v)).join(', '))}">${mc ? '<b>M/C</b><br>' : ''}${n0(t)}</td>`;
      }).join('') + `<td class="sum">${n0(sum)}</td></tr>`;
    });
    h += '</tbody></table></div>';
    const tabs = `<div class="tabs">${MONTHS.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === mon}">${+m.slice(5)}월</button>`).join('')}</div>`;
    const lg = `<div class="legend" data-pl="C"><b class="small">컬러 칸 색 = 그 날 가장 많은 그룹</b>${CG.map((k, j) => `<span><i class="box" style="background:var(${SER[j]})"></i>${k}</span>`).join('')}<span><i class="box" style="background:var(--line)"></i>흐림 = 실적</span></div>
      <div class="legend" data-pl="G"><b class="small">도금 칸 색 = 가장 많은 구분</b>${PC.map((k, j) => `<span><i class="box" style="background:var(${SER[j]})"></i>${k}</span>`).join('')}<span>강종 띠: <i class="box" style="background:var(--s1)"></i>AL <i class="box" style="background:var(--s2)"></i>AZ <i class="box" style="background:var(--s3)"></i>MAC</span></div>`;
    return { html: card('s-daily', '③', '일별 가동', `${VN[V]} · 칸 숫자 = 그날 생산 톤, 칸을 누르면 품목·이유`, tabs + lg + h + `<div class="detail" id="d-detail"></div>`),
      after: () => {
        document.querySelectorAll('#s-daily .tabs button').forEach((b) => b.addEventListener('click', () => { mon = b.dataset.m; rerender(); }));
        document.querySelectorAll('#s-daily td[data-k]').forEach((el) => el.addEventListener('click', () => { sel = el.dataset.k; showDetail(); }));
        showDetail();
      } };
  }
  function showDetail() {
    const el = $('d-detail'); if (!el) return;
    document.querySelectorAll('#s-daily td.selc').forEach((z) => z.classList.remove('selc'));
    if (!sel || sel.split('|')[1].slice(0, 7) !== mon) { el.innerHTML = ''; return; }
    const td = document.querySelector(`#s-daily td[data-k="${sel}"]`); if (td) td.classList.add('selc');
    const [kind, d, l] = sel.split('|');
    if (kind === 'c') {
      const c = O.color.find((x) => x.d === d && x.l === l);
      if (!c) { el.innerHTML = `<h3>${md(d)} ${l} 비가동</h3>`; return; }
      if (!c.rows.length) { el.innerHTML = `<h3>${md(d)} ${l} 실적</h3><p>${Object.entries(c.g).map(([k, v]) => `${esc(k)} ${n0(v)}t`).join(' · ')}</p>`; return; }
      el.innerHTML = `<h3>${md(d)} ${l} — ${n0(Object.values(c.g).reduce((a, b) => a + b, 0))}t</h3><div class="scroll"><table class="t"><thead><tr><th>그룹</th><th>품명</th><th>고객·지역/사양</th><th>톤</th><th>왜 이 날·이 라인</th></tr></thead><tbody>${c.rows.map((r) => `<tr><td class="l">${esc(r[0])}</td><td class="l">${esc(r[1])}</td><td class="l">${esc(r[2] || r[3])}</td><td>${n1(r[5])}</td><td class="why">${esc(r[8])}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
      const c = O.variants[V].plating.find((x) => x.d === d && x.l === l);
      if (!c) { el.innerHTML = `<h3>${md(d)} ${l} 생산 없음</h3>`; return; }
      el.innerHTML = `<h3>${md(d)} ${l} — ${n0(Object.values(c.cls).reduce((a, b) => a + b, 0))}t ${c.ev ? `<span class="st warn">${esc(c.ev)}</span>` : ''}</h3><p class="small">${c.why.map(esc).join(' · ')}</p>
        <div class="scroll"><table class="t"><thead><tr><th>강종</th><th>구분</th><th>목적지</th><th>톤</th><th>납기</th><th>납기까지</th></tr></thead><tbody>${c.items.map((it) => `<tr><td class="l">${esc(it[0])}</td><td class="l">${esc(it[1])}</td><td class="l">${esc(it[2])}${it[3] ? ' ' + esc(it[3]) : ''}</td><td>${n1(it[5])}</td><td>${md(it[6])}</td><td>${Math.round((new Date(it[6]) - new Date(d)) / 864e5)}일</td></tr>`).join('')}</tbody></table></div>`;
    }
  }

  // ---------- ④ 일별 배치 기준 ----------
  function secRule() {
    const R = [
      ['월 물량', '그룹별 월 생산', 'LP: 목표재고(생산주기/2 + 안전재고)에 맞추되 능력 안에서. 모자라면 바로 채우고, 넘치면 두 달에 나눠 줄임, 대수리 달은 앞 달에 미리'],
      ['컬러', '① 계획재', 'EOQ 사양을 추천 반순에, 색상 > 폭 > 두께 묶음(교체시간 포함)'],
      ['', '② 전용 라인 품명', 'STS → 3CCL, 후물·AL → 4CCL, PVS → 1CCL 먼저(범용 품명이 자리 차지 못 하게)'],
      ['', '③ 우선순위', '수출 벌크(선적 완료기한 전 10일) > 가전 내수 > 컨테이너 수출·수요개발 > 주문재'],
      ['', '④ 라인·날짜', '실적 T/hr 빠른 라인부터, 2CCL 은 마지막(가동일에 몰아서), 하루 1,440분·라인 월차 한도 안'],
      ['도금', '① 강종 캠페인', 'M/C 횟수 최소(V3 는 +2회 허용 → 캠페인 짧게)'],
      ['', '② 날짜', '납기(선적창·자가재 필요일) 안에서 미리 쌓아 두는 톤·일 최소 → 대부분 납기 직전, 캠페인·대수리 때문에 앞당김'],
      ['자가재', '필요일', '컬러 생산일 − 5일, 품명별 자가재 비중(PGS 72% · PCS 0% · POR2 100% …), 10일 단위로 묶음(V2 는 월말)'],
      ['소재', '입고·발주', '재고가 목표(FH 16,000 · 컬러 15,500t) 밑으로 가는 날 = 입고기한, 발주 = 입고 − 리드타임'],
    ];
    let cur = '';
    const R2 = R.filter((r) => { if (r[0]) cur = r[0]; return inS(cur === '컬러' ? 'C' : cur === '도금' ? 'G' : 'GC'); });
    return { html: card('s-rule', '④', '일별 배치 기준', '', `<p><a href="doc.html?d=conditions"><b>전체 조건식 보기 →</b></a> (월 물량 LP · 컬러 · 자가재 · 도금 MILP · 소재 · 재계획)</p>` + `<div class="scroll"><table class="t rules"><thead><tr><th>구분</th><th>단계</th><th>기준</th></tr></thead><tbody>${R2.map((r) => `<tr><td class="l nm">${r[0]}</td><td class="l">${r[1]}</td><td class="l wrap">${r[2]}</td></tr>`).join('')}</tbody></table></div>`) };
  }

  // ---------- ⑤ 매일 감시·재계획 ----------
  function secRoll() {
    const rs = (O.rolls || []).slice().sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
    const fl = `<div class="flow">${['매일 아침 MES 실적·출하 자동 수집', '계획 대비 점검(밀린 양·강종·재고)', '기준 넘으면 → 즉시 재계획(앞 2일 고정)', '아니면 → 월요일 정기 재계획', '월초 → 월 물량(LP) 재설정'].map((x, i) => `<span>${i + 1}. ${x}</span>`).join('<i>→</i>')}</div>`;
    // 매일 기록: 그날 계획(전날 재계획 기준) vs 실적
    let daily = '';
    if (rs.length && inS('G')) {
      const row = (r) => {
        const v = r.vsPlan.filter((x) => x[0] === r.asOf);
        const cell = (l) => { const x = v.find((z) => z[1] === l) || [0, 0, 0, 0]; const g = x[3] - x[2]; return `<td>${n0(x[2])}</td><td>${n0(x[3])}</td><td class="${Math.abs(g) > 0.25 * Math.max(1, x[2]) ? 'neg' : ''}">${(g > 0 ? '+' : '') + n0(g)}</td>`; };
        return `<tr><td class="l">${md(r.asOf)}</td>${cell('1CGL')}${cell('2CGL')}<td>${n0(r.actualT)} / ${n0(r.planToDateT)}</td><td>−${r.mcRemoved.length} +${r.mcAdded.length}</td><td>${r.mcLeft ?? '-'}</td><td>${n0(r.late)}</td><td>${r.optimal === false ? '<span class="st warn">시간 제한</span>' : '<span class="st good">최적</span>'}</td></tr>`;
      };
      daily = `<h3>매일 재계획 기록 — 그날 계획(전날 재계획) vs 실적, 도금 (t)</h3><div class="scroll"><table class="t"><thead><tr><th rowspan="2">날짜</th><th colspan="3">1CGL</th><th colspan="3">2CGL</th><th rowspan="2">누계 실적 / 계획</th><th rowspan="2">M/C 변경</th><th rowspan="2">남은 M/C</th><th rowspan="2">지연(t·일)</th><th rowspan="2">풀이</th></tr><tr><th>계획</th><th>실적</th><th>차이</th><th>계획</th><th>실적</th><th>차이</th></tr></thead><tbody>${rs.map(row).join('')}</tbody></table></div>
        ${(() => { const dif = (l) => rs.map((r) => { const x = r.vsPlan.find((z) => z[0] === r.asOf && z[1] === l); return x ? x[3] - x[2] : 0; }); const a = dif('1CGL'), b = dif('2CGL'); const same = (v) => v.every((x) => x > 0) || v.every((x) => x < 0); return same(a) || same(b) ? `<div class="issue"><b>매일 같은 방향으로 어긋남</b> — 1CGL 은 ${a.every((x) => x > 0) ? '매일 계획보다 많이' : '들쭉날쭉'}(평균 ${a.reduce((s, x) => s + x, 0) / a.length > 0 ? '+' : ''}${n0(a.reduce((s, x) => s + x, 0) / a.length)}t), 2CGL 은 ${b.every((x) => x < 0) ? '거의 매일 적게' : '들쭉날쭉'}(평균 ${n0(b.reduce((s, x) => s + x, 0) / b.length)}t). 우연한 흔들림이 아니라 계획 기준(라인 속도·강종 순서)이 현장과 다르다는 신호 → 재계획을 자주 하는 것으로는 안 고쳐지고, 속도 파라미터를 실적으로 보정해야 함(분석 화면의 '반영권장' 후보).</div>` : ''; })()}
        <p class="small">10/1 계획은 10/1부터 새로 짠 ${esc(rs[0].variant)}. 실제 현장은 1CGL을 이미 AZ로 돌리고 있어(계획은 10/7 전환) 첫날 차이가 큼 → 매일 재계획이 실제 강종에서 다시 출발.</p>`;
    }
    if (rs.length) {
      const r = rs[rs.length - 1];
      const st = Object.entries(r.stock).filter(([g]) => g !== 'C수요' && inS(plOf(g))).map(([g, v]) => `<tr><td class="l">${esc(GN[g] || (g === 'G자가재' ? '도금 자가재' : g))}</td><td>${n0(v.begin)}</td><td>+${n0(v.prod)}</td><td>−${n0(v.ship)}</td><td><b>${n0(v.now)}</b></td><td>${v.mes != null ? n0(v.mes) : (v.mesPair != null ? n0(v.mesPair) + '<span class="muted">(국내+자동차)</span>' : '-')}</td><td>${v.plan == null ? '-' : n0(v.plan)}</td><td class="${v.plan != null && Math.abs(v.now - v.plan) > 0.1 * Math.max(1, v.plan) ? 'neg' : ''}">${v.plan == null ? '-' : (v.now - v.plan > 0 ? '+' : '') + n0(v.now - v.plan)}</td></tr>`).join('');
      daily += `<h3>지금 재고 추정 (${md(r.asOf)} 말, t)</h3><div class="scroll"><table class="t"><thead><tr><th>그룹</th><th>9월말</th><th>생산</th><th>출하</th><th>지금(추정)</th><th>MES 속보 실제</th><th>계획상</th><th>차이</th></tr></thead><tbody>${st}</tbody></table></div>`;
    }
    // 재계획 주기 비교(시뮬레이션)
    let sim = '';
    if (O.sim) {
      const P = ['fixed', 'daily', 'weekly', 'event'], PN = { fixed: '고정(안 바꿈)', daily: '매일 재계획', weekly: '주 1회(월)', event: '매일 감시 + 기준 시' };
      const rowsS = Object.entries(O.sim.lines).filter(([l]) => inS(/CCL/.test(l) ? 'C' : 'G')).map(([l, x]) => {
        const lates = P.map((p) => x.pol[p].late), best = Math.min(...lates.slice(1));
        return `<tr><td class="l nm">${l}</td><td>${n1(x.cv * 100)}%</td>${P.map((p) => `<td class="${x.pol[p].late === best ? 'best' : ''}">${n0(x.pol[p].late)}</td>`).join('')}${['daily', 'weekly', 'event'].map((p) => `<td class="muted">${n0(x.pol[p].nerv)} · ${n0(x.pol[p].nre)}회</td>`).join('')}</tr>`;
      }).join('');
      sim = `<h3>재계획 주기 비교 — 13주 실적의 흔들림으로 4분기를 ${O.sim.n}번 모의 운영</h3><div class="scroll"><table class="t cmp"><thead><tr><th rowspan="2">라인</th><th rowspan="2">일 생산 흔들림</th><th colspan="4">납기 지연 (t·일, 작을수록 좋음)</th><th colspan="3">앞 7일 계획 흔들림 (t) · 재계획 횟수</th></tr><tr>${P.map((p) => `<th>${PN[p]}</th>`).join('')}<th>매일</th><th>주 1회</th><th>기준 시</th></tr></thead><tbody>${rowsS}</tbody></table></div>
        <p class="small">'기준 시' = 밀린 양이 하루 생산을 넘으면 그날 재계획, 아니면 월요일. 흔들림 = 재계획 때마다 앞 7일 계획이 바뀐 톤의 합(현장 혼란). 3CCL 은 월차 한도가 꽉 차 여유가 없어 어떤 주기로도 못 따라잡음(월차 조정 필요).</p>`;
    }
    const verdict = `<table class="t sum"><thead><tr><th>공장</th><th>권장</th><th>근거</th></tr></thead><tbody>
      <tr data-pl="G"><td class="nm l">도금</td><td class="l"><b>매일 감시, 재계획은 주 1회 + 기준 시</b></td><td class="l wrap">일 생산 흔들림 20~27%로 작음. 주 1회 재계획이 매일 재계획과 지연이 같거나 더 적고(1CGL 76 vs 129 t·일), 계획 흔들림은 절반. 매일 바꾸면 우연한 흔들림까지 쫓아가 오히려 손해</td></tr>
      <tr data-pl="C"><td class="nm l">컬러</td><td class="l"><b>매일 감시 + 밀린 양 ½~1일분 넘으면 그날 재계획</b>(주 2회꼴)</td><td class="l wrap">흔들림 28~55%로 큼. 주 1회면 지연이 매일의 2배(1CCL 625 vs 323), 기준 시 재계획은 지연을 크게 줄이면서 흔들림은 매일의 절반</td></tr>
      <tr><td class="nm l">월 물량</td><td class="l"><b>월 1회</b>(월말 재고 확정 후) + 재고가 목표 70% 미만·150% 초과면 월중 1회</td><td class="l wrap">판매·재고 변화는 주 단위로 느리게 움직임</td></tr></tbody></table>`;
    const play = [
      ['설비 정지·속도 저하', '밀린 양 > 하루 생산(도금 약 800t, 컬러 라인별 1일분) 또는 정지 ½일 이상', '그날 재계획: 동결 2일 뒤 여유일에 다시 넣고, 모자라면 납기 늦은 품목부터 미룸'],
      ['현장 강종·순서 변경', '실제 강종 ≠ 계획 강종(10/1 1CGL AZ 사례)', '그날 재계획: 실제 강종에서 출발해 캠페인 다시 정함', 'G'],
      ['선적·주문 변경', '배선 일정·긴급 주문이 3일 안 납기에 걸림', '그날 재계획, 그 밖은 월요일'],
      ['재고 이탈', '그룹 재고 < 목표 70% 또는 > 150%', '월 물량 LP 다시(그 그룹 보충·감산)'],
      ['소재 입고 지연', 'FH·컬러 소재 재고 < 7일분', '강종 순서 교환(입고된 소재 먼저), 구매에 입고 독촉'],
      ['컬러 월차 진도', '라인 누계 진도 ±5% 이상', '2CCL 가동일 조정·라인 간 품목 이동', 'C'],
    ];
    const pl = `<h3>계획대로 안 될 때 — 감지 기준과 대응</h3><div class="scroll"><table class="t rules"><thead><tr><th>상황</th><th>감지 기준(매일 자동 점검)</th><th>대응</th></tr></thead><tbody>${play.filter((r) => inS(r[3])).map((r) => `<tr><td class="l nm">${r[0]}</td><td class="l wrap">${r[1]}</td><td class="l wrap">${r[2]}</td></tr>`).join('')}</tbody></table></div>`;
    return { html: card('s-roll', '⑤', '매일 감시 · 재계획', rs.length ? `기준일 ${rs[rs.length - 1].asOf}` : '', fl + verdict + daily + sim + pl) };
  }

  // ---------- ⑥ 더 필요한 데이터 ----------
  function secNeed() {
    const R = [
      ['bad', '일별 재고(재고현황 일자별)', '주간 재계획의 출발 재고', '월말만 있음 → 생산·출하로 추정 중. mes_download --stock-only 실행 필요(도구 준비됨)'],
      ['bad', '소재 기발주·입고 예정', '소재 발주량 = 필요 − 기발주', '없음 → 지금은 "입고 필요량"까지만'],
      ['warn', '최신 판매계획(월 갱신본)', '월 물량·컬러 로트', 'TF 파일(9월 작성) 사용 — 새 파일 넣으면 재계산'],
      ['warn', '컬러 11·12월 월차', '컬러 라인 한도', '10월 월차를 11·12월에도 가정', 'C'],
      ['warn', '2CCL·컬러 휴지 계획', '2CCL 가동일(10월 미편성 0.9천t 해소)', '없음', 'C'],
      ['warn', '임가공 제품재고', '도금 자동차 재고', '재고현황에 없음 → 자동차 재고 낮게 잡힘', 'G'],
      ['warn', '판매계획 vs 실적 이력(3~6개월)', '안전재고를 "예측 오차"로(지금은 출고 편차)', '없음'],
    ];
    const S = { bad: '꼭 필요', warn: '있으면 정확' };
    return { html: card('s-need', '⑥', '더 필요한 데이터', '', `<table class="t sum"><thead><tr><th></th><th>데이터</th><th>쓰는 곳</th><th>지금</th></tr></thead><tbody>${R.filter((r) => inS(r[4])).map((r) => `<tr><td class="c"><span class="st ${r[0]}">${S[r[0]]}</span></td><td class="l nm">${r[1]}</td><td class="l wrap">${r[2]}</td><td class="l wrap">${r[3]}</td></tr>`).join('')}</tbody></table>`) };
  }

  function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
  function render() {
    const secs = [secRec(), secStock(), secDaily(), secRule(), secRoll(), secNeed()];
    $('g-main').innerHTML = secs.map((s) => s.html).join('');
    secs.forEach((s) => s.after && s.after());
    UI.sub(`${{ all: '컬러 1~4CCL · 도금 1·2CGL · 소재', G: '도금 1·2CGL 보기', C: '컬러 1~4CCL 보기' }[UI.scope()]} — 2026년 10~12월 · 계산 ${O.built.replace('T', ' ')}`);
    UI.reveal($('g-main'));
    const seg = document.querySelector('.seg');
    seg.innerHTML = vlist().map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === V}">${esc(VN[v])}${v === O.rec ? ' ★' : ''}</button>`).join('');
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { V = b.dataset.v; rerender(); }));
  }

  // ---------- 열기 ----------
  let env = null;
  async function open(pw) {
    try {
      O = await GP.decryptJSON(env, pw);
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 저장 불가 무시 */ }
      V = O.rec && O.variants[O.rec] ? O.rec : vlist()[0];
      render();
      UI.onScope(() => rerender());
    } catch (e) { $('g-form').hidden = false; $('g-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('g-form').addEventListener('submit', (e) => { e.preventDefault(); open($('g-pw').value); });
  fetch('published/integrated.enc.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((e) => {
    env = e; $('g-lock').querySelector('h2').textContent = '4분기 통합 가동계획 — 암호를 입력하세요';
    let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) open(s); else $('g-form').hidden = false;
  }).catch(() => { $('g-msg').textContent = '계획 파일을 찾을 수 없습니다'; });
})();
