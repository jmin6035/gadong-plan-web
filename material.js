/* 소재 발주: published/material.enc.json (tools/material_order.py --out)
   ① 발주 임박·확인 필요 ② 업체 × 월 입고 필요(셀 = 수량·마감) ③ 업체 상세(월별 사용·입고·재고, 리드타임, 품명) ④ 기준 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const pc = (v) => Math.round(v * 100) + '%';
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const PLANT = { G: '도금 FH', C: '컬러 구매소재' };
  let O = null, plant = 'all', sel = null, fsel = 2;

  const card = (id, num, title, sm, body) => `<section class="card" id="${id}"><h2><span class="n">${num}</span> ${esc(title)} ${sm ? `<small>${esc(sm)}</small>` : ''}</h2>${body}</section>`;
  const days = (d) => Math.round((new Date(d) - new Date(O.today)) / 864e5);
  const forTop = (m, k) => { const t = (m.for || []).reduce((a, x) => a + x[3], 0) || 1; return (m.for || []).slice(0, k).map((x) => `${x[0]} ${x[1]}${x[2] ? '(' + x[2] + ')' : ''} ${Math.round(x[3] / t * 100)}%`).join(', '); };
  const items = (r) => Object.entries(r.items).map(([k, v]) => `${k} ${pc(v)}`).join(' · ') || '-';

  function urgent() {
    const L = [];
    O.rows.filter((r) => UI.inScope(r.plant)).forEach((r) => r.months.forEach((m) => { if (m.arrive >= 1) L.push({ r, m, d: days(m.orderBy) }); }));
    const soon = L.filter((x) => x.d >= 0 && x.d <= 45).sort((a, b) => a.d - b.d);
    const past = L.filter((x) => x.d < 0 && x.m.ym >= O.months[2]).sort((a, b) => b.m.arrive - a.m.arrive);
    const row = (x) => `<tr><td class="dd ${x.d < 0 ? 'dl-past' : x.d <= 7 ? 'dl-soon' : ''}">${md(x.m.orderBy)} <span class="muted">(${x.d < 0 ? -x.d + '일 지남' : 'D-' + x.d})</span></td><td class="l">${esc(x.r.name)} <span class="muted">${x.r.sup}</span></td><td class="l">${PLANT[x.r.plant]}</td><td class="l">${esc(items(x.r))}</td><td>${+x.m.ym.slice(5)}월</td><td><b>${n0(x.m.arrive)}</b></td><td class="muted">${md(x.m.orderRec)}</td><td class="l why">${esc(forTop(x.m, 3))}</td></tr>`;
    const head = '<thead><tr><th>발주 마감</th><th>업체</th><th>구분</th><th>소재</th><th>입고월</th><th>수량(t)</th><th>권장 발주</th><th>무엇을 만들려고(그 달 사용 기준 상위)</th></tr></thead>';
    const total = soon.reduce((a, x) => a + x.m.arrive, 0);
    return card('m-urg', '①', '발주 임박 — 앞으로 45일', `기준 ${O.today}`, `<p class="lead">45일 안에 마감되는 발주 ${soon.length}건, ${n0(total)}t. 가장 급한 건: ${soon[0] ? `${esc(soon[0].r.name)} ${+soon[0].m.ym.slice(5)}월분 ${n0(soon[0].m.arrive)}t (마감 ${md(soon[0].m.orderBy)})` : '없음'}</p>
      <div class="scroll"><table class="t urg">${head}<tbody>${soon.map(row).join('')}</tbody></table></div>
      <h3>마감이 이미 지난 12월 이후 입고분 — 발주돼 있는지 구매에 확인</h3>
      <div class="scroll"><table class="t urg">${head}<tbody>${past.slice(0, 12).map(row).join('')}</tbody></table></div>
      <p class="small">수량 = 그 달 사용 + 월말 목표재고 − 전월말 재고(기발주 미반영). 마감 = 입고월 1일 − 리드타임(실적 80%), 권장 = 마감 − 7일.</p>`);
  }

  function matrix() {
    const rows = O.rows.filter((r) => UI.inScope(r.plant));
    const chips = '';
    const tot = O.months.map((ym) => rows.reduce((a, r) => a + r.months.find((m) => m.ym === ym).arrive, 0));
    const body = rows.map((r, i) => `<tr data-i="${O.rows.indexOf(r)}" class="${sel === O.rows.indexOf(r) ? 'sel' : ''}"><td class="l nm">${esc(r.name)} <span class="muted">${r.sup}</span></td><td class="l muted">${PLANT[r.plant]}</td><td class="l">${esc(items(r))}</td><td>${r.lt.p80}일</td>${r.months.map((m) => { const d = days(m.orderBy); return `<td class="cell ${m.arrive >= 1 ? (d < 0 ? 'past' : d <= 45 ? 'soon' : '') : ''}">${m.arrive >= 1 ? n0(m.arrive) : '·'}${m.arrive >= 1 ? `<small>마감 ${md(m.orderBy)}</small>` : ''}</td>`; }).join('')}</tr>`).join('');
    return card('m-mx', '②', '업체 × 월 입고 필요', '셀 = 수량(t) · 발주 마감, 행을 누르면 상세', chips + `
      <div class="legend"><span><i class="box" style="background:var(--bad-bg)"></i>마감 지남(확인 필요)</span><span><i class="box" style="background:var(--warn-bg)"></i>45일 안 마감</span></div>
      <div class="scroll"><table class="t mx"><thead><tr><th class="l">업체</th><th class="l">구분</th><th class="l">소재</th><th>LT(80%)</th>${O.months.map((ym) => `<th>${ym.slice(2, 4)}.${+ym.slice(5)}월</th>`).join('')}</tr></thead>
      <tbody>${body}<tr><td class="l nm" colspan="4">합계</td>${tot.map((v) => `<td><b>${n0(v)}</b></td>`).join('')}</tr></tbody></table></div>
      <div class="detail" id="m-detail"></div>`);
  }

  function detail() {
    const el = $('m-detail'); if (!el) return;
    if (sel == null) { el.innerHTML = '<p class="small">업체 행을 누르면 월별 사용·입고·재고와 근거가 나옵니다.</p>'; return; }
    const r = O.rows[sel];
    el.innerHTML = `<h3>${esc(r.name)} (${r.sup}) — ${PLANT[r.plant]}</h3>
      <div class="kpis"><div class="kpi"><div class="l">9월말 재고</div><div class="v">${n0(r.begin)}<small>t</small></div><div class="b">목표 ${n0(r.target)}t</div></div>
      <div class="kpi"><div class="l">리드타임 실적</div><div class="v">${r.lt.med}<small>일 중앙</small></div><div class="b">80% ${r.lt.p80}일 · ${r.lt.n ? r.lt.n + '건' : '자료 없음 → 기본 60일'}</div></div>
      <div class="kpi"><div class="l">소재</div><div class="v" style="font-size:18px">${esc(items(r))}</div><div class="b">재고 소재 비중</div></div></div>
      <div class="scroll"><table class="t"><thead><tr><th>월</th><th>사용</th><th>입고 필요</th><th>월말 재고</th><th>권장 발주</th><th>발주 마감</th></tr></thead><tbody>${r.months.map((m) => `<tr><td class="l">${m.ym}</td><td>${n0(m.use)}</td><td><b>${n0(m.arrive)}</b></td><td>${n0(m.end)}</td><td>${md(m.orderRec)}</td><td class="${days(m.orderBy) < 0 && m.arrive >= 1 ? 'dl-past' : ''}">${md(m.orderBy)}${days(m.orderBy) < 0 && m.arrive >= 1 ? ' (지남)' : ''}</td></tr>`).join('')}</tbody></table></div>
      <h3>무엇을 만들기 위한 소재인가 — 월별 사용 내역(상위 12개)</h3>
      <div class="tabs" id="m-ftabs">${r.months.map((m, i) => `<button type="button" data-k="${i}" aria-pressed="${i === fsel}">${m.ym.slice(2, 4)}.${+m.ym.slice(5)}월</button>`).join('')}</div>
      <div class="scroll"><table class="t"><thead><tr><th>${r.plant === 'G' ? '도금 구분' : '컬러 그룹'}</th>${r.plant === 'G' ? '' : '<th>제품 품명</th><th>고객·지역</th>'}<th>소재 사용(t)</th><th>비중</th></tr></thead><tbody>${(() => { const m = r.months[fsel]; const t = (m.for || []).reduce((a, x) => a + x[3], 0) || 1; return (m.for || []).map((x) => `<tr><td class="l">${esc(x[0])}</td>${r.plant === 'G' ? '' : `<td class="l">${esc(x[1])}</td><td class="l">${esc(x[2] || '-')}</td>`}<td>${n0(x[3])}</td><td>${Math.round(x[3] / t * 100)}%</td></tr>`).join(''); })()}</tbody></table></div>
      <p class="small">사용 = ${r.plant === 'G' ? '도금 생산 ÷ 1.008 × 이 업체 FH 비중(9월말 재고 기준)' : '컬러 품명별 생산 × (1 − 자가재 비중) × 이 업체 비중(13주 실적, 원소재 번호 앞 2자리 → 업체)'}. 10~12월 = 통합 계획 일별, 1~3월 = TF 판매계획.</p>`;
  }

  function basis() {
    const u = O.util;
    return card('m-basis', '③', '생산 기준과 확인할 점', '', `<div class="scroll"><table class="t"><thead><tr><th>월</th>${O.months.map((ym) => `<th>${ym.slice(2, 4)}.${+ym.slice(5)}</th>`).join('')}</tr></thead><tbody>
      <tr data-pl="C"><td class="l">컬러 생산(t)</td>${O.months.map((ym) => `<td>${n0(O.colorProd[ym])}</td>`).join('')}</tr>
      <tr data-pl="G"><td class="l">도금 생산(t)</td>${O.months.map((ym) => `<td>${n0(O.platingProd[ym])}</td>`).join('')}</tr>
      <tr><td class="l">능력 대비(1~3월)</td>${O.months.map((ym) => `<td>${u[ym] ? `컬러 <b class="${u[ym].color > 1 ? 'neg' : ''}">${pc(u[ym].color)}</b><br>도금 ${pc(u[ym].plating)}` : ''}</td>`).join('')}</tr></tbody></table></div>
      <ul class="notes">
        <li>1~3월 컬러는 TF 판매계획대로면 MES 월차(24.4천t)를 넘음 → 컬러 소재도 그만큼 많게 잡힘. 컬러 건재 재고로 일부 흡수 가능</li>
        <li>12월 도금 FH 가 적은 건 V1 도금 계획의 12월 1CGL 공백 때문(결정에 따라 바뀜)</li>
        <li>리드타임은 재고현황 '주문일시 → 소재입고일' — 주문일시가 소재 발주일이 아니면 틀림(현대제철 167일 등 의심)</li>
        <li>기발주·입고예정이 없어 '입고 필요량' — <a href="doc.html?d=requests">전산팀 요청 사항</a> 참고</li></ul>`);
  }

  function render() {
    $('m-main').innerHTML = urgent() + matrix() + basis();
    UI.reveal($('m-main'));
    UI.sub(`${{ all: '', G: '도금 FH 보기 · ', C: '컬러 구매소재 보기 · ' }[UI.scope()]}컬러·도금 계획 → 소재 소요 → 업체·품명·수량·발주 마감 (26.10~27.3) · 기준 ${O.today} · 계산 ${String(O.built || '').replace('T', ' ')}`);
    document.querySelectorAll('#m-mx tr[data-i]').forEach((tr) => tr.addEventListener('click', () => { sel = +tr.dataset.i; document.querySelectorAll('#m-mx tr.sel').forEach((z) => z.classList.remove('sel')); tr.classList.add('sel'); detail(); }));
    detail();
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('#m-ftabs button'); if (b) { fsel = +b.dataset.k; detail(); } });

  let env = null;
  async function open(pw) {
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } render(); UI.onScope(() => { sel = null; const y = scrollY; render(); scrollTo(0, y); }); }
    catch (e) { $('m-form').hidden = false; $('m-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('m-form').addEventListener('submit', (e) => { e.preventDefault(); open($('m-pw').value); });
  fetch('published/material.enc.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((e) => {
    env = e; $('m-lock').querySelector('h2').textContent = '소재 발주 — 암호를 입력하세요';
    let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) open(s); else $('m-form').hidden = false;
  }).catch(() => { $('m-msg').textContent = '자료를 찾을 수 없습니다'; });
})();
