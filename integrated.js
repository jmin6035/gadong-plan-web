/* 4분기 통합 가동계획: published/integrated.enc.json(분석 암호, tools/integrated_web.py 가 만듦)
   ① 두 안 차이 ② 월 물량(LP) ③ 컬러 일별 ④ 도금 일별 ⑤ 자가재 ⑥ 소재 ⑦ 조건·배정 근거 ⑧ 점검
   V1 = 자가재를 컬러 일별 계획에서 계산, V2 = 자가재계획 파일 유지. 컬러 계획은 두 안 공통. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1));
  const kt = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v / 100) / 10).toFixed(1) + '천t');
  const pc = (v) => (v == null ? '-' : Math.round(v * 100) + '%');
  const md = (s) => { const p = String(s).slice(-5).split('-'); return `${+p[0]}/${+p[1]}`; };
  const SER = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];
  const CG = ['계획재', '주문재', '건재수출', '가전수출', '가전내수', '수요개발'];
  const PC = ['도금국내', '도금수출', '자동차내수', '자동차수출', '자가재'];
  const FAM = { AL: '--s1', 'AL-LG': '--s1', 'AL-STS': '--s1', AZ: '--s2', MAC: '--s3' };
  const LINES_C = ['1CCL', '2CCL', '3CCL', '4CCL'], LINES_P = ['1CGL', '2CGL'];
  const MONTHS = ['2026-10', '2026-11', '2026-12'];
  const GN = { C건재: '컬러 건재', C수출: '컬러 수출·가전', C수요: '컬러 수요개발', G국내: '도금 국내', G수출: '도금 수출', G자동차: '도금 자동차', G자가재: '도금 자가재' };
  let O = null, V = 'V1', cMon = '2026-10', pMon = '2026-10';

  // ---------- 그래프 ----------
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
  const tabs = (name, cur) => `<div class="tabs" data-tabs="${name}">${MONTHS.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === cur}">${+m.slice(5)}월</button>`).join('')}</div>`;

  // ---------- 계산 도우미 ----------
  function selfStats(v) {
    const S = O.variants[v].self, out = {};
    for (const p of ['AZ', 'MAC', 'AL']) {
      const rows = S[p]; let k = 0; rows.forEach((r, i) => { if (r[3] < rows[k][3]) k = i; });
      const runs = [];                                       // 재고가 0 밑인 연속 구간
      rows.forEach((r, i) => { if (r[3] < 0) { if (runs.length && runs[runs.length - 1].end === i - 1) { const z = runs[runs.length - 1]; z.end = i; z.min = Math.min(z.min, r[3]); } else runs.push({ start: i, end: i, min: r[3] }); } });
      out[p] = { min: rows[k][3], minDay: rows[k][0], runs: runs.map((z) => ({ from: rows[z.start][0], to: rows[z.end][0], min: z.min })) };
    }
    return out;
  }
  const runStr = (runs) => runs.map((z) => `${z.from === z.to ? md(z.from) : md(z.from) + '~' + md(z.to)} 최대 ${n0(-z.min)}t 부족`).join(', ');
  const campStr = (v, l, a) => O.variants[v].campaigns[l].filter((c) => c[2] === a).map((c) => `${md(c[0])}~${md(c[1])}`).join(', ');
  const plantSum = (v, gs, m) => gs.reduce((s, g) => s + O.variants[v].plan[g][m].prod, 0);

  // ---------- ① 두 안 차이 ----------
  function secDiff() {
    const st = { V1: selfStats('V1'), V2: selfStats('V2') };
    const col = (v) => {
      const P = O.variants[v], s = st[v];
      const self = P.plan.G자가재.map((x) => kt(x.prod)).join(' / ');
      const azs = s.AZ.min < 0 ? `<span class="neg">${runStr(s.AZ.runs)}</span>` : `부족 없음(최저 ${n0(s.AZ.min)}t, ${md(s.AZ.minDay)})`;
      const lm = (l, m) => P.lineMonth[`${l}|${m}`] || 0;
      return `<div class="vcol ${v === V ? 'on' : ''}"><h3>${v === 'V1' ? 'V1 자가재 = 컬러 계획에서 계산' : 'V2 자가재계획 파일 유지'}</h3><ul>
        <li>자가재 납기: ${v === 'V1' ? '<b>10일 단위</b>(컬러 생산일 − 5일)' : '<b>월말</b> 한 번'}</li>
        <li>도금 자가재 10/11/12월: <b>${self}</b></li>
        <li>컬러 AZ 소재: ${azs}</li>
        <li>1CGL AZ 기간: ${campStr(v, '1CGL', 'AZ')}</li>
        <li>도금 가동률(판생 능력 대비): ${P.util.G.map(pc).join(' / ')}</li>
        <li>1CGL 월 생산: ${[10, 11, 12].map((m) => kt(lm('1CGL', m))).join(' / ')}${lm('1CGL', 12) < 0.7 * lm('1CGL', 10) ? ' <span class="st warn">12월 여유</span>' : ''}</li>
        <li>도금 결품 ${n0(P.short)}t · 납기 지연 ${n0(P.late)} · M/C ${P.mc}회</li></ul></div>`;
    };
    const lead = st.V2.AZ.min < 0 && st.V1.AZ.min >= 0
      ? `두 안은 <b>자가재를 언제·얼마나 만들어 주느냐</b>만 다릅니다. V2는 월말 납기라 도금이 AZ를 월 후반에 몰아 만들고, 그 사이 컬러가 쓸 AZ가 모자랍니다(${runStr(st.V2.AZ.runs)}). V1은 컬러 사용일에 맞춰 1CGL AZ 전환을 ${campStr('V1', '1CGL', 'AZ').split('~')[0]}로 앞당겨 부족이 없습니다. → <b>V1 권장</b>`
      : '두 안은 자가재 생산 시점·양만 다릅니다.';
    const x = O.variants.V1.self.AZ.map((r) => '2026-' + r[0]);
    const body = `<p class="lead">${lead}</p><div class="vs">${col('V1')}${col('V2')}</div>
      <h3>AZ 자가재 재고(도금 → 컬러) — 0 밑이면 컬러가 소재를 못 받는 날</h3><div class="chart" id="c-az"></div>
      <p class="small">재고 = 9월말 자가재 재고 + 도금 자가재 생산 − 컬러 필요(컬러 생산일 − 5일, 품명별 자가재 비중). MAC·AL 은 '⑤ 자가재' 참고.</p>
      <div class="decide"><h3>V1의 약점과 대응</h3><ol>
        <li>12월 1CGL 이 하루 100~800t 수준으로 비어 있음 — M/C 횟수를 먼저 최소화하다 보니 1CGL 이 11/26부터 연말까지 AZ 에 묶이고, 12월 AL 수출분은 2CGL 대수리(11/23~12/6) 전에 미리 만들어 둠</li>
        <li>대응안: 12월 1CGL M/C 1회 추가 허용(AL 생산) 또는 계획 기간을 1월까지 늘려 1월분 선생산</li></ol></div>`;
    return { html: card('s-diff', '①', '두 안의 차이 한눈에', '컬러 계획은 두 안 공통', body),
      after: () => lineChart($('c-az'), { x, W: 1000, H: 260, series: [
        { name: 'V1', color: 'var(--s1)', v: O.variants.V1.self.AZ.map((r) => r[3]) },
        { name: 'V2', color: 'var(--s2)', v: O.variants.V2.self.AZ.map((r) => r[3]), markMin: true, dy: 12 }],
        tipExtra: (i) => `<div class="muted">컬러 필요 ${n0(O.variants.V1.self.AZ[i][1])}t · 도금 생산 V1 ${n0(O.variants.V1.self.AZ[i][2])} / V2 ${n0(O.variants.V2.self.AZ[i][2])}t</div>` }) };
  }

  // ---------- ② 월 물량 ----------
  function secMonthly() {
    const P = O.variants[V];
    const rows = Object.keys(P.plan).map((g) => {
      const r = P.plan[g], t = O.targets[g] || {};
      return `<tr><td class="l">${esc(GN[g] || g)}</td><td>${n0(O.begin[g])}</td>${r.map((x) => `<td>${n0(x.sales)}</td><td><b>${n0(x.prod)}</b></td><td>${n0(x.end)} <span class="muted">(${n1(x.endDays)}일)</span></td>`).join('')}<td>${n1(t.days)}</td><td class="muted">${(P.third[g] || []).map(n0).join(' / ')}</td></tr>`;
    }).join('');
    const util = (k, nm, cap, gs) => `<tr><td class="l"><b>${nm}</b></td><td></td>${[0, 1, 2].map((m) => `<td colspan="3">${n0(plantSum(V, gs, m))}t / 능력 ${n0(cap[m])}t <b>${pc(P.util[k][m])}</b></td>`).join('')}<td colspan="2"></td></tr>`;
    const body = `<p class="lead">재고가 모자라는 그룹은 능력 안에서 바로 채우고(도금 수출 10월 +${kt(P.plan.G수출[0].prod - P.plan.G수출[0].sales)}), 넘치는 그룹은 두 달에 나눠 줄입니다(컬러 건재 월 ${kt(P.plan.C건재[0].prod)}, 판매 ${kt(P.plan.C건재[0].sales)}).</p>
      <div class="scroll"><table class="t"><thead><tr><th rowspan="2">그룹</th><th rowspan="2">9월말 재고</th>${['10월', '11월', '12월'].map((m) => `<th colspan="3">${m}</th>`).join('')}<th rowspan="2">목표 일수</th><th rowspan="2">예전 방식(1/3) 생산</th></tr>
      <tr>${['판매', '생산', '월말(일수)'].concat(['판매', '생산', '월말(일수)'], ['판매', '생산', '월말(일수)']).map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}${util('C', '컬러 합계', O.cap.color, ['C건재', 'C수출', 'C수요'])}${util('G', '도금 합계', O.cap.plating, ['G국내', 'G수출', 'G자동차', 'G자가재'])}</tbody></table></div>
      <p class="small">월말 일수 = 월말 재고 ÷ 다음 달 하루 판매. 컬러 능력 = MES 월차, 도금 능력 = 판생점검 Ver3(12월 2CGL 대수리 반영).</p>`;
    return { html: card('s-month', '②', '월 물량 — 그룹별 판매·생산·재고', V, body) };
  }

  // ---------- ③ 컬러 일별 ----------
  function dayLabels(m) {
    const nd = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate();
    return Array.from({ length: nd }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
  }
  function secColor() {
    const days = dayLabels(cMon), idx = {};
    O.color.forEach((c) => { idx[c.d + '|' + c.l] = c; });
    const max = Math.max(...O.color.map((c) => Object.values(c.g).reduce((a, b) => a + b, 0)), 1);
    const wd = (d) => new Date(d + 'T00:00:00').getDay();
    let g = `<div class="gantt"><div class="grow" style="--n:${days.length}"><div></div>${days.map((d) => `<div class="dlab ${[0, 6].includes(wd(d)) ? 'we' : ''}">${+d.slice(8)}</div>`).join('')}</div>`;
    LINES_C.forEach((l) => {
      g += `<div class="grow" style="--n:${days.length};margin-top:4px"><div class="ln">${l}</div>`;
      days.forEach((d) => {
        const c = idx[d + '|' + l];
        const tot = c ? Object.values(c.g).reduce((a, b) => a + b, 0) : 0;
        const segs = c ? CG.map((k, j) => (c.g[k] ? `<i style="height:${(c.g[k] / max) * 64}px;background:var(${SER[j]});margin-top:1px"></i>` : '')).join('') : '';
        g += `<div class="day ${c && c.act ? 'act' : ''}" data-k="${d}|${l}" title="${md(d)} ${l} ${n0(tot)}t${c && c.act ? ' (실적)' : ''}">${segs}</div>`;
      });
      g += '</div>';
    });
    g += '</div>';
    const L = O.colorLines[cMon];
    const un = O.colorUnplaced.filter((u) => u.ym === cMon);
    const body = tabs('c', cMon) + legend(CG.map((k, j) => ({ name: k, color: `var(${SER[j]})`, box: true })).concat([{ name: '흐린 막대 = 실적', color: 'var(--line)', box: true }])) + g +
      `<div class="detail" id="c-detail"><p class="small">막대를 누르면 그날 그 라인의 품목과 배정 이유가 나옵니다.</p></div>
      <details class="more"><summary>라인별 월차 대비 편성 · 미편성 ${n0(un.reduce((a, u) => a + u.t, 0))}t</summary><div class="more-b">
      <table class="t"><thead><tr><th>라인</th><th>MES 월차</th><th>편성(실적 포함)</th><th>월차 대비</th></tr></thead><tbody>${LINES_C.map((l) => `<tr><td class="l">${l}</td><td>${n0(L[l].plan)}</td><td>${n0(L[l].placed)}</td><td>${pc(L[l].placed / L[l].plan)}</td></tr>`).join('')}</tbody></table>
      ${un.length ? `<h3>미편성(가능 라인이 꽉 참)</h3><table class="t"><thead><tr><th>그룹</th><th>품명</th><th>고객·지역</th><th>목적지</th><th>톤</th><th>가능 라인</th></tr></thead><tbody>${un.map((u) => `<tr><td class="l">${esc(u.g)}</td><td class="l">${esc(u.p)}</td><td class="l">${esc(u.c)}</td><td class="l">${esc(u.dest)}</td><td>${n0(u.t)}</td><td class="l">${esc(u.lines)}</td></tr>`).join('')}</tbody></table>` : ''}</div></details>`;
    return { html: card('s-color', '③', '컬러 일별 가동계획', '두 안 공통 · 라인별 하루 톤(높이) · 색 = 그룹', body),
      after: () => {
        document.querySelectorAll('#s-color .day').forEach((el) => el.addEventListener('click', () => {
          document.querySelectorAll('#s-color .day.sel').forEach((z) => z.classList.remove('sel')); el.classList.add('sel');
          const c = idx[el.dataset.k], [d, l] = el.dataset.k.split('|');
          if (!c) { $('c-detail').innerHTML = `<h3>${md(d)} ${l}</h3><p>비가동</p>`; return; }
          if (c.act && !c.rows.length) { $('c-detail').innerHTML = `<h3>${md(d)} ${l} — 실적</h3><p>${Object.entries(c.g).map(([k, v]) => `${esc(k)} ${n0(v)}t`).join(' · ')}</p>`; return; }
          $('c-detail').innerHTML = `<h3>${md(d)} ${l} — ${n0(Object.values(c.g).reduce((a, b) => a + b, 0))}t, 가동 ${n0(c.min)}분</h3><div class="scroll"><table class="t"><thead><tr><th>그룹</th><th>품명</th><th>사양/고객·지역</th><th>목적지</th><th>배선·반순</th><th>톤</th><th>분</th><th>T/hr</th><th>왜 이 날·이 라인</th></tr></thead><tbody>${c.rows.map((r) => `<tr><td class="l">${esc(r[0])}</td><td class="l">${esc(r[1])}</td><td class="l">${esc(r[2])}</td><td class="l">${esc(r[3])}</td><td class="l">${esc(r[4])}</td><td>${n1(r[5])}</td><td>${n0(r[6])}</td><td>${n1(r[7])}</td><td class="why">${esc(r[8])}</td></tr>`).join('')}</tbody></table></div>`;
        }));
      } };
  }

  // ---------- ④ 도금 일별 ----------
  function secPlating() {
    const P = O.variants[V], days = dayLabels(pMon), idx = {};
    P.plating.forEach((c) => { idx[c.d + '|' + c.l] = c; });
    const max = Math.max(...P.plating.map((c) => Object.values(c.cls).reduce((a, b) => a + b, 0)), 1);
    const famOn = (l, d) => { const c = P.campaigns[l].find((z) => z[0] <= d && d <= z[1]); return c ? c[2] : null; };
    let g = `<div class="gantt"><div class="grow" style="--n:${days.length}"><div></div>${days.map((d) => `<div class="dlab">${+d.slice(8)}</div>`).join('')}</div>`;
    LINES_P.forEach((l) => {
      g += `<div class="grow" style="--n:${days.length};margin-top:6px"><div class="ln">강종</div>${days.map((d) => { const a = famOn(l, d); return `<div class="camp" style="background:${a ? `var(${FAM[a]})` : 'transparent'}" title="${md(d)} ${l} ${a || ''} 캠페인"></div>`; }).join('')}</div>`;
      g += `<div class="grow" style="--n:${days.length}"><div class="ln">${l}</div>`;
      days.forEach((d) => {
        const c = idx[d + '|' + l];
        const tot = c ? Object.values(c.cls).reduce((a, b) => a + b, 0) : 0;
        const sd = c && /정기수리/.test(c.ev);
        const segs = c ? PC.map((k, j) => (c.cls[k] ? `<i style="height:${(c.cls[k] / max) * 64}px;background:var(${SER[j]});margin-top:1px"></i>` : '')).join('') : '';
        g += `<div class="day ${sd ? 'sd' : ''}" data-k="${d}|${l}" title="${md(d)} ${l} ${n0(tot)}t ${c ? esc(c.ev) : ''}">${segs}${c && /M\/C|재가동/.test(c.ev) ? '<span class="ev">▼</span>' : ''}</div>`;
      });
      g += '</div>';
    });
    g += '</div>';
    const body = tabs('p', pMon) + legend(PC.map((k, j) => ({ name: k, color: `var(${SER[j]})`, box: true }))) +
      legend([{ name: '강종 띠: AL 계열', color: 'var(--s1)', box: true }, { name: 'AZ', color: 'var(--s2)', box: true }, { name: 'MAC', color: 'var(--s3)', box: true }, { name: '▼ M/C·재가동, 빗금 = 정기수리', color: 'var(--line)', box: true }]) + g +
      `<div class="detail" id="p-detail"><p class="small">막대를 누르면 그날 만드는 품목(목적지·납기)과 배정 이유가 나옵니다.</p></div>`;
    return { html: card('s-plat', '④', '도금 일별 가동계획', `${V} · 막대 색 = 구분, 위 띠 = 강종 캠페인`, body),
      after: () => {
        document.querySelectorAll('#s-plat .day').forEach((el) => el.addEventListener('click', () => {
          document.querySelectorAll('#s-plat .day.sel').forEach((z) => z.classList.remove('sel')); el.classList.add('sel');
          const c = idx[el.dataset.k], [d, l] = el.dataset.k.split('|');
          if (!c) { $('p-detail').innerHTML = `<h3>${md(d)} ${l}</h3><p>생산 없음</p>`; return; }
          $('p-detail').innerHTML = `<h3>${md(d)} ${l} — ${n0(Object.values(c.cls).reduce((a, b) => a + b, 0))}t ${c.ev ? `<span class="st warn">${esc(c.ev)}</span>` : ''}</h3>
            <ul class="rule">${c.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
            ${c.items.length ? `<div class="scroll"><table class="t"><thead><tr><th>강종</th><th>구분</th><th>목적지/구역</th><th>항구</th><th>선적창</th><th>톤</th><th>납기</th><th>납기까지</th></tr></thead><tbody>${c.items.map((it) => { const lead = Math.round((new Date(it[6]) - new Date(d)) / 864e5); return `<tr><td class="l">${esc(it[0])}</td><td class="l">${esc(it[1])}</td><td class="l">${esc(it[2])}</td><td class="l">${esc(it[3])}</td><td class="l">${esc(it[4])}</td><td>${n1(it[5])}</td><td>${md(it[6])}</td><td>${lead}일</td></tr>`; }).join('')}</tbody></table></div>` : ''}`;
        }));
      } };
  }

  // ---------- ⑤ 자가재 ----------
  function weekly(rows, cols) {
    const W = new Map();
    rows.forEach((r) => {
      const d = new Date('2026-' + r[0] + 'T00:00:00'), k = new Date(d - ((d.getDay() + 6) % 7) * 864e5);
      const key = `${k.getMonth() + 1}/${k.getDate()}`;
      if (!W.has(key)) W.set(key, cols.map(() => 0).concat([null]));
      const w = W.get(key); cols.forEach((c, j) => { w[j] += r[c] || 0; }); w[cols.length] = r;
    });
    return [...W.entries()];
  }
  function secSelf() {
    const P = O.variants[V], S = P.self, st = selfStats(V);
    const charts = ['AZ', 'MAC', 'AL'].map((p) => `<div class="chart" id="c-self-${p}"></div>`).join('');
    const wk = (p) => weekly(S[p], [1, 2]).map(([k, w]) => `<tr><td class="l">${k}</td><td>${n0(w[0])}</td><td>${n0(w[1])}</td><td class="${w[2][3] < 0 ? 'neg' : ''}">${n0(w[2][3])}</td></tr>`).join('');
    const body = `<p class="lead">${['AZ', 'MAC', 'AL'].map((p) => `${p} 최저 ${st[p].min < 0 ? `<span class="neg">${n0(st[p].min)}t</span>` : n0(st[p].min) + 't'}(${md(st[p].minDay)})`).join(' · ')}</p>
      <div class="minis">${charts}</div>
      <details class="more"><summary>주별 필요·생산 · 도금 자가재 품목(MILP 입력)</summary><div class="more-b"><div class="minis">
      ${['AZ', 'MAC', 'AL'].map((p) => `<div><h3>${p}</h3><table class="t"><thead><tr><th>주 시작</th><th>컬러 필요</th><th>도금 생산</th><th>주말 재고</th></tr></thead><tbody>${wk(p)}</tbody></table></div>`).join('')}
      <div><h3>자가재 품목</h3><table class="t"><thead><tr><th>납기</th><th>구역</th><th>강종</th><th>창</th><th>톤</th></tr></thead><tbody>${P.selfItems.map((x) => `<tr><td>${md(x[0])}</td><td class="l">${esc(x[1])}</td><td class="l">${esc(x[2])}</td><td class="l">${esc(x[3])}</td><td>${n0(x[4])}</td></tr>`).join('')}</tbody></table></div>
      </div></div></details>`;
    return { html: card('s-self', '⑤', '자가재 수급 — 강종별 재고', V, body),
      after: () => ['AZ', 'MAC', 'AL'].forEach((p, j) => lineChart($('c-self-' + p), { x: S[p].map((r) => '2026-' + r[0]), H: 180,
        series: [{ name: `${p} 재고`, color: `var(${['--s2', '--s3', '--s1'][j]})`, v: S[p].map((r) => r[3]), markMin: true }],
        tipExtra: (i) => `<div class="muted">컬러 필요 ${n0(S[p][i][1])}t · 도금 생산 ${n0(S[p][i][2])}t</div>` })) };
  }

  // ---------- ⑥ 소재 ----------
  function secMat() {
    const M = O.variants[V].mat;
    const nm = { FH: 'FH(도금 원소재)', CMAT: '컬러 구매소재' };
    const tbl = (k) => weekly(M[k].rows, [1, 2]).map(([wkey, w]) => {
      const ord = M[k].rows.filter((r) => r[3] && weekly([r], [1])[0][0] === wkey).map((r) => r[3]);
      const first = ord.length ? ord[0] : '';
      const past = first && first < '10-06';
      return `<tr><td class="l">${wkey}</td><td>${n0(w[0])}</td><td>${n0(w[1])}</td><td class="${past ? 'neg' : ''}">${first ? md(first) : '-'}${past ? ' (지남)' : ''}</td><td>${n0(w[2][4])}</td></tr>`;
    }).join('');
    const body = `<p class="lead">FH 9월말 ${kt(M.FH.begin)} → 목표 ${kt(M.FH.target)}, 4분기 입고 필요 ${kt(M.FH.rows.reduce((a, r) => a + r[2], 0))}. 컬러 구매소재 9월말 ${kt(M.CMAT.begin)} → 목표 ${kt(M.CMAT.target)}(30일에 걸쳐 회복). 리드타임 때문에 11월 초까지 입고분은 이미 발주돼 있어야 합니다 — 기발주와 맞춰 볼 것.</p>
      <div class="minis"><div class="chart" id="c-fh"></div><div class="chart" id="c-cm"></div></div>
      <details class="more"><summary>주별 사용·입고 필요·발주 마감</summary><div class="more-b"><div class="minis">
      ${['FH', 'CMAT'].map((k) => `<div><h3>${nm[k]} (리드타임 ${M[k].lt}일)</h3><table class="t"><thead><tr><th>주 시작</th><th>사용</th><th>입고 필요</th><th>발주 마감</th><th>주말 재고</th></tr></thead><tbody>${tbl(k)}</tbody></table></div>`).join('')}</div></div></details>`;
    return { html: card('s-mat', '⑥', '소재 일별 수급', `${V} · 입고기한 = 재고가 목표 밑으로 내려가는 날, 발주 = 입고 − 리드타임`, body),
      after: () => [['FH', 'c-fh', '--s1'], ['CMAT', 'c-cm', '--s3']].forEach(([k, id, c]) => lineChart($(id), { x: M[k].rows.map((r) => '2026-' + r[0]), H: 180,
        series: [{ name: `${nm[k]} 재고`, color: `var(${c})`, v: M[k].rows.map((r) => r[4]) }], refs: [{ name: '목표', v: M[k].target }],
        tipExtra: (i) => `<div class="muted">사용 ${n0(M[k].rows[i][1])}t · 입고 필요 ${n0(M[k].rows[i][2])}t${M[k].rows[i][3] ? ' · 발주 ' + md(M[k].rows[i][3]) : ''}</div>` })) };
  }

  // ---------- ⑦ 조건·배정 근거 ----------
  function secRules() {
    const tg = O.targets, dm = O.demand, W = O.weights;
    const trow = ['C건재', 'C수출', 'G국내', 'G수출', 'G자동차', 'G자가재'].map((g) => `<tr><td class="l">${esc(GN[g])}</td><td>${n1(tg[g].cycleDays)}</td><td>${n1(tg[g].safetyDays)}</td><td><b>${n1(tg[g].days)}</b></td><td>${n0(dm[g].sdWeekRaw)} → <b>${n0(dm[g].sdWeek)}</b></td><td>${n0(dm[g].meanMonthEndWeek)} / ${n0(dm[g].meanOtherWeek)}</td></tr>`).join('');
    const sub = O.substrate.slice(0, 14).map((s) => `<tr><td class="l">${esc(s[0])}</td><td>${n0(s[1])}</td><td><b>${pc(s[2])}</b></td><td>${pc(s[3].AZ || 0)}</td><td>${pc(s[3].MAC || 0)}</td><td>${pc(s[3].AL || 0)}</td></tr>`).join('');
    const body = `<div class="grid2"><div>
      <h3>1. 월 물량 — LP(3개월 동시)</h3><ul class="rule">
        <li><b>목표재고(일)</b> = 생산주기 ÷ 2 + 안전재고. 생산주기 = 13주 실적에서 같은 품명을 다시 만들기까지 걸린 날</li>
        <li><b>안전재고</b> = 1.28 × 주간 출고 편차 × √2 ÷ 하루 출고(서비스 90%, 재계획 1주 + 생산 1주). 편차는 <b>월말 몰림을 뺀 값</b> — 월말 몰림은 미리 아는 패턴이라 생산계획이 따라가면 되고, 안전재고로 막을 것은 예측 못 하는 흔들림뿐</li>
        <li><b>벌점(톤당)</b>: 결품 ${W.short} · 안전재고 미달 ${W.safety} · 목표 미달 ${W.under} · 목표 초과 ${W.over} · 월간 생산 급변 ${W.swing} → 모자라면 능력 안에서 바로 채우고, 넘치면 한 번에 깎지 않고 나눠 줄이고, 능력 모자란 달(2CGL 대수리)은 앞 달에 미리</li>
        <li>제약: 월 능력(컬러 = MES 월차, 도금 = 판생점검), 기말 = 기초 + 생산 − 판매. 기초 = 9월말 재고(180일 초과·5등급 제외)</li>
        <li>컬러 건재 = 계획재 EOQ 사양별 목표 + 주문재분</li></ul>
      <h3>2. 컬러 일별 — 왜 이 날·이 라인</h3><ul class="rule">
        <li><b>계획재 먼저</b>: EOQ 사양을 추천 반순에, 빠른 라인, 색상 > 폭 > 두께 묶음, 교체시간 포함</li>
        <li><b>한 라인 전용 품명 먼저</b>(STS → 3CCL, 후물·AL → 4CCL, PVS → 1CCL): 범용 품명이 전용 라인을 먼저 차지하지 않게</li>
        <li><b>우선순위</b>: ① 수출 벌크(선적 완료기한 전 10일 안) ② 가전 내수 ③ 컨테이너 수출·수요개발 ④ 주문재</li>
        <li><b>라인</b>: 실적 T/hr 빠른 순, 2CCL 은 마지막·이미 돌리는 날에 몰아서, 3CCL 은 가전 전용. 라인 월 톤 한도 = MES 월차</li>
        <li>다음 달 1~5일 벌크 선적분은 이번 달 물량 안에서 월말 10일에(목표재고에 또 더하지 않음)</li></ul>
    </div><div>
      <h3>3. 도금 일별 — MILP</h3><ul class="rule">
        <li>품목 = 판매계획(목적지·선적창 납기) + LP 재고 보충(같은 목적지, 월말 납기) 또는 감축 + 자가재(V1/V2)</li>
        <li>① 강종 전환(M/C) 횟수 최소 → ② 그 상태에서 미리 쌓아 두는 양(톤·일) 최소 → ③ 평준화. 결품·납기 지연은 0 이 되게</li>
        <li>그래서 대부분 납기 가까이 만들고, 앞당기는 것은 그 강종을 만들 수 있는 캠페인 기간이 그때뿐이거나 2CGL 대수리 전이라서</li></ul>
      <h3>4. 자가재</h3><ul class="rule">
        <li><b>V1</b>: 컬러 일별 품명 × 품명별 자가재 비중·강종(13주 실적, 원소재 번호 AA·BA) → 필요일 = 컬러 생산일 − 5일 → 반순 끝 납기 품목, 월 합계는 LP 와 맞춤</li>
        <li><b>V2</b>: 자가재계획 파일 품목 그대로(월말 납기)</li></ul>
      <h3>5. 소재</h3><ul class="rule">
        <li>FH = 도금 일별 ÷ 1.008, 컬러 구매소재 = 컬러 일별 × (1 − 자가재 비중)</li>
        <li>입고기한 = 재고가 목표(FH 16,000 · 컬러 15,500t) 밑으로 내려가는 날, 발주 = 입고 − 리드타임(FH 32 · 컬러 45일)</li></ul>
    </div></div>
    <div class="grid2"><div><h3>목표재고 산출(13주 실적)</h3><div class="scroll"><table class="t"><thead><tr><th>그룹</th><th>주기/2</th><th>안전재고</th><th>목표 일수</th><th>주간 편차 원래 → 월말 제외</th><th>월말주 / 평상주 평균</th></tr></thead><tbody>${trow}</tbody></table></div></div>
    <div><h3>컬러 품명별 자가재 비중</h3><div class="scroll"><table class="t"><thead><tr><th>품명</th><th>13주 원소재 t</th><th>자가재</th><th>AZ</th><th>MAC</th><th>AL</th></tr></thead><tbody>${sub}</tbody></table></div><p class="small">강종 비율은 도금 코일과 연결된 자가재 기준(81% 연결), 나머지는 같은 비율로 나눔.</p></div></div>`;
    return { html: card('s-rule', '⑦', '어떤 조건으로, 왜 이렇게 배정했나', '', body) };
  }

  // ---------- ⑧ 점검 ----------
  function secCheck() {
    const P = O.variants[V], st = selfStats(V);
    const un = MONTHS.map((m) => O.colorUnplaced.filter((u) => u.ym === m).reduce((a, u) => a + u.t, 0));
    const past = (k) => P.mat[k].rows.filter((r) => r[3] && r[3] < '10-06').reduce((a, r) => a + r[2], 0);
    const it = [
      [un[0] > 100 ? 'warn' : 'good', '컬러 미편성', `10월 ${n0(un[0])}t · 11월 ${n0(un[1])}t · 12월 ${n0(un[2])}t — 4·2CCL 전용 print·PPG·PCS 수출분이 2CCL 월차 한도를 넘음(2CCL 증편 또는 11월 이월 결정 필요)`],
      [P.short > 0 || P.late > 0 ? 'bad' : 'good', '도금 결품·지연', `결품 ${n0(P.short)}t, 납기 지연 ${n0(P.late)}, M/C ${P.mc}회`],
      [Object.values(st).some((s) => s.min < 0) ? 'bad' : 'good', '자가재 부족', ['AZ', 'MAC', 'AL'].map((p) => `${p} 최저 ${n0(st[p].min)}t(${md(st[p].minDay)})`).join(' · ')],
      ['warn', '소재 기발주 확인', `발주일이 10/6 이전인 입고 필요: FH ${kt(past('FH'))}, 컬러 구매소재 ${kt(past('CMAT'))} — 기발주 자료 없음`],
      ['warn', '가정', '판매계획 = TF 파일(9월 작성), 컬러 11·12월 능력 = 10월 월차와 같음, 임가공 제품재고는 재고현황에 없음, 도금은 10/1부터 계획(실적 미반영)'],
    ];
    const ST = { good: '양호', warn: '확인', bad: '조치' };
    const body = `<table class="t sum"><tbody>${it.map((x) => `<tr><td class="c"><span class="st ${x[0]}">${ST[x[0]]}</span></td><td class="nm l">${esc(x[1])}</td><td class="wrap l">${esc(x[2])}</td></tr>`).join('')}</tbody></table>`;
    return { html: card('s-chk', '⑧', '점검', V, body) };
  }

  function render() {
    const secs = [secDiff(), secMonthly(), secColor(), secPlating(), secSelf(), secMat(), secRules(), secCheck()];
    $('g-main').innerHTML = secs.map((s) => s.html).join('');
    secs.forEach((s) => s.after && s.after());
    document.querySelectorAll('[data-tabs]').forEach((t) => t.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      if (t.dataset.tabs === 'c') cMon = b.dataset.m; else pMon = b.dataset.m;
      const y = window.scrollY; render(); window.scrollTo(0, y);
    })));
    $('g-sub').textContent = `컬러 1~4CCL · 도금 1·2CGL · 소재 — 2026년 10~12월 · 기준 ${O.asOf} · 계산 ${O.built.replace('T', ' ')}`;
  }
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    V = b.dataset.v;
    document.querySelectorAll('.seg button').forEach((z) => z.setAttribute('aria-pressed', String(z === b)));
    if (O) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  }));

  // ---------- 열기 ----------
  let env = null;
  async function open(pw) {
    try {
      O = await GP.decryptJSON(env, pw);
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 저장 불가 무시 */ }
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
