/* 컬러 조건 분석 — 도금 조건 분석(analysis.html · analysis.js)과 같은 양식·같은 클래스
   자료: published/color_cond.enc.json (cglplan/color_cond.py, 매일 재계산) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => (v == null || isNaN(v) ? '-' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  const pc = (d) => (d == null ? '-' : `${d > 0 ? '+' : ''}${fmt(d * 100, 1)}%`);

  function render(a) {
    $('a-empty').hidden = true; $('a-body').hidden = false;
    $('a-meta').textContent = [`분석 ${String(a.built).replace('T', ' ')}`, `실적 ~${md(a.asOf)}`, `계획 조건 = ${a.planFrom} ~ ${a.planTo} 실적 속도`].join(' · ');
    $('a-period').textContent = `— 실적 ${a.period.from} ~ ${a.period.to} (13주)`;
    $('a-lines').innerHTML = Object.entries(a.lines).map(([l, x]) => `<div class="line-card"><h3>${l}</h3><dl>
      <dt>제품 생산</dt><dd>${fmt(x.tons)}t · 코일 ${fmt(x.coils)}개</dd>
      <dt>기간</dt><dd>${fmt(x.days)}일 (가동 ${fmt(x.opDays)}일)</dd>
      <dt>작업 비율</dt><dd>${x.util != null ? fmt(x.util * 100, 1) + '%' : '-'} <small class="muted">(작업 ÷ 작업 + 정지)</small></dd>
      <dt>속도</dt><dd>${fmt(x.tph13, 2)} t/hr <small class="muted">(계획 조건 ${fmt(x.tphPlan, 2)})</small></dd>
      <dt>최근 4주</dt><dd>${fmt(x.tph4, 2)} t/hr · 품목 구성 감안 <b>${pc(x.idx4 - 1)}</b></dd>
      <dt>휴지</dt><dd>${fmt(x.stopPerDay, 1)}시간/가동일</dd>
      <dt>휴지 구성</dt><dd>${x.stops.map(([c, h]) => `${esc(c)} ${fmt(h, 1)}h`).join(' · ') || '-'}</dd></dl></div>`).join('');
    const warn = Object.entries(a.lines).filter(([, x]) => x.idx4 != null && Math.abs(x.idx4 - 1) >= 0.05).map(([l, x]) => `${l} 최근 4주 속도가 계획 조건보다 ${pc(x.idx4 - 1)} — 계획 조건 조정 검토`);
    $('a-warns').innerHTML = warn.map((m) => `<li class="warn">경고 · ${esc(m)}</li>`).join('');
    const v = (c, x) => (x == null ? '-' : c.kind === 'line' ? fmt(x * 100, 1) + '%' : fmt(x, 2));
    $('a-cands').innerHTML = '<tr><th>항목</th><th>계획</th><th>실적(4주)</th><th>차이</th><th>근거</th><th>판정</th></tr>' + a.cands.map((c) =>
      `<tr><td>${esc(c.label)} <small class="muted">${esc(c.unit)}</small></td><td class="n">${v(c, c.cur)}</td><td class="n"><b>${v(c, c.act)}</b></td><td class="n ${c.flag ? 'neg' : ''}">${pc(c.diff)}</td>`
      + `<td class="muted">${esc(c.basis || '')}</td><td>${c.apply ? '<span class="pill warn">반영 권장</span>' : c.flag ? '<span class="pill">검토</span>' : '유지'}</td></tr>`).join('');
    renderWeekly(a);
    const lines = Object.keys(a.lines), weeks = a.weeks.slice(-13);
    $('a-events').innerHTML = `<tr><th>주</th>${lines.map((l) => `<th>${l}</th>`).join('')}</tr>` + weeks.map((w) => `<tr><td>${md(w)}~</td>${lines.map((l) => {
      const r = a.wstop.find((x) => x[0] === w && x[1] === l); return `<td class="n">${r && r[3] ? fmt(r[2] / r[3], 1) : '-'}</td>`; }).join('')}</tr>`).join('');
    const RS = a.reasons || [];
    $('a-reason-card').hidden = !RS.length;
    const days = Object.fromEntries(Object.entries(a.lines).map(([l, x]) => [l, x.opDays || 1]));
    $('a-reasons').innerHTML = '<tr><th>라인</th><th>구분</th><th>사유</th><th>분</th><th>건</th><th>분/일</th></tr>' + RS.map((x) =>
      `<tr><td>${x.line}</td><td>${esc(x.kind)}</td><td>${a.hasNames ? esc(x.reason) : `코드 ${esc(x.code)} <small class="muted">예: ${esc(x.reason)}</small>`}</td><td class="n">${fmt(x.minutes)}</td><td class="n">${x.n}</td><td class="n">${fmt(x.minutes / days[x.line], 1)}</td></tr>`).join('');
    if (!a.hasNames) $('a-rs-note').textContent += ' 사유 코드 이름은 다음 자동 갱신부터 표시(현재는 코드와 메모 예시).';
    if (window.UI) UI.reveal(document.querySelector('main'));
  }

  function renderWeekly(a) {
    const W = a.weekly, weeks = a.weeks.slice(-13);
    const keys = [...new Set(W.map((r) => `${r[1]}|${r[2]}`))].sort((x, y) => (x.split('|')[0] === y.split('|')[0] ? 0 : x < y ? -1 : 1));
    const cell = (k, w) => {
      const r = W.find((x) => x[0] === w && `${x[1]}|${x[2]}` === k);
      if (!r || !(r[4] > 0)) return '<td class="n muted">-</td>';
      const rate = r[3] / r[4], c = a.cur[k], d = c ? rate / c - 1 : 0;
      return `<td class="n ${d <= -0.05 ? 'neg' : d >= 0.05 ? 'pos' : ''}" title="${fmt(r[3])}t · ${r[5]}코일">${fmt(rate, 1)}</td>`;
    };
    $('a-weekly').innerHTML = `<tr><th>라인·품명</th>${weeks.map((w) => `<th>${md(w)}~</th>`).join('')}<th>계획 조건</th></tr>`
      + keys.map((k) => `<tr><td>${k.split('|').join(' ')}</td>${weeks.map((w) => cell(k, w)).join('')}<td class="n">${a.cur[k] ? fmt(a.cur[k], 1) : '-'}</td></tr>`).join('');
    const lines = Object.keys(a.lines);
    $('a-wtons').innerHTML = `<tr><th>주</th>${lines.map((l) => `<th>${l}</th>`).join('')}</tr>` + weeks.map((w) => `<tr><td>${md(w)}~</td>${lines.map((l) => `<td class="n">${fmt(W.filter((r) => r[0] === w && r[1] === l).reduce((s, r) => s + r[3], 0))}</td>`).join('')}</tr>`).join('');
  }

  let env = null;
  const envReady = GP.latest('color_cond.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;
    try { const a = await GP.decryptJSON(env, pw); try { if ($('a-remember').checked) localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } render(a); }
    catch (e) { $('a-unlock').hidden = false; $('a-empty-title').textContent = '분석 결과 열기'; $('a-unlock-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; }
  }
  $('a-unlock').addEventListener('submit', (e) => { e.preventDefault(); unlock($('a-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else { $('a-unlock').hidden = false; $('a-empty-title').textContent = '분석 결과 열기'; }
  }).catch(() => { $('a-empty-title').textContent = '아직 분석 결과가 없습니다'; });
})();
