/* 컬러 계획 계산 화면 — 기준 자료(암호화 게시본) + 올린 엑셀 → Web Worker(color_calc_worker.js, Pyodide)에서 서버와 같은 계산 → 현재 게시 계획과 비교 → 게시
   게시 = published/integrated.enc.json(화면 자료) + published/color_prev.enc.json(다음 계산이 지난 자리를 먼저 쓰도록) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw', PUB_KEY = 'cgl-plan-publish-v1';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const sg = (v) => (Math.abs(v) < 0.5 ? '0' : (v > 0 ? '+' : '−') + n0(Math.abs(v)));
  const LINES = ['1CCL', '2CCL', '3CCL', '4CCL'], MONTHS = ['2026-10', '2026-11', '2026-12'];
  const GL = (g) => (g === '주문재' ? '건재 주문재' : g);
  const fmtT = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '-');
  let pw = '', E = {}, D = {}, worker = null, result = null, uploads = {}, names = {}, reading = 0;

  const envs = Promise.all(['color_calc_files.enc.json', 'color_calc_mes.enc.json', 'integrated.enc.json', 'color_prev.enc.json'].map((n) => GP.latest(n)))
    .then(([files, mes, cur, prev]) => { E = { files, mes, cur, prev }; return E; });

  function lockMsg(t, m) { $('c-lock-t').textContent = t; $('c-lock-msg').textContent = m || ''; }
  async function unlock(p) {
    await envs;
    if (!E.files || !E.mes) { lockMsg('계산 기준 자료가 아직 게시되지 않았습니다', '사내 PC 자동 실행 또는 관리자 게시 후 다시 여세요.'); return; }
    try {
      [D.files, D.mes, D.cur] = await Promise.all([GP.decryptJSON(E.files, p), GP.decryptJSON(E.mes, p), E.cur ? GP.decryptJSON(E.cur, p) : null]);
      D.prev = E.prev && String(E.prev.created) > String(E.files.created) ? await GP.decryptJSON(E.prev, p).catch(() => null) : null;
    } catch (e) { $('c-unlock').hidden = false; lockMsg('계산 화면 열기', p ? '⚠ 암호가 맞지 않습니다' : ''); return; }
    pw = p; try { localStorage.setItem(PW_KEY, p); } catch (x) { /* 무시 */ }
    $('c-lock').hidden = true; $('c-body').hidden = false;
    showSources();
    worker = new Worker('color_calc_worker.js');
    worker.onmessage = onMsg;
    worker.postMessage({ type: 'init' });                     // 엔진 미리 불러오기(화면을 보는 동안)
    if (window.UI) UI.reveal(document.querySelector('main'));
  }
  function showSources() {
    const dn = (() => { try { const f = D.files.files['data/color_downtime_2026Q4.json']; return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f), (c) => c.charCodeAt(0)))); } catch (e) { return null; } })();
    const S = [
      ['판매계획 · 계획재 운영안', `기준 자료 게시 ${fmtT(E.files.created)}`, 'TF 일별가동계획(9월 작성) · 계획재 운영안(R15)', 'good'],
      ['컬러 휴지계획', dn ? `${esc(dn.src || '')} · ${dn.items.length}건` : '없음', '계획휴지·S/D·수리 · 청소·Test·샘플', dn ? 'good' : 'warn'],
      ['MES 실적 · 재고', `자료 ${fmtT(D.mes.savedAt || E.mes.created)}`, '컬러 생산 실적 · 재고 · 출하 · 판매생산속보(사내 PC 매일 갱신)', 'good'],
      ['현재 게시 계획', D.cur ? `계산 ${fmtT(D.cur.built)} · 실적 ~${esc(D.cur.asOf || '')}` : '없음', D.prev ? '지난 컬러 계획 자리를 먼저 씀(일정이 덜 바뀌게)' : '도금 = 확정 계획(바뀌지 않음)', D.cur ? 'good' : 'warn'],
    ];
    $('c-src').innerHTML = S.map(([t, a, b, st]) => `<div class="cc-src"><b>${t}</b><small>${a}</small><small>${b}</small><span class="st ${st}">${st === 'good' ? '사용' : '확인'}</span></div>`).join('');
  }

  document.querySelectorAll('.up input').forEach((inp) => inp.addEventListener('change', async () => {
    const f = inp.files[0], lb = inp.closest('label');
    if (!f) { delete uploads[inp.dataset.k]; lb.classList.remove('on'); lb.querySelector('em').textContent = ''; return; }
    reading++; $('c-run').disabled = true; lb.querySelector('em').textContent = '읽는 중…';
    uploads[inp.dataset.k] = await f.arrayBuffer(); names[inp.dataset.k] = f.name;
    if (--reading === 0) $('c-run').disabled = false;
    lb.classList.add('on'); lb.querySelector('em').textContent = `✓ ${f.name} (${Math.round(f.size / 1024).toLocaleString()} KB)`;
  }));

  let t0 = 0, tick = null;
  $('c-run').onclick = () => {
    if (!worker) return;
    $('c-run').disabled = true; $('c-prog').hidden = false; $('c-log').textContent = ''; $('c-steps').innerHTML = ''; $('c-res').hidden = true; $('c-pub').hidden = true;
    t0 = Date.now(); clearInterval(tick); tick = setInterval(() => { $('c-msg').textContent = `계산 중… ${Math.round((Date.now() - t0) / 1000)}초`; }, 1000);
    const up = {}; const tr = [];
    for (const [k, b] of Object.entries(uploads)) { up[k] = b.slice(0); tr.push(up[k]); }
    worker.postMessage({ type: 'run', files: D.files.files, mes: { ex: D.mes.ex, md: D.mes.md }, prev: D.prev, uploads: up, names }, tr);
  };
  function log(s, err) { const L = $('c-log'); L.textContent += (err ? '⚠ ' : '') + s + '\n'; L.scrollTop = L.scrollHeight; }
  function onMsg(ev) {
    const m = ev.data;
    if (m.type === 'step') { const w = /확인:/.test(m.msg); $('c-steps').insertAdjacentHTML('beforeend', `<div${w ? ' class="warn"' : ''}>${esc(m.msg.trim())}</div>`); log('· ' + m.msg); }
    else if (m.type === 'log') { if (m.msg.trim()) log(m.msg, m.err); }
    else if (m.type === 'error') { stop(); $('c-msg').textContent = '⚠ 계산 실패 — 아래 기록을 확인하세요(올린 파일 양식이 다를 수 있음)'; log(m.msg, true); $('c-steps').insertAdjacentHTML('beforeend', `<div class="err">${esc(m.msg.split('\n').slice(-1)[0])}</div>`); }
    else if (m.type === 'done') { stop(); const r = JSON.parse(m.json); result = r; window.CC_LAST = r; /* 검증 스크립트가 서버 결과와 비교할 때 씀 */ $('c-msg').textContent = `계산 완료(${m.sec}초)`; render(r); }
  }
  function stop() { clearInterval(tick); $('c-run').disabled = false; $('c-prog').hidden = true; }

  /* 비교: 같은 기준(화면 자료)으로 현재 게시본과 새 계산을 셈 */
  function stats(o) {
    const lm = {}, un = {}, cells = {};
    for (const c of o.color || []) { const t = Object.values(c.g || {}).reduce((a, b) => a + b, 0); const k = `${c.l}|${c.d.slice(0, 7)}`; lm[k] = (lm[k] || 0) + t; cells[`${c.d}|${c.l}`] = t; }
    for (const u of o.colorUnplaced || []) { const k = `${u.g}|${u.ym}`; un[k] = (un[k] || 0) + u.t; }
    const v = (o.variants || {}).V1 || {}, self = {};
    for (const p of ['AZ', 'MAC', 'AL']) self[p] = Math.min(...((v.self || {})[p] || [[0, 0, 0, 0]]).map((x) => x[3]));
    return { lm, un, cells, self, tot: Object.values(lm).reduce((a, b) => a + b, 0), unT: Object.values(un).reduce((a, b) => a + b, 0) };
  }
  function render(r) {
    const N = stats(r.o), C = D.cur ? stats(D.cur) : null;
    const changed = C ? Object.keys({ ...N.cells, ...C.cells }).filter((k) => Math.abs((N.cells[k] || 0) - (C.cells[k] || 0)) >= 0.5).length : null;
    const k = (tone, l, v, u, b) => `<div class="kpi tone-${tone}"><div class="l">${l}</div><div class="v">${v}<small>${u}</small></div><div class="b">${b}</div></div>`;
    $('c-kpi').innerHTML = k('brand', '4분기 컬러 생산', n0(N.tot), 't', C ? `현재 게시 대비 ${sg(N.tot - C.tot)}t` : '')
      + k(N.unT > 0.5 ? 'warn' : 'good', '미편성', n0(N.unT), 't', C ? `현재 게시 대비 ${sg(N.unT - C.unT)}t` : '')
      + k(N.self.AZ < 0 ? 'bad' : 'good', '자가재 AZ 최저 재고', n0(N.self.AZ), 't', N.self.AZ < 0 ? '컬러 소재 부족 — 도금 계획 확인 필요' : `MAC ${n0(N.self.MAC)}t · AL ${n0(N.self.AL)}t (부족 없음)`)
      + k(changed ? 'warn' : 'good', '바뀐 날짜·라인 칸', changed == null ? '-' : n0(changed), '칸', '현재 게시 계획과 생산량이 다른 칸');
    const cell = (a, b) => { const d = a - (b || 0); return `<td><b>${n0(a)}</b></td>${C ? `<td>${n0(b)}</td><td class="${Math.abs(d) < 0.5 ? 'muted' : d > 0 ? 'up1' : 'dn1'}">${sg(d)}</td>` : ''}`; };
    $('c-lines').innerHTML = `<thead><tr><th rowspan="2">라인</th>${MONTHS.map((m) => `<th colspan="${C ? 3 : 1}">${+m.slice(5)}월</th>`).join('')}</tr><tr>${MONTHS.map(() => (C ? '<th>새 계산</th><th>현재</th><th>차이</th>' : '<th>새 계산</th>')).join('')}</tr></thead><tbody>`
      + LINES.map((l) => `<tr><td><b>${l}</b></td>${MONTHS.map((m) => cell(N.lm[`${l}|${m}`] || 0, C && C.lm[`${l}|${m}`])).join('')}</tr>`).join('')
      + `<tr class="total"><td>합계</td>${MONTHS.map((m) => cell(LINES.reduce((a, l) => a + (N.lm[`${l}|${m}`] || 0), 0), C && LINES.reduce((a, l) => a + (C.lm[`${l}|${m}`] || 0), 0))).join('')}</tr></tbody>`;
    const G = [...new Set(Object.keys(N.un).concat(C ? Object.keys(C.un) : []).map((x) => x.split('|')[0]))];
    $('c-unpl').innerHTML = G.length ? `<thead><tr><th rowspan="2">그룹</th>${MONTHS.map((m) => `<th colspan="${C ? 3 : 1}">${+m.slice(5)}월</th>`).join('')}</tr><tr>${MONTHS.map(() => (C ? '<th>새 계산</th><th>현재</th><th>차이</th>' : '<th>새 계산</th>')).join('')}</tr></thead><tbody>`
      + G.map((g) => `<tr><td><b>${esc(GL(g))}</b></td>${MONTHS.map((m) => cell(N.un[`${g}|${m}`] || 0, C && C.un[`${g}|${m}`])).join('')}</tr>`).join('') + '</tbody>' : '<tbody><tr><td>미편성 없음</td></tr></tbody>';
    $('c-res').hidden = false; $('c-pub').hidden = false;
    if (window.UI) { UI.reveal($('c-res')); }
    $('c-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* 게시 */
  let ps = {}; try { ps = JSON.parse(localStorage.getItem(PUB_KEY) || '{}') || {}; } catch (e) { /* 무시 */ }
  $('p-token').value = ps.token || ''; $('p-save').checked = !!ps.token;
  const label = () => `컬러 계획 재계산 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
  async function envelopes() {
    const o = Object.assign({}, result.o, { calcBy: 'web', calcAt: new Date().toISOString() });
    return [await GP.encryptJSON(o, pw, '4분기 통합 일별계획'), await GP.encryptJSON(result.prev, pw, '지난 컬러 계획(자리 우선)')];
  }
  $('p-file').onclick = async () => {
    if (!result) return;
    const [a, b] = await envelopes();
    for (const [env, name] of [[a, 'integrated.enc.json'], [b, 'color_prev.enc.json']]) {
      const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([JSON.stringify(env)], { type: 'application/json' })); el.download = name; el.click();
    }
    $('p-msg').textContent = '받은 두 파일을 GitHub 저장소 gadong-plan-web 의 published 폴더에 올리면(Add file → Upload files) 1~2분 뒤 반영됩니다.';
  };
  $('p-go').onclick = async () => {
    if (!result) return;
    const tok = $('p-token').value.trim();
    try { if ($('p-save').checked) localStorage.setItem(PUB_KEY, JSON.stringify(Object.assign(ps, { token: tok }))); } catch (e) { /* 무시 */ }
    if (!tok) { $('p-msg').textContent = '⚠ "게시 설정"에 토큰을 넣거나 "게시용 파일 받기"를 쓰세요.'; document.querySelector('#c-pub details').open = true; return; }
    if (!confirm('이 결과로 컬러 계획을 게시합니다. 컬러 가동 현황 · 수급 캘린더 · 재고 추이가 바뀝니다. 진행할까요?')) return;
    $('p-go').disabled = true; $('p-msg').textContent = '암호화·게시 중…';
    try {
      const [a, b] = await envelopes();
      await GP.publishToGitHub(a, tok, 'published/integrated.enc.json');
      await GP.publishToGitHub(b, tok, 'published/color_prev.enc.json');
      $('p-msg').innerHTML = `게시 완료(${esc(label())}). 1~2분 뒤 <a href="color_status.html">컬러 가동 현황</a>에 반영됩니다.`;
    } catch (e) { $('p-msg').textContent = '⚠ ' + e.message; }
    $('p-go').disabled = false;
  };

  $('c-unlock').addEventListener('submit', (e) => { e.preventDefault(); unlock($('c-pw').value); });
  envs.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else { $('c-unlock').hidden = false; lockMsg('계산 화면 열기'); } });
})();
