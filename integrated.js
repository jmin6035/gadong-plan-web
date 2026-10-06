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
      ['자가재 10/11/12월', (c) => c.self.map(k1).join(' / ') + '천t', null],
      ['컬러 AZ 소재 부족일', (c) => (c.azNegDays ? `<span class="neg">${c.azNegDays}일 (최대 ${n0(-c.azMin)}t)</span>` : '없음'), best((c) => c.azNegDays)],
      ['AZ 자가재 재고 최고', (c) => n0(c.azMax) + 't', best((c) => c.azMax)],
      ['자가재 평균 재고', (c) => n0(c.selfStockAvg) + 't', best((c) => c.selfStockAvg)],
      ['1CGL 월 생산 10/11/12', (c) => c.g1.map(k1).join(' / ') + (Math.min(...c.g1) < 0.7 * Math.max(...c.g1) ? ' <span class="st warn">공백</span>' : ''), best((c) => Math.max(...c.g1) - Math.min(...c.g1))],
      ['2CGL 월 생산 10/11/12', (c) => c.g2.map(k1).join(' / '), null],
      ['M/C 횟수', (c) => c.mc + '회', null],
      ['결품 · 납기 지연', (c) => `${n0(c.short)}t · ${n0(c.late)}`, null],
    ];
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
    const body = P.stockWeek.map((r, ri) => {
      const sep = ri === 5 || ri === 8 ? ' class="sep"' : '';
      return `<tr${sep}><td class="l nm">${esc(GN[r.k] || r.k)}</td>${r.v.map((v, i) => `<td class="${cls(r, i)}" title="${md(W[i])} ${n0(v)}t${r.tgt ? ' / 목표 ' + n0(r.tgt[i]) : ''}${r.in ? ' / 그 주 입고 필요 ' + n0(r.in[i]) : ''}">${k1(v)}</td>`).join('')}<td class="muted">${r.tgt ? k1(r.tgt[r.tgt.length - 1]) : '0 이상'}</td></tr>`;
    }).join('');
    const fh = P.stockWeek.find((r) => r.k.startsWith('FH')), cm = P.stockWeek.find((r) => r.k.startsWith('컬러 구매'));
    const inRow = (r, nm) => `<tr><td class="l nm">${nm}</td>${r.in.map((v) => `<td>${v > 0.5 ? k1(v) : ''}</td>`).join('')}<td></td></tr>`;
    return { html: card('s-stock', '②', '재고·소재 추이', `${VN[V]} · 단위 천t, 주말 재고`, `
      <div class="legend"><span><i class="box h-ok"></i>목표 부근</span><span><i class="box h-warn"></i>목표의 90% 미만</span><span><i class="box h-bad"></i>안전재고 미만·부족</span><span><i class="box h-over"></i>목표의 130% 초과</span></div>
      <div class="scroll"><table class="t heat"><thead>${head}</thead><tbody>${body}
      <tr class="sep"><td class="l" colspan="${W.length + 2}"><b>소재 입고 필요(그 주)</b> — 발주 = 입고 − 리드타임(FH 32일 · 컬러 45일)</td></tr>${inRow(fh, 'FH 입고')}${inRow(cm, '컬러소재 입고')}</tbody></table></div>
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
    ['1CCL', '2CCL', '3CCL', '4CCL'].forEach((l) => {
      let sum = 0;
      h += `<tr><td class="l stick nm">${l}</td>` + ds.map((d) => {
        const c = cI[d + '|' + l]; if (!c) return `<td class="off" data-k="c|${d}|${l}">·</td>`;
        const t = Object.values(c.g).reduce((a, b) => a + b, 0); sum += t; const [g] = top(c.g);
        return `<td class="cell ${c.act ? 'act' : ''}" data-k="c|${d}|${l}" style="--c:var(${SER[CG.indexOf(g)] || '--s1'})" title="${md(d)} ${l} ${n0(t)}t · ${esc(Object.entries(c.g).map(([k, v]) => k + ' ' + n0(v)).join(', '))}">${n0(t)}</td>`;
      }).join('') + `<td class="sum">${n0(sum)}</td></tr>`;
    });
    ['1CGL', '2CGL'].forEach((l, li) => {
      // 강종 캠페인 띠(병합)
      const camp = P.campaigns[l].filter((c) => c[1] >= ds[0] && c[0] <= ds[ds.length - 1]);
      h += `<tr class="${li === 0 ? 'sep' : ''}"><td class="l stick small">${l} 강종</td>`;
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
    const lg = `<div class="legend"><b class="small">컬러 칸 색 = 그 날 가장 많은 그룹</b>${CG.map((k, j) => `<span><i class="box" style="background:var(${SER[j]})"></i>${k}</span>`).join('')}<span><i class="box" style="background:var(--line)"></i>흐림 = 실적</span></div>
      <div class="legend"><b class="small">도금 칸 색 = 가장 많은 구분</b>${PC.map((k, j) => `<span><i class="box" style="background:var(${SER[j]})"></i>${k}</span>`).join('')}<span>강종 띠: <i class="box" style="background:var(--s1)"></i>AL <i class="box" style="background:var(--s2)"></i>AZ <i class="box" style="background:var(--s3)"></i>MAC</span></div>`;
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
    return { html: card('s-rule', '④', '일별 배치 기준', '', `<div class="scroll"><table class="t rules"><thead><tr><th>구분</th><th>단계</th><th>기준</th></tr></thead><tbody>${R.map((r) => `<tr><td class="l nm">${r[0]}</td><td class="l">${r[1]}</td><td class="l wrap">${r[2]}</td></tr>`).join('')}</tbody></table></div>`) };
  }

  // ---------- ⑤ 주간 재계획 ----------
  function secRoll() {
    const flow = ['월 07:40 MES 자동 수집', '실적 반영(코일·출하)', '지금 재고 재추정', '도금 재계획(앞 3일 고정)', '컬러 재편성(속보 기준일~)', '게시 + 변경 기록'];
    const fl = `<div class="flow">${flow.map((s, i) => `<span>${i + 1}. ${s}</span>`).join('<i>→</i>')}</div>`;
    const rs = (O.rolls || []).filter((r) => r.variant === V || true);
    if (!rs.length) return { html: card('s-roll', '⑤', '주간 재계획', '', fl + '<p class="small">아직 기록 없음</p>') };
    const r = rs[rs.length - 1];
    const gap = r.actualT - r.planToDateT;
    const st = Object.entries(r.stock).filter(([g]) => g !== 'C수요').map(([g, v]) => `<tr><td class="l">${esc(GN[g] || (g === 'G자가재' ? '도금 자가재' : g))}</td><td>${n0(v.begin)}</td><td>+${n0(v.prod)}</td><td>−${n0(v.ship)}</td><td><b>${n0(v.now)}</b></td><td>${v.plan == null ? '-' : n0(v.plan)}</td><td class="${v.plan != null && Math.abs(v.now - v.plan) > 0.1 * Math.max(1, v.plan) ? 'neg' : ''}">${v.plan == null ? '-' : (v.now - v.plan > 0 ? '+' : '') + n0(v.now - v.plan)}</td></tr>`).join('');
    const lm = Object.entries(r.lineMonth).filter(([k, [a, b]]) => Math.abs(b - a) >= 50).map(([k, [a, b]]) => `<tr><td class="l">${k.replace('|', ' ')}월</td><td>${n0(a)}</td><td>${n0(b)}</td><td class="${b - a < 0 ? 'neg' : ''}">${(b - a > 0 ? '+' : '') + n0(b - a)}</td></tr>`).join('');
    const dept = r.byDept.map((x) => `<tr><td class="l">${esc(x[0])}</td><td>${n0(x[1])}</td><td>${n0(x[2])}</td><td class="${x[2] - x[1] < -50 ? 'neg' : ''}">${(x[2] - x[1] > 0 ? '+' : '') + n0(x[2] - x[1])}</td></tr>`).join('');
    const warn = r.optimal === false ? `<div class="issue"><b>시험 실행 결과 해석 주의</b> — 기준 계획(${esc(r.variant)})은 10/1부터 새로 짠 안이라, 실제 10/1~5 가동(1CGL 이미 AZ, 자가재 ${n0(r.byDept.find((x) => x[0] === '자가재')[2])}t)과 출발점이 달라 재계획이 시간 제한(10분) 안에 최적을 못 찾음(남은 기간 M/C ${r.mcLeft}회, 지연 ${n0(r.late)}톤·일). 실제 운영 첫 주에는 '지금 강종·실적'에서 출발하는 계획을 기준으로 다시 깔고, 그 뒤 매주 차이만 반영.</div>` : '';
    return { html: card('s-roll', '⑤', '주간 재계획 — 이번 주 무엇이 바뀌었나', `${r.variant} · 기준일 ${r.asOf}`, fl + warn + `
      <div class="kpis"><div class="kpi"><div class="l">도금 실적 vs 계획 (10/1~${md(r.asOf)})</div><div class="v">${n0(r.actualT)}<small>t</small></div><div class="b">계획 ${n0(r.planToDateT)}t, 차이 <b class="${gap < 0 ? 'neg' : ''}">${(gap > 0 ? '+' : '') + n0(gap)}t</b></div></div>
      <div class="kpi"><div class="l">M/C 일정 변경</div><div class="v">−${r.mcRemoved.length} / +${r.mcAdded.length}</div><div class="b">${esc(r.mcRemoved.concat(r.mcAdded).slice(0, 3).join(', ')) || '변경 없음'}</div></div>
      <div class="kpi"><div class="l">강종 고정</div><div class="v">~${md(r.freezeUntil || r.asOf)}</div><div class="b">앞 3일은 바꾸지 않음</div></div></div>
      <div class="grid2"><div><h3>지금 재고 추정 (t)</h3><div class="scroll"><table class="t"><thead><tr><th>그룹</th><th>9월말</th><th>생산</th><th>출하</th><th>지금</th><th>계획상</th><th>차이</th></tr></thead><tbody>${st}</tbody></table></div><p class="small">출하 실적 ~${md(r.lastShip)}. 매주 이 차이를 다음 계획의 출발점으로 씀.</p></div>
      <div><h3>구분별 실적 vs 계획 (t)</h3><table class="t"><thead><tr><th>구분</th><th>계획</th><th>실적</th><th>차이</th></tr></thead><tbody>${dept}</tbody></table>
      <h3>남은 기간 라인·월 생산 변화 (t)</h3>${lm ? `<table class="t"><thead><tr><th>라인·월</th><th>이전</th><th>재계획</th><th>차이</th></tr></thead><tbody>${lm}</tbody></table>` : '<p class="small">변화 50t 미만</p>'}</div></div>`) };
  }

  // ---------- ⑥ 더 필요한 데이터 ----------
  function secNeed() {
    const R = [
      ['bad', '일별 재고(재고현황 일자별)', '주간 재계획의 출발 재고', '월말만 있음 → 생산·출하로 추정 중. mes_download --stock-only 실행 필요(도구 준비됨)'],
      ['bad', '소재 기발주·입고 예정', '소재 발주량 = 필요 − 기발주', '없음 → 지금은 "입고 필요량"까지만'],
      ['warn', '최신 판매계획(월 갱신본)', '월 물량·컬러 로트', 'TF 파일(9월 작성) 사용 — 새 파일 넣으면 재계산'],
      ['warn', '컬러 11·12월 월차', '컬러 라인 한도', '10월 월차를 11·12월에도 가정'],
      ['warn', '2CCL·컬러 휴지 계획', '2CCL 가동일(10월 미편성 0.9천t 해소)', '없음'],
      ['warn', '임가공 제품재고', '도금 자동차 재고', '재고현황에 없음 → 자동차 재고 낮게 잡힘'],
      ['warn', '판매계획 vs 실적 이력(3~6개월)', '안전재고를 "예측 오차"로(지금은 출고 편차)', '없음'],
    ];
    const S = { bad: '꼭 필요', warn: '있으면 정확' };
    return { html: card('s-need', '⑥', '더 필요한 데이터', '', `<table class="t sum"><thead><tr><th></th><th>데이터</th><th>쓰는 곳</th><th>지금</th></tr></thead><tbody>${R.map((r) => `<tr><td class="c"><span class="st ${r[0]}">${S[r[0]]}</span></td><td class="l nm">${r[1]}</td><td class="l wrap">${r[2]}</td><td class="l wrap">${r[3]}</td></tr>`).join('')}</tbody></table>`) };
  }

  function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
  function render() {
    const secs = [secRec(), secStock(), secDaily(), secRule(), secRoll(), secNeed()];
    $('g-main').innerHTML = secs.map((s) => s.html).join('');
    secs.forEach((s) => s.after && s.after());
    $('g-sub').textContent = `컬러 1~4CCL · 도금 1·2CGL · 소재 — 2026년 10~12월 · 계산 ${O.built.replace('T', ' ')}`;
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
    } catch (e) { $('g-form').hidden = false; $('g-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('g-form').addEventListener('submit', (e) => { e.preventDefault(); open($('g-pw').value); });
  fetch('published/integrated.enc.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((e) => {
    env = e; $('g-lock').querySelector('h2').textContent = '4분기 통합 가동계획 — 암호를 입력하세요';
    let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) open(s); else $('g-form').hidden = false;
  }).catch(() => { $('g-msg').textContent = '계획 파일을 찾을 수 없습니다'; });
})();
