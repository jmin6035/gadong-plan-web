/* 컬러 가동 현황: published/integrated.enc.json 의 컬러 부분(tools/integrated_web.py) — 도금 가동 현황(status.html)과 같은 역할
   ① 핵심 ② 월별 간트(라인 × 날짜, 그룹 누적) ③ 라인 한도·편성 | 그룹 × 월 ④ 미편성 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const LINES = ['1CCL', '2CCL', '3CCL', '4CCL'];
  const CG = ['계획재', '주문재', '건재수출', '가전수출', '가전내수', '수요개발'];
  const GCOL = Object.fromEntries(CG.map((g, i) => [g, `var(--s${i + 1})`]));
  const MONTHS = ['2026-10', '2026-11', '2026-12'];
  let O = null, mon = null;
  const card = (id, title, sm, unit, body) => `<section class="card" id="${id}"><h2>${esc(title)} ${sm ? `<small>${esc(sm)}</small>` : ''}${unit ? `<span class="unit">${unit}</span>` : ''}</h2>${body}</section>`;
  const tip = () => $('ca-tip');
  function bindTip(root) {
    root.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('mousemove', (e) => { const t = tip(); t.innerHTML = el.dataset.tip; t.style.display = 'block'; t.style.left = Math.min(innerWidth - 320, e.clientX + 14) + 'px'; t.style.top = (e.clientY - 12) + 'px'; });
      el.addEventListener('mouseleave', () => { tip().style.display = 'none'; });
    });
  }
  const C = () => O.color;
  const tot = (c) => Object.values(c.g).reduce((a, b) => a + b, 0);
  const monT = (m, l) => C().filter((c) => c.d.startsWith(m) && (!l || c.l === l)).reduce((a, c) => a + tot(c), 0);
  const lastAct = () => C().filter((c) => c.act).reduce((a, c) => (c.d > a ? c.d : a), '');

  function kpis() {
    const q = MONTHS.reduce((a, m) => a + monT(m), 0), la = lastAct(), m0 = la.slice(0, 7) || MONTHS[0];
    const cap = LINES.reduce((a, l) => a + ((O.colorLines[m0] || {})[l] || {}).plan || 0, 0);
    const done = C().filter((c) => c.act && c.d.startsWith(m0)).reduce((a, c) => a + tot(c), 0);
    const un = O.colorUnplaced.reduce((a, u) => a + u.t, 0);
    const pl = C().reduce((a, c) => a + (c.g['계획재'] || 0), 0);
    const k = (tone, l, v, unit, b) => `<div class="kpi tone-${tone}"><div class="l">${l}</div><div class="v"><b data-count="${Math.round(v)}">0</b><small>${unit}</small></div><div class="b">${b}</div></div>`;
    return `<div class="kpis">${k('brand', '4분기 컬러 계획', q, 't', MONTHS.map((m) => `${+m.slice(5)}월 ${n0(monT(m))}`).join(' · '))}
      ${k('good', `${+m0.slice(5)}월 실적 (~${md(la)})`, done, 't', `${+m0.slice(5)}월 계획 ${n0(monT(m0))}t · MES 월차 ${n0(cap)}t`)}
      ${k(un > 1000 ? 'warn' : 'good', '미편성 (라인에 못 넣은 물량)', un, 't', MONTHS.map((m) => `${+m.slice(5)}월 ${n0(O.colorUnplaced.filter((u) => u.ym === m).reduce((a, u) => a + u.t, 0))}`).join(' · '))}
      ${k('brand', '계획재 (R15)', pl, 't', `4분기 계획의 ${Math.round(pl / q * 100)}%`)}</div>`;
  }

  function gantt() {
    const m = mon, nd = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate();
    const W = 1200, pl0 = 70, pr = 10, rowH = 74, pt = 26, H = pt + rowH * LINES.length + 8, cw = (W - pl0 - pr) / nd;
    const recs = C().filter((c) => c.d.startsWith(m));
    const mx = Math.max(1, ...recs.map(tot));
    let g = '';
    for (let d = 1; d <= nd; d++) {
      const ds = `${m}-${String(d).padStart(2, '0')}`, wd = new Date(ds + 'T00:00:00').getDay();
      g += `<text x="${pl0 + (d - 0.5) * cw}" y="16" text-anchor="middle" class="${wd === 0 || wd === 6 ? 'we' : ''}">${d}</text>`;
    }
    LINES.forEach((l, i) => {
      const y0 = pt + i * rowH;
      g += `<text x="${pl0 - 10}" y="${y0 + rowH / 2 + 5}" text-anchor="end" class="lab">${l}</text><line class="gl" x1="${pl0}" x2="${W - pr}" y1="${y0 + rowH}" y2="${y0 + rowH}"/>`;
      for (let d = 1; d <= nd; d++) {
        const ds = `${m}-${String(d).padStart(2, '0')}`, c = recs.find((r) => r.d === ds && r.l === l), x = pl0 + (d - 1) * cw + 1.5, w = cw - 3;
        if (!c || tot(c) <= 0) { g += `<rect x="${x}" y="${y0 + 6}" width="${w}" height="${rowH - 12}" rx="3" fill="var(--grid)" opacity=".45" data-tip="<b>${l} ${md(ds)}</b><br>가동 없음"/>`; continue; }
        const T = tot(c), hh = (rowH - 12) * Math.max(0.25, T / mx); let yy = y0 + rowH - 6;
        CG.forEach((gr) => { const v = c.g[gr] || 0; if (!v) return; const h = hh * v / T; yy -= h; g += `<rect class="bar" style="--i:${d}" x="${x}" y="${yy}" width="${w}" height="${Math.max(0.5, h - 0.6)}" fill="${GCOL[gr]}" opacity="${c.act ? 0.55 : 1}"/>`; });
        const top = (c.rows || []).slice().sort((a, b) => b[5] - a[5]).slice(0, 5).map((r) => `${esc(r[0])} · ${esc(r[1])}${r[2] ? ' ' + esc(r[2]) : ''} ${n0(r[5])}t`).join('<br>');
        g += `<rect class="hit" x="${x}" y="${y0 + 4}" width="${w}" height="${rowH - 8}" data-tip="<b>${l} ${md(ds)}${c.act ? ' 실적' : ' 계획'}</b> ${n0(T)}t<br>${CG.filter((gr) => c.g[gr]).map((gr) => `${gr} ${n0(c.g[gr])}t`).join(' · ')}${top ? '<br><span style=&quot;opacity:.75&quot;>' + top + '</span>' : ''}"/>`;
      }
    });
    const tabs = MONTHS.map((x) => `<button type="button" data-m="${x}" aria-pressed="${x === m}">${+x.slice(5)}월</button>`).join('');
    return card('cs-gantt', '월별 간트', '라인 × 날짜 · 막대 높이 = 그날 톤, 색 = 그룹 · 흐린 막대 = 실적(지난 날), 진한 막대 = 계획 · 막대에 마우스를 올리면 품목', '단위: 톤',
      `<div class="seg" id="cs-m">${tabs}</div><div class="legend" style="margin-top:10px">${CG.map((gr) => `<span><i class="box" style="background:${GCOL[gr]}"></i>${gr}</span>`).join('')}</div><div class="chart"><svg viewBox="0 0 ${W} ${H}" class="cv" role="img" aria-label="컬러 월별 간트">${g}</svg></div>`);
  }

  function lineMonth() {
    const rows = LINES.map((l) => `<tr><td class="l nm">${l}</td>${MONTHS.map((m) => { const x = (O.colorLines[m] || {})[l] || {}; const gap = (x.plan || 0) - (x.placed || 0); return `<td>${n0(x.placed)} <small class="muted">/ ${n0(x.plan)}</small>${gap > 50 ? ` <span class="tag warn">−${n0(gap)}</span>` : ''}</td>`; }).join('')}</tr>`).join('');
    const sum = MONTHS.map((m) => LINES.reduce((a, l) => a + (((O.colorLines[m] || {})[l] || {}).placed || 0), 0));
    return card('cs-line', '라인별 편성 / MES 월차 한도', '', '단위: 톤', `<div class="scroll"><table class="t big"><thead><tr><th class="l">라인</th>${MONTHS.map((m) => `<th>${+m.slice(5)}월</th>`).join('')}</tr></thead><tbody>${rows}
      <tr class="total"><td class="l">계</td>${sum.map((v) => `<td>${n0(v)}</td>`).join('')}</tr></tbody></table></div><p class="small">편성 = 계획에 들어간 톤(지난 날은 실적), 한도 = MES 월차계획 라인별 톤. 빨간 표 = 한도보다 덜 채운 양(팔 물량이 그 라인에 없음).</p>`);
  }
  function groupMonth() {
    const v = (g, m) => C().filter((c) => c.d.startsWith(m)).reduce((a, c) => a + (c.g[g] || 0), 0);
    const rows = CG.map((g) => `<tr><td class="l nm"><i class="dot" style="background:${GCOL[g]}"></i>${g}</td>${MONTHS.map((m) => `<td>${n0(v(g, m))}</td>`).join('')}<td><b>${n0(MONTHS.reduce((a, m) => a + v(g, m), 0))}</b></td></tr>`).join('');
    return card('cs-grp', '그룹별 물량', '', '단위: 톤', `<div class="scroll"><table class="t big"><thead><tr><th class="l">그룹</th>${MONTHS.map((m) => `<th>${+m.slice(5)}월</th>`).join('')}<th>4분기</th></tr></thead><tbody>${rows}
      <tr class="total"><td class="l">계</td>${MONTHS.map((m) => `<td>${n0(monT(m))}</td>`).join('')}<td>${n0(MONTHS.reduce((a, m) => a + monT(m), 0))}</td></tr></tbody></table></div>`);
  }
  function unplaced() {
    const U = O.colorUnplaced.slice().sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : b.t - a.t));
    const rows = U.map((u) => `<tr><td class="l">${+u.ym.slice(5)}월</td><td class="l nm">${esc(u.g)}</td><td class="l">${esc(u.p)}</td><td class="l">${esc(u.c || '')}${u.dest ? ' · ' + esc(u.dest) : ''}</td><td class="l">${esc(u.lines || '')}</td><td><b>${n0(u.t)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="muted">없음</td></tr>';
    return card('cs-un', '미편성', `${U.length}건 · 가능 라인이 그 달 한도·시간을 다 써서 못 넣은 물량`, '단위: 톤', `<div class="scroll" style="max-height:520px"><table class="t"><thead><tr><th class="l">월</th><th class="l">그룹</th><th class="l">품명</th><th class="l">고객·목적지</th><th class="l">가능 라인</th><th>톤</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">처리: 다음 달로 넘기기, 가능 라인 늘리기(필수재 규칙 확인), 월차 한도 조정 중 결정 필요. 일별 품목·배치 이유는 <a href="integrated.html">통합 가동계획</a> 일별 가동 표에서 칸을 눌러 확인.</p>`);
  }

  function render() {
    $('ca-main').innerHTML = `<section class="card" id="ca-kpi"><h2>핵심 <small>확정 계획(컬러 계획재 R15 반영) · 실적 ~${md(lastAct())}</small><span class="unit">단위: 톤</span></h2>${kpis()}</section>`
      + gantt() + `<div class="grid2 rowc">${lineMonth()}${groupMonth()}</div>` + unplaced();
    $('ca-meta').innerHTML = `<span><b>계획</b>2026년 10~12월</span><span><b>실적</b>~${lastAct()}</span><span><b>계산</b>${String(O.built || '').replace('T', ' ')}</span>`;
    UI.reveal($('ca-main')); UI.count($('ca-main')); bindTip($('ca-main'));
    wire();
  }
  function wire() { document.querySelectorAll('#cs-m button').forEach((b) => b.addEventListener('click', () => { mon = b.dataset.m; $('cs-gantt').outerHTML = gantt(); bindTip($('cs-gantt')); wire(); })); }
  let env = null;
  const envReady = GP.latest('integrated.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;
    if (pw) { $('ca-lockbox').hidden = true; $('ca-skel').hidden = false; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } mon = (lastAct() || MONTHS[0]).slice(0, 7); if (!MONTHS.includes(mon)) mon = MONTHS[0]; render(); }
    catch (e) { $('ca-lockbox').hidden = false; $('ca-skel').hidden = true; $('ca-form').hidden = false; $('ca-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('ca-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('ca-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else $('ca-form').hidden = false;
  }).catch(() => { $('ca-msg').textContent = '자료를 찾을 수 없습니다'; });
})();
