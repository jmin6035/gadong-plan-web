/* 임원 보고용 주간 보고서: published/weekly_report.enc.json(분석 암호) → 요약 지표·표·13주 추이 그래프.
   데이터는 tools/weekly_build.py(cgl-weekly v2). 구형(v1, 마크다운)은 분석 화면에서 표시. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const n3 = (v) => (v == null || isNaN(v) ? '-' : v.toFixed(3));
  const pct = (a, b) => (b ? (a / b - 1) * 100 : null);
  const delta = (d, goodUp = true, unit = '%') => {
    if (d == null || isNaN(d)) return '<span class="delta flat">-</span>';
    const flat = Math.abs(d) < 0.5, cls = flat ? 'flat' : ((d > 0) === goodUp ? 'up' : 'down');
    return `<span class="delta ${cls}">${flat ? '보합' : (d > 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1) + unit}</span>`;
  };
  const md = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const SER = ['--s1', '--s2', '--s3', '--s4'];

  // ---------- 그래프(인라인 SVG): 선 그래프 · 누적 막대 ----------
  function lineChart(el, { x, series, unit = '', fmt = n0, yMin }) {
    const W = 520, H = 230, L = 48, R = 64, T = 10, B = 26;
    const vals = series.flatMap((s) => s.v.filter((v) => v != null));
    let lo = yMin != null ? yMin : Math.min(...vals), hi = Math.max(...vals);
    if (yMin == null) { const pad = (hi - lo) * 0.15 || hi * 0.1 || 1; lo = Math.max(0, lo - pad); hi += pad; } else hi *= 1.08;
    const step = niceStep((hi - lo) / 4); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (i) => L + (x.length === 1 ? 0 : (i * (W - L - R)) / (x.length - 1));
    const Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
    let g = '';
    for (let v = lo; v <= hi + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${fmt(v)}</text>`;
    const every = Math.ceil(x.length / 7);
    x.forEach((d, i) => { if (i % every === 0 || i === x.length - 1) g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(d)}</text>`; });
    // 끝 라벨 겹침 방지
    const ends = series.map((s, k) => { let j = s.v.length - 1; while (j >= 0 && s.v[j] == null) j--; return { k, j, y: j >= 0 ? Y(s.v[j]) : null }; }).filter((e) => e.y != null).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    series.forEach((s, k) => {
      const col = s.color || `var(${SER[k]})`;
      let d = '', pen = false;
      s.v.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
      g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
      const e = ends.find((z) => z.k === k);
      if (e) {
        g += `<circle cx="${X(e.j)}" cy="${Y(s.v[e.j])}" r="4" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
        g += `<text x="${X(e.j) + 8}" y="${e.y + 4}" font-size="11" fill="var(--ink-2)">${esc(s.name)} ${fmt(s.v[e.j])}</text>`;
      }
    });
    g += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-dasharray="3 3" visibility="hidden"/>`;
    el.innerHTML = legend(series) + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))} 추이">${g}<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/></svg><div class="tip"></div>`;
    const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = el.querySelector('.xh');
    const move = (ev) => {
      const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(x.length - 1, Math.round(((px - L) / (W - L - R)) * (x.length - 1))));
      xh.setAttribute('x1', X(i)); xh.setAttribute('x2', X(i)); xh.setAttribute('visibility', 'visible');
      tip.innerHTML = `<div class="muted">${esc(x[i])}</div>` + series.map((s, k) => `<div><span class="sw" style="background:${s.color || `var(${SER[k]})`}"></span>${esc(s.name)} <b>${fmt(s.v[i])}</b> ${unit}</div>`).join('');
      tip.style.display = 'block';
      const left = ((X(i) / W) * r.width) + 12; tip.style.left = Math.min(left, r.width - tip.offsetWidth - 4) + 'px'; tip.style.top = '24px';
    };
    svg.addEventListener('mousemove', move); svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; xh.setAttribute('visibility', 'hidden'); });
  }
  function stackChart(el, { x, cats, data, unit = '', fmt = n1 }) {
    const W = 520, H = 230, L = 40, R = 10, T = 10, B = 26;
    const tot = data.map((row) => cats.reduce((a, c) => a + (row[c] || 0), 0));
    const step = niceStep(Math.max(...tot) / 4), hi = Math.ceil(Math.max(...tot) / step) * step || 1;
    const bw = Math.min(26, ((W - L - R) / x.length) * 0.62);
    const X = (i) => L + ((i + 0.5) * (W - L - R)) / x.length;
    const Y = (v) => T + (H - T - B) * (1 - v / hi);
    let g = '';
    for (let v = 0; v <= hi + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${fmt(v)}</text>`;
    const every = Math.ceil(x.length / 7);
    data.forEach((row, i) => {
      let acc = 0;
      cats.forEach((c, k) => {
        const v = row[c] || 0; if (v <= 0) return;
        const y0 = Y(acc), y1 = Y(acc + v); acc += v;
        g += `<rect x="${X(i) - bw / 2}" y="${y1 + 1}" width="${bw}" height="${Math.max(0, y0 - y1 - 2)}" rx="2" fill="var(${SER[k]})"/>`;
      });
      g += `<rect class="hb" data-i="${i}" x="${X(i) - (W - L - R) / x.length / 2}" y="${T}" width="${(W - L - R) / x.length}" height="${H - T - B}" fill="transparent"/>`;
      if (i % every === 0 || i === x.length - 1) g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(x[i])}</text>`;
    });
    el.innerHTML = legend(cats.map((c) => ({ name: c, box: true }))) + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cats.join(', '))} 누적">${g}</svg><div class="tip"></div>`;
    const svg = el.querySelector('svg'), tip = el.querySelector('.tip');
    svg.querySelectorAll('.hb').forEach((b) => {
      b.addEventListener('mousemove', () => {
        const i = +b.dataset.i, r = svg.getBoundingClientRect();
        tip.innerHTML = `<div class="muted">${esc(x[i])} · 합계 <b>${fmt(tot[i])}</b> ${unit}</div>` + cats.map((c, k) => `<div><span class="sw" style="background:var(${SER[k]})"></span>${esc(c)} <b>${fmt(data[i][c] || 0)}</b></div>`).join('');
        tip.style.display = 'block'; tip.style.left = Math.min((X(i) / W) * r.width + 12, r.width - tip.offsetWidth - 4) + 'px'; tip.style.top = '24px';
      });
      b.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  }
  function legend(series) {
    return `<div class="legend">${series.map((s, k) => `<span><i class="${s.box ? 'box' : ''} ${s.dash ? 'dash' : ''}" style="background:${s.color || `var(${SER[k]})`}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  // ---------- 화면 ----------
  function card(num, title, sub, body) {
    return `<section class="card"><h2><span class="n">${num}</span>${esc(title)}${sub ? ` <small>${esc(sub)}</small>` : ''}</h2>${body}</section>`;
  }
  const notes = (arr) => (arr && arr.length ? `<ul class="notes">${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '');

  function render(o) {
    const P = o.period, N = o.notes || {}, S = o.sections;
    const w1 = `${md(P.w1[0])}~${md(P.w1[1])}`, w0 = `${md(P.w0[0])}~${md(P.w0[1])}`;
    $('r-title').textContent = `도금·컬러 주간 실적 보고 — ${o.title || w1}`;
    document.title = `주간 실적 보고 ${o.title || w1}`;
    $('r-sub').textContent = `보고 주 ${w1} · 비교 기준 직전 12주(${w0}) 평균 · MES 실적 ~${md(P.to)} · 작성 ${new Date(o.createdAt).toLocaleString('ko-KR')}`;
    let h = '';
    if (o.status && o.status.stale) h += `<div class="stale">⚠ 사내 PC 자동 실행이 하루 넘게 멈춰 있습니다(마지막 자료 ${new Date(o.status.savedAt).toLocaleString('ko-KR')}).</div>`;

    // 1. 요약
    const kp = (o.kpis || []).map((k) => {
      const isPlan = k.mode === 'plan';
      return `<div class="kpi"><div class="l">${esc(k.label)}</div><div class="v">${n0(k.v)}<small>${esc(k.unit)}</small></div>
        <div class="b">${isPlan ? `계획 ${n0(k.base)}t · ${k.base ? Math.round((k.v / k.base) * 100) : '-'}%` : `12주 평균 ${n0(k.base)}`} ${delta(k.d)}</div></div>`;
    }).join('');
    h += card('1', '핵심 요약', w1, `${notes(N.headline).replace('class="notes"', 'class="headline"')}<div class="kpis">${kp}</div>`);

    // 2. 도금
    const pl = S.plating;
    let t = `<div class="scroll"><table class="t"><thead><tr><th>라인</th><th>생산 t/일<br><span class="muted">12주 → 보고 주</span></th><th>증감</th><th>속도 t/hr</th><th>평균 두께 mm</th><th>휴지 h/일</th><th>강종전환<br>회/주</th></tr></thead><tbody>`;
    pl.rows.forEach((r, k) => {
      t += `<tr><td class="l"><span class="sw" style="background:var(${SER[k]})"></span>${r.line}</td><td>${n0(r.w0.tpd)} → <b>${n0(r.w1.tpd)}</b></td><td>${delta(r.dTpd)}</td>
        <td>${n1(r.w0.tph)} → ${n1(r.w1.tph)}</td><td>${n3(r.w0.thick)} → ${n3(r.w1.thick)}</td><td>${n1(r.w0.stopH)} → ${n1(r.w1.stopH)}</td><td>${n1(r.w0.mc)} → ${n0(r.w1.mc)}</td></tr>`;
    });
    const sumW0 = pl.rows.reduce((a, r) => a + r.w0.tpd, 0), sumW1 = pl.rows.reduce((a, r) => a + r.w1.tpd, 0);
    t += `<tr><td class="l"><b>합계</b></td><td>${n0(sumW0)} → <b>${n0(sumW1)}</b></td><td>${delta(pct(sumW1, sumW0))}</td><td colspan="4"></td></tr></tbody></table></div>`;
    let body = t + '<div class="grid2" style="margin-top:14px"><div class="chart" id="c-pl-trend"></div><div class="chart" id="c-pl-plan"></div></div>';
    const pa = S.plan;
    if (pa) {
      body += '<div class="grid2" style="margin-top:6px"><div><h3>4분기 부서별 계획 대비 실적 (~' + md(pa.t0) + ')</h3><div class="scroll"><table class="t"><thead><tr><th>부서</th><th>계획 t</th><th>실적 t</th><th>달성률</th></tr></thead><tbody>' +
        pa.byDept.filter((d) => d[1] || d[2]).map((d) => `<tr><td class="l">${esc(d[0])}</td><td>${n0(d[1])}</td><td><b>${n0(d[2])}</b></td><td>${d[1] ? Math.round((d[2] / d[1]) * 100) + '%' : '-'}</td></tr>`).join('') +
        `<tr><td class="l"><b>합계</b></td><td>${n0(pa.planT)}</td><td><b>${n0(pa.actualT)}</b></td><td>${pa.planT ? Math.round((pa.actualT / pa.planT) * 100) + '%' : '-'}</td></tr></tbody></table></div>` +
        `<p class="hint">재계획 결과: 지연 ${n0(pa.late)}t·결품 ${pa.short.length ? pa.short.length + '건' : '0'} · 남은 기간 강종전환 ${pa.remainMC}회${pa.optimal ? ' · 최적해' : ''}</p></div>` +
        '<div><h3>강종전환 일정</h3><div class="scroll"><table class="t"><thead><tr><th>일자</th><th>라인</th><th>전환</th></tr></thead><tbody>' +
        pa.upcomingMC.map((m) => `<tr><td class="l">${md(m.day)}</td><td class="l">${m.line}</td><td class="l">${esc(m.from)} → ${esc(m.to)}</td></tr>`).join('') + '</tbody></table></div></div></div>';
    }
    const pr = pl.params;
    body += '<h3>계획 조건 vs 13주 실적</h3><div class="scroll"><table class="t"><thead><tr><th>항목</th>' + Object.keys(pr).map((l) => `<th>${l} 현재 조건</th><th>${l} 실적</th>`).join('') + '</tr></thead><tbody>' +
      [['강종전환 손실 (분/회)', 'mc'], ['설비정지 (분/일)', 'equipDown'], ['비강종 더미 (분/일)', 'dummy']].map(([nm, k]) =>
        `<tr><td class="l">${nm}</td>` + Object.keys(pr).map((l) => `<td>${n1(pr[l].cur && pr[l].cur[k])}</td><td><b>${n1(pr[l][k])}</b></td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
    body += notes(N.plating);
    h += card('2', '도금 1·2CGL', w1, body);

    // 3. 컬러
    const co = S.color;
    if (co) {
      let ct = `<div class="scroll"><table class="t"><thead><tr><th>라인</th><th>생산 t/일<br><span class="muted">12주 → 보고 주</span></th><th>증감</th><th>가동일</th><th>속도 t/hr<br><span class="muted">휴지 포함</span></th><th>가동일당 휴지 h</th><th>보고 주 주요 품목 (t)</th></tr></thead><tbody>`;
      co.rows.forEach((r, k) => {
        ct += `<tr><td class="l"><span class="sw" style="background:var(${SER[k]})"></span>${r.line}</td><td>${n0(r.w0.tpd)} → <b>${n0(r.w1.tpd)}</b></td><td>${delta(r.dTpd)}</td><td>${r.w1.days}/7</td>
          <td>${n1(r.w0.tph)} → ${n1(r.w1.tph)}</td><td>${n1(r.w0.stopH)} → ${n1(r.w1.stopH)}</td><td class="l">${r.top.map((x) => `${esc(x[0])} ${n0(x[1])}`).join(' · ')}</td></tr>`;
      });
      const c0 = co.rows.reduce((a, r) => a + r.w0.tpd, 0), c1 = co.rows.reduce((a, r) => a + r.w1.tpd, 0);
      ct += `<tr><td class="l"><b>합계</b></td><td>${n0(c0)} → <b>${n0(c1)}</b></td><td>${delta(pct(c1, c0))}</td><td colspan="4"></td></tr></tbody></table></div>`;
      ct += '<div class="grid2" style="margin-top:14px"><div class="chart" id="c-co-trend"></div><div class="chart" id="c-co-stop"></div></div>';
      ct += '<h3>휴지 구성 (4라인 합, 시간/일)</h3><div class="scroll"><table class="t"><thead><tr><th>구분</th><th>12주 평균</th><th>보고 주</th><th>증감</th></tr></thead><tbody>' +
        co.stops.map((s, k) => `<tr><td class="l"><span class="sw" style="background:var(${SER[k]})"></span>${esc(s.cat)}</td><td>${n1(s.w0)}</td><td><b>${n1(s.w1)}</b></td><td>${delta(pct(s.w1, s.w0), false)}</td></tr>`).join('') + '</tbody></table></div>';
      ct += notes(N.color);
      h += card('3', '컬러 1~4CCL', w1, ct);
    }

    // 4. 출하
    const sh = S.ship;
    if (sh) {
      let st = '<div class="grid2"><div><div class="scroll"><table class="t"><thead><tr><th>구분</th><th>12주 평균 t/일</th><th>보고 주 t/일</th><th>증감</th></tr></thead><tbody>' +
        sh.rows.map((r, k) => `<tr><td class="l"><span class="sw" style="background:var(${SER[k]})"></span>${esc(r.kind)}</td><td>${n0(r.w0)}</td><td><b>${n0(r.w1)}</b></td><td>${delta(r.d)}</td></tr>`).join('') +
        `</tbody></table></div>${notes(N.ship)}</div><div class="chart" id="c-ship"></div></div>`;
      h += card('4', '출하', w1, st);
    }

    // 5. 이슈·할 일
    let ia = '';
    if (N.issues && N.issues.length) ia += '<h3 style="margin-top:0">이슈</h3>' + N.issues.map((t) => `<div class="issue">${esc(t)}</div>`).join('');
    if (N.actions && N.actions.length) ia += '<h3>결정·조치 필요</h3><ol class="actions">' + N.actions.map((t) => `<li>${esc(t)}</li>`).join('') + '</ol>';
    if (ia) h += card('5', '이슈 및 조치', '', ia);
    $('r-main').innerHTML = h;

    // 그래프
    const wl = (arr) => arr.map((x) => md(x.week));
    const tp = pl.trend, tl = Object.keys(tp);
    $('c-pl-trend').insertAdjacentHTML('beforebegin', '');
    chartBox('c-pl-trend', '도금 주별 생산량 (t/일)', (el) => lineChart(el, { x: wl(tp[tl[0]]), unit: 't/일', series: tl.map((l) => ({ name: l, v: tp[l].map((x) => x.tpd) })) }));
    if (pa) {
      const days = [...new Set(Object.values(pa.cum).flat().map((x) => x.day))].sort();
      const sumBy = (key) => days.map((d) => Object.values(pa.cum).reduce((a, arr) => { const e = arr.filter((x) => x.day <= d).pop(); return a + (e ? e[key] : 0); }, 0));
      chartBox('c-pl-plan', '4분기 누적 생산 — 계획 vs 실적 (t)', (el) => lineChart(el, { x: days.map(md), unit: 't', yMin: 0, series: [{ name: '계획', v: sumBy('plan'), color: 'var(--plan)', dash: true }, { name: '실적', v: sumBy('actual'), color: 'var(--s1)' }] }));
    }
    if (co) {
      const ctp = co.trend, cl = Object.keys(ctp);
      chartBox('c-co-trend', '컬러 주별 생산량 (t/일)', (el) => lineChart(el, { x: wl(ctp[cl[0]]), unit: 't/일', yMin: 0, series: cl.map((l) => ({ name: l, v: ctp[l].map((x) => x.tpd) })) }));
      chartBox('c-co-stop', '컬러 주별 휴지 구성 (4라인 합, 시간/일)', (el) => stackChart(el, { x: wl(co.stopTrend), unit: 'h/일', cats: co.stops.map((s) => s.cat), data: co.stopTrend }));
    }
    if (sh) chartBox('c-ship', '주별 출하 (t/일)', (el) => lineChart(el, { x: wl(sh.trend), unit: 't/일', yMin: 0, series: sh.rows.map((r) => ({ name: r.kind, v: sh.trend.map((x) => x[r.kind]) })) }));
  }
  function chartBox(id, title, draw) {
    const el = $(id); if (!el) return;
    const holder = document.createElement('div'); el.innerHTML = `<p class="ttl">${esc(title)}</p>`; el.appendChild(holder); draw(holder);
  }

  // ---------- 열기 ----------
  let env = null;
  async function open(pw) {
    $('r-msg').textContent = '여는 중…';
    try {
      const o = await GP.decryptJSON(env, pw);
      if (o.version !== 2) { $('r-msg').innerHTML = '이 보고서는 이전 형식입니다. <a href="analysis.html">분석 화면</a>에서 보세요.'; return; }
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 저장 불가 */ }
      render(o);
    } catch (e) { $('r-msg').textContent = '⚠ ' + e.message; try { localStorage.removeItem(PW_KEY); } catch (x) { /* 무시 */ } $('r-form').hidden = false; }
  }
  $('r-form').onsubmit = (ev) => { ev.preventDefault(); open($('r-pw').value); };
  const src = new URLSearchParams(location.search).get('src') || 'published/weekly_report.enc.json';
  fetch(src, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('보고서 파일 없음'); return r.json(); }).then((e) => {
    env = e;
    document.querySelector('#r-lock h2').textContent = '주간 보고서 — 분석 암호를 입력하세요';
    $('r-form').hidden = false;
    let saved = null; try { saved = localStorage.getItem(PW_KEY); } catch (x) { saved = null; }
    if (saved) open(saved);
  }).catch((e) => { document.querySelector('#r-lock h2').textContent = '아직 게시된 주간 보고서가 없습니다'; $('r-msg').textContent = e.message; });
})();
