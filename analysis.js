/* 실적 분석 화면: 사내 PC 자동 실행기가 올린 분석 결과(analysis.enc.json, 분석 암호) 또는 직접 올린 MES 엑셀을 보여준다. */
(function () {
  const GP = window.GP;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PW_KEY = 'cgl-analysis-pw', P_KEY = 'cgl-plan-params-v1';
  const SRC = [GP.SUPABASE_URL + '/storage/v1/object/public/published/analysis.enc.json'];
  let A = null, env = null;

  const planParams = () => { let s = null; try { s = JSON.parse(localStorage.getItem(P_KEY) || 'null'); } catch (e) { s = null; } return Object.assign(GP.clone(GP.DEFAULT_PARAMS), s || {}); };

  function render(a, sourceNote) {
    A = a;
    $('a-empty').hidden = true; $('a-body').hidden = false;
    $('a-meta').textContent = [sourceNote, a.analyzedAt && `분석 ${new Date(a.analyzedAt).toLocaleString('ko-KR')}`, a.auto && a.auto.actualTo && `재계획 실적 ~${GP.md(a.auto.actualTo)}`].filter(Boolean).join(' · ');
    $('a-period').textContent = a.period ? `— 실적 ${a.period.from} ~ ${a.period.to}` : '';
    $('a-lines').innerHTML = Object.entries(a.lines).map(([l, x]) => `<div class="line-card"><h3>${l}</h3><dl>
      <dt>제품 생산</dt><dd>${GP.fmt(x.tons)}t · 코일 ${GP.fmt(x.coils)}개 (더미 ${GP.fmt(x.dummyT)}t)</dd>
      <dt>기간</dt><dd>${GP.fmt(x.days, 1)}일 (가동 ${GP.fmt(x.opDays, 1)}일)</dd>
      <dt>제품 가동률</dt><dd>${x.util != null ? GP.fmt(x.util * 100, 1) + '%' : '-'}</dd>
      <dt>M/C</dt><dd>${x.mcN}건${x.mcMedian != null ? ` · 중앙값 ${GP.fmt(x.mcMedian)}분` : ''}</dd>
      <dt>배경손실</dt><dd>더미 ${GP.fmt(x.bgDummyPerDay, 1)} + 기타 ${GP.fmt(x.bgStopPerDay, 1)}분/일</dd>
      ${x.longMin ? `<dt>장기정지</dt><dd>${GP.fmt(x.longMin / 60, 1)}시간(별도)</dd>` : ''}</dl></div>`).join('');
    $('a-warns').innerHTML = (a.warns || []).map((m) => `<li class="warn">경고 · ${esc(m)}</li>`).join('');
    const v = (c, x) => (x == null ? '-' : GP.fmt(x * (c.scale || 1), 1));
    $('a-cands').innerHTML = '<tr><th>반영</th><th>항목</th><th>현재</th><th>실적</th><th>차이</th><th>근거</th><th>판정</th></tr>' + a.cands.map((c, i) => {
      const d = c.cur && c.act != null ? c.act / c.cur - 1 : null;
      return `<tr><td><input type="checkbox" data-cand="${i}" ${c.apply ? 'checked' : ''} ${c.act != null ? '' : 'disabled'} aria-label="${esc(c.label)} 반영"></td><td class="l">${esc(c.label)} <small class="muted">${esc(c.unit)}</small></td>`
        + `<td class="n">${v(c, c.cur)}</td><td class="n"><b>${v(c, c.act)}</b></td><td class="n ${c.flag ? 'neg' : ''}">${d == null ? '-' : (d > 0 ? '+' : '') + GP.fmt(d * 100, 1) + '%'}</td>`
        + `<td class="l muted">${esc(c.basis || '')}</td><td>${c.apply ? '<span class="pill warn">반영 권장</span>' : c.flag ? '<span class="pill">검토(표본 부족)</span>' : '유지'}</td></tr>`;
    }).join('');
    renderWeekly(a);
    $('a-events').innerHTML = '<tr><th>시작</th><th>라인</th><th>구분</th><th>전환</th><th>손실(분)</th><th>더미</th></tr>' + (a.events.map((e) =>
      `<tr><td>${esc(e.at)}</td><td>${e.line}</td><td>${esc(e.kind)}</td><td>${e.from}→${e.to}</td><td class="n"><b>${GP.fmt(e.minutes)}</b></td><td class="n">${e.dummyN != null ? `${e.dummyN}개 ${GP.fmt(e.dummyT, 1)}t` : '-'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">기간 중 강종 전환 없음</td></tr>');
    $('a-checks').innerHTML = (a.checks || []).map((c) => `<li class="${c.level}">${{ error: '오류', warn: '경고', info: '정보' }[c.level]} · ${esc(c.msg)}</li>`).join('');
    $('a-msg').textContent = '';
  }

  function renderWeekly(a) {
    const W = a.weekly || [], weeks = [...new Set(W.map((r) => r[0]))].sort().slice(-13);
    const keys = [...new Set(W.map((r) => `${r[1]}|${r[2]}|${r[3]}`))].sort();
    const cur = {}; for (const s of a.speed || []) cur[s.key] = s.cur;
    const cell = (k, w) => {
      const r = W.find((x) => x[0] === w && `${x[1]}|${x[2]}|${x[3]}` === k);
      if (!r || !(r[5] > 0)) return '<td class="n muted">-</td>';
      const rate = r[4] / r[5], c = cur[k], d = c ? rate / c - 1 : 0;
      return `<td class="n ${d <= -0.05 ? 'neg' : d >= 0.05 ? 'pos' : ''}" title="${GP.fmt(r[4])}t · ${r[6]}코일">${GP.fmt(rate * 60, 1)}</td>`;
    };
    $('a-weekly').innerHTML = weeks.length ? `<tr><th>라인·강종·부서</th>${weeks.map((w) => `<th>${GP.md(w)}~</th>`).join('')}<th>현재 조건</th></tr>`
      + keys.map((k) => `<tr><td class="l">${k.split('|').join(' ')}</td>${weeks.map((w) => cell(k, w)).join('')}<td class="n">${cur[k] ? GP.fmt(cur[k] * 60, 1) : '-'}</td></tr>`).join('')
      : '<tr><td class="muted">주별 자료 없음</td></tr>';
    const lines = [...new Set(W.map((r) => r[1]))].sort();
    $('a-wtons').innerHTML = weeks.length ? `<tr><th>주</th>${lines.map((l) => `<th>${l}</th>`).join('')}</tr>` + weeks.map((w) => `<tr><td>${GP.md(w)}~</td>${lines.map((l) => `<td class="n">${GP.fmt(GP.sum(W.filter((r) => r[0] === w && r[1] === l), (r) => r[4]))}</td>`).join('')}</tr>`).join('') : '';
  }

  $('a-apply').onclick = () => {
    if (!A) return;
    const pick = [...document.querySelectorAll('[data-cand]')].filter((e) => e.checked).map((e) => A.cands[+e.dataset.cand]).filter((c) => c.path && c.act != null);
    if (!pick.length) { $('a-msg').textContent = '선택한 항목이 없습니다.'; return; }
    try { localStorage.setItem(P_KEY, JSON.stringify(GP.mesApply(planParams(), pick))); } catch (e) { $('a-msg').textContent = '⚠ 이 브라우저에 저장할 수 없습니다.'; return; }
    $('a-msg').innerHTML = `${pick.length}개 항목을 반영했습니다. <a href="rolling.html">롤링 화면</a>의 계획 조건(고급)에서 확인하고 계산을 다시 돌리세요.`;
  };

  // ---- 자동 분석 결과(암호화) 열기 ----
  async function unlock() {
    $('a-unlock-msg').textContent = '여는 중…';
    try {
      const o = await GP.decryptJSON(env, $('a-pw').value);
      try { if ($('a-remember').checked) localStorage.setItem(PW_KEY, $('a-pw').value); else localStorage.removeItem(PW_KEY); } catch (e) { /* 저장 불가 */ }
      $('a-unlock-msg').textContent = '';
      render(o, '자동 분석(사내 PC)');
    } catch (e) { $('a-unlock-msg').textContent = '⚠ ' + e.message; try { localStorage.removeItem(PW_KEY); } catch (x) { /* 무시 */ } }
  }
  $('a-unlock').onsubmit = (ev) => { ev.preventDefault(); unlock(); };
  const src = new URLSearchParams(location.search).get('src');
  GP.fetchPublished(src ? [src] : SRC).then((e) => {
    if (!e) { $('a-empty-title').textContent = '아직 자동 분석 결과가 없습니다'; $('a-empty-text').textContent = '사내 PC 자동 실행기가 처음 돌면 여기에 표시됩니다. 아래 “엑셀로 직접 분석”으로 바로 볼 수도 있습니다.'; return; }
    if (e.app === 'cgl-analysis') { render(e, '분석 결과'); return; }
    env = e;
    $('a-empty-title').textContent = '자동 분석 결과';
    $('a-empty-text').textContent = '분석 암호를 넣으면 열립니다. 암호 해제는 이 브라우저 안에서만 합니다.';
    $('a-pubinfo').innerHTML = `<b>${esc(e.label || '실적 분석')}</b> · 게시 ${new Date(e.created).toLocaleString('ko-KR')}`;
    $('a-unlock').hidden = false;
    let saved = null; try { saved = localStorage.getItem(PW_KEY); } catch (x) { saved = null; }
    if (saved) { $('a-pw').value = saved; unlock(); } else $('a-pw').focus();
  });

  // ---- 엑셀로 직접 분석 ----
  $('a-file').onchange = async (ev) => {
    const fl = [...ev.target.files]; if (!fl.length) return;
    $('a-file-name').textContent = `${fl.map((f) => f.name).join(', ')} 읽는 중…`;
    try {
      const wbs = [];
      for (const f of fl) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer()); wbs.push(wb); }
      const { clean, an } = GP.mesFromWorkbooks(wbs, planParams());
      $('a-file-name').textContent = fl.map((f) => f.name).join(', ');
      if (!an) { $('a-file-name').textContent += ' — ⚠ ' + clean.checks.filter((c) => c.level === 'error').map((c) => c.msg).join(' / '); return; }
      render(Object.assign(GP.mesExport(an, clean, clean.coils), { analyzedAt: new Date().toISOString() }), '직접 올린 엑셀');
      $('a-body').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { $('a-file-name').textContent = '⚠ 읽기 실패: ' + e.message; console.error(e); }
  };
})();
