/* 컬러 실적: published/color_actual.enc.json (tools/color_actual.py)
   ① 핵심 지표 ② 라인별 진도·주간 비교 ③ 일별 생산(최근 35일) ④ 주별 추이 ⑤ 품명(최근 4주) ⑥ 휴지 구성 ⑦ 월별 부서 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1));
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const pct = (a, b) => (b ? (a / b - 1) * 100 : null);
  const L = ['1CCL', '2CCL', '3CCL', '4CCL'];
  const COL = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
  let O = null, pl = '1CCL';
  const card = (id, title, sm, unit, body) => `<section class="card" id="${id}"><h2>${esc(title)} ${sm ? `<small>${esc(sm)}</small>` : ''}${unit ? `<span class="unit">${unit}</span>` : ''}</h2>${body}</section>`;
  const dl = (v, good = true) => { if (v == null) return '<span class="muted">-</span>'; const up = v >= 0; const c = Math.abs(v) < 3 ? 'muted' : (up === good ? 'up' : 'down'); return `<b class="dlt ${c}">${up ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%</b>`; };
  const legend = () => `<div class="legend">${L.map((l, i) => `<span><i class="box" style="background:${COL[i]}"></i>${l}</span>`).join('')}</div>`;

  /* ---------- 차트(SVG) ---------- */
  const tip = () => $('ca-tip');
  function bindTip(root) {
    root.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('mousemove', (e) => { const t = tip(); t.innerHTML = el.dataset.tip; t.style.display = 'block'; t.style.left = Math.min(innerWidth - 240, e.clientX + 14) + 'px'; t.style.top = (e.clientY - 12) + 'px'; });
      el.addEventListener('mouseleave', () => { tip().style.display = 'none'; });
    });
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
  function stackBars(data, H = 300) {
    const W = 1200, pl0 = 56, pr = 12, pt = 14, pb = 34, n = data.length, bw = (W - pl0 - pr) / n;
    const tot = data.map((d) => L.reduce((a, l) => a + (d[l] || 0), 0)), ym = niceMax(Math.max(...tot) * 1.05);
    const y = (v) => pt + (H - pt - pb) * (1 - v / ym);
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = ym * k / 4; g += `<line class="gl" x1="${pl0}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl0 - 8}" y="${y(v) + 4}" text-anchor="end">${n0(v)}</text>`; }
    data.forEach((d, i) => {
      let acc = 0; const x = pl0 + i * bw + 3, w = Math.max(2, bw - 6);
      const we = [0, 6].includes(new Date(d.d + 'T00:00:00').getDay());
      L.forEach((l, j) => { const v = d[l] || 0; if (v <= 0) return; const y1 = y(acc + v), y0 = y(acc); g += `<rect class="bar" style="--i:${i}" x="${x}" y="${y1 + 1}" width="${w}" height="${Math.max(0, y0 - y1 - 2)}" rx="2" fill="${COL[j]}"/>`; acc += v; });
      g += `<rect class="hit" x="${pl0 + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" data-tip="<b>${md(d.d)}</b> 합계 ${n0(tot[i])}t<br>${L.map((l) => `${l} ${n0(d[l])}t`).join('<br>')}"/>`;
      if (i % 2 === 0 || n < 20) g += `<text x="${x + w / 2}" y="${H - 12}" text-anchor="middle" class="${we ? 'we' : ''}">${md(d.d)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="cv" role="img" aria-label="일별 컬러 생산">${g}</svg>`;
  }
  function lines(xs, series, H = 300, fmt = n0) {
    const W = 1200, pl0 = 56, pr = 110, pt = 14, pb = 34;
    const all = series.flatMap((s) => s.v.filter((v) => v != null)), ym = niceMax(Math.max(...all) * 1.08);
    const x = (i) => pl0 + (W - pl0 - pr) * (xs.length > 1 ? i / (xs.length - 1) : 0.5), y = (v) => pt + (H - pt - pb) * (1 - v / ym);
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = ym * k / 4; g += `<line class="gl" x1="${pl0}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl0 - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
    xs.forEach((d, i) => { if (i % 2 === 0) g += `<text x="${x(i)}" y="${H - 12}" text-anchor="middle">${md(d)}</text>`; });
    const ends = series.map((s, j) => { const k = s.v.length - 1; return { j, y: s.v[k] == null ? null : y(s.v[k]) }; }).filter((e) => e.y != null).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 19) ends[k].y = ends[k - 1].y + 19;
    const ly = Object.fromEntries(ends.map((e) => [e.j, e.y]));
    series.forEach((s, j) => {
      const pts = s.v.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
      g += `<polyline class="ln" fill="none" stroke="${s.c}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
      pts.forEach((p, i) => { g += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${s.c}" stroke="var(--surface)" stroke-width="2"/>`; });
      const lp = pts[pts.length - 1]; if (lp) g += `<text x="${lp[0] + 8}" y="${ly[j] + 5}" class="lab" fill="currentColor">${s.n} ${fmt(s.v[s.v.length - 1])}</text>`;
    });
    xs.forEach((d, i) => { g += `<rect class="hit" x="${x(i) - (W - pl0 - pr) / xs.length / 2}" y="${pt}" width="${(W - pl0 - pr) / xs.length}" height="${H - pt - pb}" data-tip="<b>${md(d)} 주</b><br>${series.map((s) => `${s.n} ${fmt(s.v[i])}`).join('<br>')}"/>`; });
    return `<svg viewBox="0 0 ${W} ${H}" class="cv" role="img">${g}</svg>`;
  }

  /* ---------- 절 ---------- */
  function kpis() {
    const M = O.month.rows, tot = M.find((x) => /계$/.test(x.line));
    const s = (k, p) => O.lines.reduce((a, x) => a + (x[p][k] || 0), 0);
    const tpd1 = s('tpd', 'w1'), tpd0 = s('tpd', 'w0');
    const stop1 = O.lines.reduce((a, x) => a + x.w1.stopH, 0) / 4, stop0 = O.lines.reduce((a, x) => a + x.w0.stopH, 0) / 4;
    const k = (tone, l, v, unit, b, ck, dec = 0) => `<div class="kpi tone-${tone}" data-rk="k-${ck}"><div class="l">${l}</div><div class="v"><b data-count="${v}" data-dec="${dec}" data-ck="${ck}">0</b><small>${unit}</small></div><div class="b">${b}</div></div>`;
    const rate = tot ? tot.actual / tot.sched * 100 : null;
    return `<div class="kpis">${tot ? k(rate >= 98 ? 'good' : rate >= 90 ? 'warn' : 'bad', `10월 누계 실적 (MES ${md(O.month.asOf)})`, Math.round(tot.actual), 't', `일정 ${n0(tot.sched)}t 대비 <b>${rate.toFixed(1)}%</b> · 월차 ${n0(tot.month)}t`, 'mt') : ''}
      ${k(pct(tpd1, tpd0) >= -3 ? 'good' : 'warn', `지난주 생산 (${md(O.w1)}~)`, Math.round(tpd1), 't/일', `12주 평균 ${n0(tpd0)}t/일 대비 ${dl(pct(tpd1, tpd0))}`, 'wt')}
      ${k('brand', '4라인 생산속도 (정지 포함)', Math.round(O.lines.reduce((a, x) => a + (x.w1.tph || 0), 0) * 10) / 10, 't/hr 합', `12주 ${n1(O.lines.reduce((a, x) => a + (x.w0.tph || 0), 0))} t/hr`, 'tp', 1)}
      ${k(stop1 > stop0 * 1.1 ? 'warn' : 'good', '라인당 휴지', Math.round(stop1 * 10) / 10, 'h/가동일', `12주 평균 ${n1(stop0)}h 대비 ${dl(pct(stop1, stop0), false)}`, 'st', 1)}</div>`;
  }
  function lineTable() {
    const M = Object.fromEntries(O.month.rows.map((x) => [x.line, x]));
    const rows = O.lines.map((x, i) => {
      const m = M[x.line] || {}; const r = m.sched ? m.actual / m.sched : null;
      return `<tr><td class="l nm"><i class="dot" style="background:${COL[i]}"></i>${x.line}</td><td>${n0(m.month)}</td><td>${n0(m.sched)}</td><td><b>${n0(m.actual)}</b></td>
        <td class="pbar"><div><i class="${r >= 0.98 ? 'ok' : r >= 0.9 ? 'wn' : 'bd'}" style="width:${Math.min(100, (r || 0) * 100)}%"></i></div><b>${r ? (r * 100).toFixed(1) + '%' : '-'}</b></td>
        <td>${n0(x.w0.tpd)}</td><td><b>${n0(x.w1.tpd)}</b></td><td>${dl(pct(x.w1.tpd, x.w0.tpd))}</td><td>${n1(x.w0.tph)} → <b>${n1(x.w1.tph)}</b></td><td>${x.w0.thick ? x.w0.thick.toFixed(2) : '-'} → ${x.w1.thick ? x.w1.thick.toFixed(2) : '-'}</td><td>${n1(x.w0.stopH)} → <b>${n1(x.w1.stopH)}</b></td><td>${n1(x.w1.days)}</td></tr>`;
    }).join('');
    const t = O.month.rows.find((x) => /계$/.test(x.line));
    return card('ca-line', '라인별 진도 · 주간 비교', `이번 달 = MES 판매생산속보 ${O.month.asOf || ''} · 주간 = 지난주 vs 앞 12주`, '단위: 톤', `<div class="scroll"><table class="t big"><thead><tr><th class="l" rowspan="2">라인</th><th colspan="4">10월 진도 (MES 월차계획)</th><th colspan="3">생산 t/일</th><th rowspan="2">속도 t/hr<br><small>정지 포함</small></th><th rowspan="2">평균 두께 mm</th><th rowspan="2">휴지 h/가동일</th><th rowspan="2">가동일<br><small>지난주</small></th></tr>
      <tr><th>월차</th><th>일정 누계</th><th>실적 누계</th><th>달성률</th><th>12주 평균</th><th>지난주</th><th>증감</th></tr></thead><tbody>${rows}
      ${t ? `<tr class="total"><td class="l">컬러 계</td><td>${n0(t.month)}</td><td>${n0(t.sched)}</td><td>${n0(t.actual)}</td><td class="pbar"><div><i class="ok" style="width:${Math.min(100, t.actual / t.sched * 100)}%"></i></div><b>${(t.actual / t.sched * 100).toFixed(1)}%</b></td><td>${n0(O.lines.reduce((a, x) => a + x.w0.tpd, 0))}</td><td>${n0(O.lines.reduce((a, x) => a + x.w1.tpd, 0))}</td><td></td><td></td><td></td><td></td><td></td></tr>` : ''}</tbody></table></div>
      <p class="small">속도 = 생산 t ÷ (작업 + 정지 시간) — 주간 보고와 같은 정의. MES 속보의 t/hr(정지 제외)와는 다름.</p>`);
  }
  function daily() {
    return card('ca-daily', '일별 생산', `최근 35일 · 라인 누적 · 막대에 마우스를 올리면 라인별 톤`, '단위: 톤', legend() + `<div class="chart">${stackBars(O.daily)}</div>
      <details class="tv"><summary>표로 보기</summary><div class="scroll"><table class="t"><thead><tr><th class="l">날짜</th>${L.map((l) => `<th>${l}</th>`).join('')}<th>합계</th></tr></thead><tbody>${O.daily.slice().reverse().map((d) => `<tr><td class="l">${md(d.d)}</td>${L.map((l) => `<td>${n0(d[l])}</td>`).join('')}<td><b>${n0(L.reduce((a, l) => a + d[l], 0))}</b></td></tr>`).join('')}</tbody></table></div></details>`);
  }
  function weekly() {
    const xs = O.weekly.map((w) => w.w);
    return `${card('ca-wk', '주별 생산량', '13주 · 라인별', '단위: t/일', legend() + `<div class="chart">${lines(xs, L.map((l, i) => ({ n: l, c: COL[i], v: O.weekly.map((w) => w[l].tpd) })), 300)}</div>`)}
      ${card('ca-tph', '주별 생산속도', '정지 포함', '단위: t/hr', legend() + `<div class="chart">${lines(xs, L.map((l, i) => ({ n: l, c: COL[i], v: O.weekly.map((w) => w[l].tph) })), 300, n1)}</div>`)}`;
  }
  function products() {
    const P = O.products[pl] || [];
    const mx = Math.max(1, ...P.map((p) => p[1]));
    return card('ca-prod', '품명별 생산', '최근 4주 · 라인 선택', '단위: 톤', `<div class="seg" id="ca-pl">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === pl}">${l}</button>`).join('')}</div>
      <div class="scroll" style="margin-top:12px"><table class="t big"><thead><tr><th class="l">품명</th><th class="l" style="width:45%">생산량</th><th>톤</th><th>속도 t/hr</th><th>평균 두께</th></tr></thead><tbody>${P.map((p) => `<tr><td class="l nm">${esc(p[0])}</td><td class="l"><div class="hbar"><i style="width:${p[1] / mx * 100}%;background:${COL[L.indexOf(pl)]}"></i></div></td><td><b>${n0(p[1])}</b></td><td>${n1(p[2])}</td><td>${p[3] ? p[3].toFixed(2) : '-'}</td></tr>`).join('')}</tbody></table></div>`);
  }
  function stops() {
    const S = O.stops, C = S.cats;
    const rows = L.map((l) => `<tr><td class="l nm">${l}</td>${C.map((c) => `<td>${n1(S.w0[l][c])} → <b>${n1(S.w1[l][c])}</b></td>`).join('')}<td>${n1(C.reduce((a, c) => a + S.w0[l][c], 0))} → <b>${n1(C.reduce((a, c) => a + S.w1[l][c], 0))}</b></td></tr>`).join('');
    return card('ca-stop', '휴지 구성', '12주 평균 → 지난주 · 하루(달력일) 평균', '단위: 시간/일', `<div class="scroll"><table class="t big"><thead><tr><th class="l">라인</th>${C.map((c) => `<th>${c}</th>`).join('')}<th>합계</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">휴지 사유 메모(SPL_REM)의 낱말로 분류 — 색상교체·청소 / 테스트·도막조정 / 폭·롤·두께 전환 / 기타. 주간 보고와 같은 기준.</p>`);
  }
  function monthly() {
    const D = O.dept, nm = (k) => (/^\d+$/.test(k) ? `기타(${k})` : k);
    return card('ca-mon', '월별 생산', '라인별 · 부서별 (10월은 누계)', '단위: 톤', `<div class="grid2"><div class="scroll"><table class="t big"><thead><tr><th class="l">월</th>${L.map((l) => `<th>${l}</th>`).join('')}<th>합계</th></tr></thead><tbody>${O.monthly.map((m) => `<tr><td class="l">${+m.m.slice(5)}월</td>${L.map((l) => `<td>${n0(m[l])}</td>`).join('')}<td><b>${n0(L.reduce((a, l) => a + m[l], 0))}</b></td></tr>`).join('')}</tbody></table></div>
      <div class="scroll"><table class="t big"><thead><tr><th class="l">월</th>${D.names.map((k) => `<th>${esc(nm(k))}</th>`).join('')}</tr></thead><tbody>${D.rows.map((m) => `<tr><td class="l">${+m.m.slice(5)}월</td>${D.names.map((k) => `<td>${n0(m[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`);
  }
  function render() {
    $('ca-main').innerHTML = `<section class="card" id="ca-kpi"><h2>핵심 <small>실적 ~${md(O.asOf)} · MES 원자료 재계산</small><span class="unit">단위: 톤</span></h2>${kpis()}</section>` + lineTable() + daily() + weekly() + products() + stops() + monthly();
    $('ca-meta').innerHTML = `<span><b>실적</b>~${O.asOf}</span><span><b>지난주</b>${md(O.w1)}~</span><span><b>비교</b>${md(O.w0[0])}~${md(O.w0[1])} 주 (12주)</span><span><b>계산</b>${String(O.built).replace('T', ' ')}</span>`;
    UI.reveal($('ca-main')); UI.count($('ca-main')); bindTip($('ca-main'));
    render2();
  }
  function render2() { document.querySelectorAll('#ca-pl button').forEach((b) => b.addEventListener('click', () => { pl = b.dataset.l; $('ca-prod').outerHTML = products(); render2(); })); }

  let env = null;
  async function unlock(pw) {
    if (pw) { $('ca-lockbox').hidden = true; $('ca-skel').hidden = false; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } render(); }
    catch (e) { $('ca-lockbox').hidden = false; $('ca-skel').hidden = true; $('ca-form').hidden = false; $('ca-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('ca-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('ca-pw').value); });
  fetch('published/color_actual.enc.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((e) => {
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else $('ca-form').hidden = false;
  }).catch(() => { $('ca-msg').textContent = '자료를 찾을 수 없습니다'; });
})();
