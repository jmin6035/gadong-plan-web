/* 컬러 가동 현황 — 도금 가동 현황(status.html · dashboard.js)과 같은 양식·같은 클래스
   자료: published/integrated.enc.json 의 컬러 부분(tools/integrated_web.py)
   요약 줄 → 핵심 지표 4 → 월별 가동계획 표(라인 합계·그룹·가동시간) → 라인별 편성 | 월별 부하 → 기준일 라인 현황 → 그룹별 월 생산량 → 상세(미편성) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => (v == null || isNaN(v) ? '-' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => WD[new Date(d + 'T00:00:00').getDay()];
  const LINES = ['1CCL', '2CCL', '3CCL', '4CCL'];
  const CG = ['계획재', '주문재', '건재수출', '가전수출', '가전내수', '수요개발'];
  const GL = (g) => (g === '주문재' ? '건재 주문재' : g);          // 판매계획 '③ 주문재' = 컬러건재(국내) 고객 주문 생산분(계획재 아님)
  const GVAR = Object.fromEntries(CG.map((g, i) => [g, `var(--s${i + 1})`]));
  const MONTHS = ['2026-10', '2026-11', '2026-12'];
  const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (f(x) || 0), 0);
  let O = null, by = {}, gMonth = null, lastAct = '', dn = {};
  const KN = { plan: '계획휴지', sd: 'S/D', repair: '수리', clean: '청소', test: 'Test', sample: '샘플' };
  const HARD = ['plan', 'sd', 'repair'];
  const fullDay = (l, d) => sum((dn[`${l}|${d}`] || []).filter((x) => HARD.includes(x[0])), (x) => x[1]) >= 1439;
  const dnTxt = (l, d) => (dn[`${l}|${d}`] || []).map((x) => `${KN[x[0]]} ${fmt(x[1])}분`).join(', ');

  const tot = (c) => sum(Object.values(c.g));
  const monT = (m, l) => sum(O.color.filter((c) => c.d.startsWith(m) && (!l || c.l === l)), tot);
  const cap = (m, l) => ((O.colorLines[m] || {})[l] || {}).plan || 0;
  const placed = (m, l) => ((O.colorLines[m] || {})[l] || {}).placed || 0;
  const load = (m, l) => (cap(m, l) ? placed(m, l) / cap(m, l) : 0);
  const unT = (m) => sum(O.colorUnplaced.filter((u) => !m || u.ym === m), (u) => u.t);
  const daysOf = (m) => { const [y, mo] = m.split('-').map(Number); const n = new Date(y, mo, 0).getDate(); return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`); };
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function render() {
    by = {}; for (const c of O.color) by[`${c.l}|${c.d}`] = c;
    dn = {}; for (const [d, l, k, mn] of O.colorDown || []) (dn[`${l}|${d}`] = dn[`${l}|${d}`] || []).push([k, mn]);
    lastAct = O.color.filter((c) => c.act).reduce((a, c) => (c.d > a ? c.d : a), '');
    $('d-empty').hidden = true; $('d-body').hidden = false;
    $('d-title').textContent = `'26.${MONTHS.map((m) => +m.slice(5)).join('·')}월 컬러 CCL 가동계획`;
    $('d-meta').textContent = [`확정 계획(계획재 = 운영안 반영)`, `계산 ${String(O.built).replace('T', ' ')}`, lastAct && `실적 ~${md(lastAct)}`, '계획 기간 2026-10-01 ~ 2026-12-31'].filter(Boolean).join(' · ');
    renderExec();
    const q = sum(MONTHS, (m) => monT(m)), pl = sum(O.color, (c) => c.g['계획재'] || 0);
    let mx = 0, mxK = ''; for (const l of LINES) MONTHS.forEach((m) => { const v = load(m, l); if (v > mx) { mx = v; mxK = `${+m.slice(5)}월 ${l}`; } });
    $('d-kpis').innerHTML = [
      [`${fmt(q)}t`, '4분기 컬러 생산', MONTHS.map((m) => `${+m.slice(5)}월 ${fmt(monT(m))}`).join(' · ')],
      [`${fmt(unT())}t`, '미편성', MONTHS.map((m) => `${+m.slice(5)}월 ${fmt(unT(m))}`).join(' · '), unT() > 500],
      [`${fmt(pl)}t`, '계획재', `4분기 생산의 ${fmt(pl / q * 100)}%`],
      [`${fmt(mx * 100, 1)}%`, '최대 월 부하', `${mxK} (편성 ÷ MES 월차)`, mx > 0.995],
    ].map(([v, l, sub, bad]) => `<div class="kpi ${bad ? 'bad' : ''}"><span class="kl">${l}</span><b>${v}</b><span class="ks">${sub}</span></div>`).join('');
    const leg = CG.map((g) => `<span><i class="sw" style="background:${GVAR[g]}"></i>${GL(g)}</span>`).join('') + '<span><i class="sw" style="background:var(--mc)"></i>휴지계획(S/D·청소·Test·샘플, 마우스를 올리면 시간)</span><span><i class="sw" style="background:var(--sd)"></i>종일 정지(수리·계획휴지) · 가동 없음</span>';
    $('g-legend').innerHTML = leg;
    $('g-tabs').innerHTML = MONTHS.map((m, i) => `<button type="button" data-g="${i}">${+m.slice(5)}월</button>`).join('');
    const t0 = localToday(), ti = MONTHS.indexOf(t0.slice(0, 7)), la = MONTHS.indexOf(lastAct.slice(0, 7));
    renderGantt(gMonth == null ? (ti >= 0 ? ti : la >= 0 ? la : 0) : gMonth);
    renderEvents(); renderLoad(); renderDept(); renderEarly();
    if (!$('d-date').value) $('d-date').value = lastAct && t0 > '2026-12-31' ? lastAct : (t0 < '2026-10-01' || t0 > '2026-12-31' ? '2026-10-01' : t0);
    $('d-date').min = '2026-10-01'; $('d-date').max = '2026-12-31';
    renderNow();
    if (window.UI) UI.reveal(document.querySelector('main'));
  }

  function renderExec() {
    const risks = [];
    for (const l of LINES) MONTHS.forEach((m) => { const g = cap(m, l) - placed(m, l); if (g > 50) risks.push(`${+m.slice(5)}월 ${l} 편성 ${fmt(placed(m, l))}t — MES 월차 ${fmt(cap(m, l))}t보다 ${fmt(g)}t 적음(그 라인에 만들 물량 부족)`); });
    MONTHS.forEach((m) => { const u = unT(m); if (u > 50) risks.push(`${+m.slice(5)}월 미편성 ${fmt(u)}t — 가능 라인 한도·시간 초과(${[...new Set(O.colorUnplaced.filter((x) => x.ym === m).map((x) => x.g))].join('·')})`); });
    const q = sum(MONTHS, (m) => monT(m));
    $('d-exec').innerHTML = `<p class="headline">4분기 <b>${fmt(q)}t</b> · 미편성 <b>${fmt(unT())}t</b> · 계획재 <b>${fmt(sum(O.color, (c) => c.g['계획재'] || 0))}t</b> · 실적 ~${md(lastAct)}</p>`
      + (risks.length ? risks.map((t) => `<p class="risk">⚠ ${esc(t)}</p>`).join('') : '<p class="ok">✓ 미편성 없음, 모든 라인 월차 한도까지 편성</p>');
  }

  // ---------------- 월별 가동계획 표: 라인 합계 행 + 그룹 행 + 가동시간 (도금 표와 같은 클래스) ----------------
  function renderGantt(mi) {
    gMonth = mi;
    document.querySelectorAll('#g-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.g === mi));
    const m = MONTHS[mi], ds = daysOf(m), today = localToday();
    let h = `<colgroup><col class="cc0"><col class="cc1">${ds.map(() => '<col>').join('')}<col class="ctot"></colgroup><thead><tr><th class="c0" rowspan="2">라인</th><th class="c1" rowspan="2">구분</th>`
      + ds.map((d) => `<th class="${d === today ? 'today' : ''}">${+d.slice(8)}</th>`).join('') + '<th class="tot" rowspan="2">계</th></tr><tr>'
      + ds.map((d) => { const w = wd(d); return `<th class="wk ${w === '토' ? 'sat' : w === '일' ? 'sun' : ''}">${w}</th>`; }).join('') + '</tr></thead><tbody>';
    for (const l of LINES) {
      const gs = CG.filter((g) => ds.some((d) => ((by[`${l}|${d}`] || { g: {} }).g[g] || 0) > 0.5));
      const rows = [{ k: 'fam' }].concat(gs.map((g) => ({ k: 'dep', g })), [{ k: 'hrs' }]);
      rows.forEach((r, ri) => {
        h += `<tr class="r-${r.k}${ri === 0 ? ' first' : ''}">`;
        if (ri === 0) h += `<th class="c0 line" rowspan="${rows.length}">${l}</th>`;
        h += `<th class="c1">${r.k === 'fam' ? '<b>합계</b>' : r.k === 'dep' ? `<i class="sw" style="background:${GVAR[r.g]}"></i>${GL(r.g)}` : '가동시간(h)'}</th>`;
        let t = 0;
        const fdIdx = ds.map((d, i) => (fullDay(l, d) ? i : -1)).filter((i) => i >= 0);
        const runs = []; fdIdx.forEach((i) => { const r0 = runs[runs.length - 1]; if (r0 && r0[1] === i - 1) r0[1] = i; else runs.push([i, i]); });
        ds.forEach((d, i) => {
          const run = runs.find((x) => x[0] <= i && i <= x[1]);
          if (run) {
            if (ri === 0 && i === run[0]) { const k = (dn[`${l}|${d}`] || []).find((x) => HARD.includes(x[0])); h += `<td class="sdblock" colspan="${run[1] - run[0] + 1}" rowspan="${rows.length}" title="${esc(dnTxt(l, d))}">${KN[k ? k[0] : 'repair']} ${md(ds[run[0]])}${run[1] > run[0] ? '~' + md(ds[run[1]]) : ''}</td>`; }
            return;
          }
          const c = by[`${l}|${d}`], T = c ? tot(c) : 0, idle = T < 0.5;
          let v = 0, txt = '';
          if (r.k === 'fam') { v = T; txt = idle ? '' : fmt(v); }
          else if (r.k === 'dep') { v = c ? c.g[r.g] || 0 : 0; txt = v > 0.5 ? fmt(v) : ''; }
          else { const u = c ? c.min / 60 : 0; txt = u > 0 ? u.toFixed(1) : ''; }
          t += v;
          const part = dn[`${l}|${d}`];
          const cls = [idle ? 'idle' : '', part ? 'mc' : '', d === today ? 'today' : '', c && c.act ? 'act' : ''].filter(Boolean).join(' ');
          h += `<td class="${cls}" style="--ci:${i}" data-d="${d}"${part ? ` title="${esc(dnTxt(l, d))}"` : ''}>${txt}</td>`;
        });
        h += `<td class="tot">${r.k === 'hrs' ? '' : fmt(t)}</td></tr>`;
      });
    }
    $('g-table').innerHTML = h + '</tbody>';
    const wrap = document.querySelector('.gtable-wrap'), ti = ds.indexOf(today);
    if (wrap && wrap.scrollWidth > wrap.clientWidth) { const hs = $('g-table').querySelectorAll('thead tr:first-child th'), th = hs[2 + Math.max(0, ti - 1)], stick = hs[0].offsetWidth + hs[1].offsetWidth; wrap.scrollLeft = ti > 0 && th ? th.getBoundingClientRect().left - $('g-table').getBoundingClientRect().left - stick : 0; }
  }
  $('g-tabs').onclick = (ev) => { if (ev.target.dataset.g != null) renderGantt(+ev.target.dataset.g); };
  $('g-table').addEventListener('click', (ev) => { const td = ev.target.closest('td[data-d]'); if (!td) return; $('d-date').value = td.dataset.d; renderNow(); $('d-now').scrollIntoView({ behavior: 'smooth', block: 'center' }); });

  function renderEvents() {                                      // 도금 '강종 전환 일정' 자리: 라인별 편성 / MES 월차 한도
    $('d-events').innerHTML = `<tr><th>라인</th>${MONTHS.map((m) => `<th>${+m.slice(5)}월 편성 / 한도</th>`).join('')}</tr>`
      + LINES.map((l) => `<tr class="evrow"><td>${l}</td>${MONTHS.map((m) => { const g = cap(m, l) - placed(m, l); return `<td>${fmt(placed(m, l))} / ${fmt(cap(m, l))}${g > 50 ? ` <span class="pill warn">−${fmt(g)}</span>` : ''}</td>`; }).join('')}</tr>`).join('')
      + `<tr class="evrow"><td><b>계</b></td>${MONTHS.map((m) => `<td><b>${fmt(sum(LINES, (l) => placed(m, l)))}</b> / ${fmt(sum(LINES, (l) => cap(m, l)))}</td>`).join('')}</tr>`;
  }
  function renderLoad() {
    $('d-load').innerHTML = LINES.map((l) => `<div class="load-grp"><b>${l}</b>` + MONTHS.map((m) => {
      const v = load(m, l);
      return `<div class="load-row"><span>${+m.slice(5)}월</span><div class="load-track"><div class="load-fill ${v >= 0.995 ? 'full' : ''}" style="width:${Math.min(100, v * 100)}%"></div><div class="load-100"></div></div><span class="n">${fmt(v * 100, 1)}%</span></div>`;
    }).join('') + '</div>').join('') + '<p class="hint">부하 = 편성 ÷ MES 월차 한도. 강조 색 막대 = 한도까지 채움(100%). 오른쪽 세로선 = 100%.</p>';
  }

  function renderNow() {
    const d = $('d-date').value; if (!d) return;
    const m = d.slice(0, 7);
    $('d-now').innerHTML = LINES.map((l) => {
      const c = by[`${l}|${d}`], T = c ? tot(c) : 0;
      const gs = c ? Object.entries(c.g).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${GL(k)} ${fmt(v)}t`).join(', ') : '';
      const items = c ? c.rows.slice(0, 4).map((r) => `${esc(r[1])}${r[2] ? ' ' + esc(r[2]) : ''} ${fmt(r[5])}t`).join(', ') : '';
      const toDate = sum(O.color.filter((x) => x.l === l && x.d.startsWith(m) && x.d <= d), tot);
      const next = O.color.filter((x) => x.l === l && x.d > d && tot(x) < 0.5).map((x) => x.d)[0];
      const state = !c || T < 0.5 ? '<span class="pill">가동 없음</span>' : `<span class="pill ${c.act ? '' : 'warn'}">${c.act ? '실적' : '계획'}</span>`;
      return `<div class="line-card"><h3>${l} ${state}</h3><dl>
        <dt>${c && c.act ? '생산 실적' : '계획 생산'}</dt><dd>${T < 0.5 ? '-' : `${fmt(T)}t (가동 ${fmt((c.min || 0) / 60, 1)}h)`}</dd>
        <dt>그룹별</dt><dd>${gs || '-'}</dd>
        <dt>주요 품목</dt><dd>${items || '-'}</dd>
        <dt>휴지계획</dt><dd>${esc(dnTxt(l, d)) || '-'}</dd>
        <dt>다음 S/D·수리</dt><dd>${(() => { const nx = (O.colorDown || []).filter((x) => x[1] === l && x[0] > d && HARD.includes(x[2])).sort((a, b) => (a[0] < b[0] ? -1 : 1))[0]; return nx ? `${md(nx[0])} ${KN[nx[2]]} (D-${Math.round((new Date(nx[0]) - new Date(d)) / 864e5)})` : '분기 내 없음'; })()}</dd>
        <dt>다음 가동 없는 날</dt><dd>${next ? `${md(next)} (D-${Math.round((new Date(next) - new Date(d)) / 864e5)})` : '분기 내 없음'}</dd>
        <dt>${+m.slice(5)}월 누계</dt><dd>${fmt(toDate)} / ${fmt(monT(m, l))}t · 월차 ${fmt(cap(m, l))}t</dd>
      </dl></div>`;
    }).join('');
  }
  $('d-date').onchange = () => O && renderNow();

  function renderDept() {
    const t = {}; for (const c of O.color) for (const [g, v] of Object.entries(c.g)) { const k = `${g}|${c.d.slice(0, 7)}`; t[k] = (t[k] || 0) + v; }
    const un = {}; for (const u of O.colorUnplaced) un[u.g] = (un[u.g] || 0) + u.t;
    const mx = Math.max(...Object.values(t), 1);
    const cell = (v) => `<td class="n bar-cell"><i style="width:${(v / mx) * 100}%"></i><span>${fmt(v)}</span></td>`;
    $('d-dept').innerHTML = `<tr><th>그룹</th>${MONTHS.map((m) => `<th>${+m.slice(5)}월</th>`).join('')}<th>분기 생산</th><th>미편성</th><th>계획 물량(생산 + 미편성)</th></tr>`
      + CG.map((g) => { const v = MONTHS.map((m) => t[`${g}|${m}`] || 0); return `<tr><td><i class="sw" style="background:${GVAR[g]}"></i> ${GL(g)}</td>${v.map(cell).join('')}<td class="n"><b>${fmt(sum(v))}</b></td><td class="n">${fmt(un[g] || 0)}</td><td class="n">${fmt(sum(v) + (un[g] || 0))}</td></tr>`; }).join('')
      + `<tr><td><b>합계</b></td>${MONTHS.map((m) => `<td class="n"><b>${fmt(monT(m))}</b></td>`).join('')}<td class="n"><b>${fmt(sum(MONTHS, (m) => monT(m)))}</b></td><td class="n">${fmt(unT())}</td><td class="n">${fmt(sum(MONTHS, (m) => monT(m)) + unT())}</td></tr>`;
  }
  function renderEarly() {
    const U = O.colorUnplaced.slice().sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : b.t - a.t));
    $('d-early').innerHTML = '<tr><th>월</th><th>그룹</th><th>품명</th><th>고객·목적지</th><th>가능 라인</th><th>톤</th></tr>'
      + (U.map((u) => `<tr><td>${+u.ym.slice(5)}월</td><td>${esc(GL(u.g))}</td><td>${esc(u.p)}</td><td>${esc(u.c || '')}${u.dest ? ' · ' + esc(u.dest) : ''}</td><td>${esc(u.lines || '')}</td><td class="n">${fmt(u.t)}</td></tr>`).join('') || '<tr><td colspan="6">없음</td></tr>');
  }

  // ---------------- 자료 열기(분석 암호) ----------------
  let env = null;
  const envReady = GP.latest('integrated.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } render(); }
    catch (e) { $('d-unlock').hidden = false; $('d-unlock-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; }
  }
  $('d-unlock').addEventListener('submit', (e) => { e.preventDefault(); unlock($('d-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else $('d-unlock').hidden = false;
  }).catch(() => { $('d-empty-text').textContent = '게시된 통합 가동계획을 찾을 수 없습니다'; });
})();
