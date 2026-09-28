/* 조회 전용 대시보드: 계획 결과 JSON을 읽어 현황·차트로 보여준다.
   불러오기: 파일 열기 / 끌어놓기 / ?src=주소(사내 서버·공유폴더) / 계산 화면에서 "대시보드로 보기" */
(function () {
  const GP = window.GP;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const famVar = (f) => `var(--fam-${f})`;
  let R = null, A = null, meta = {}, gTab = 0;

  let pendingEnv = null;
  const PW_KEY = 'cgl-dash-pw';
  function askPassword(env) {
    pendingEnv = env;
    $('d-empty-title').textContent = '게시된 최신 계획';
    $('d-empty-text').textContent = '암호를 넣으면 게시된 계획 결과가 열립니다. 암호 해제는 이 브라우저 안에서만 합니다.';
    $('d-pubinfo').innerHTML = `<b>${esc(env.label || '계획 결과')}</b> · 게시 ${new Date(env.created).toLocaleString('ko-KR')}`;
    $('d-unlock').hidden = false;
    let saved = null; try { saved = localStorage.getItem(PW_KEY); } catch (e) { saved = null; }
    if (saved) { $('d-pw').value = saved; $('d-remember').checked = true; unlock(); }
    else $('d-pw').focus();
  }
  let shownCreated = null;
  async function unlock() {
    $('d-unlock-msg').textContent = '여는 중…';
    try {
      const o = await GP.decryptJSON(pendingEnv, $('d-pw').value);
      shownCreated = pendingEnv.created;
      try { if ($('d-remember').checked) localStorage.setItem(PW_KEY, $('d-pw').value); else localStorage.removeItem(PW_KEY); } catch (e) { /* 저장 불가 */ }
      $('d-unlock-msg').textContent = '';
      load(o);
    } catch (e) { $('d-unlock-msg').textContent = '⚠ ' + e.message; try { localStorage.removeItem(PW_KEY); } catch (x) { /* 무시 */ } }
  }
  $('d-unlock').onsubmit = (ev) => { ev.preventDefault(); unlock(); };
  function load(o) {
    if (o && o.app === 'cgl-plan-enc') { askPassword(o); return; }
    if (o && o.app === 'cgl-plan') { R = o.result; meta = Object.assign({}, o.meta, { savedAt: o.savedAt }); }
    else if (o && o.rows && o.cal && o.P) { R = o; meta = {}; }
    else throw new Error('계획 결과 파일 형식이 아닙니다');
    A = GP.analyze(R);
    const H = A.H, today = localToday();
    $('d-date').min = H.D0; $('d-date').max = H.D1;
    $('d-date').value = today < H.D0 ? H.D0 : today > H.D1 ? H.D1 : today;
    render();
  }
  function localToday() { const d = new Date(); return GP.ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); }

  function render() {
    const P = R.P, H = A.H, L = P.lines;
    $('d-empty').hidden = true; $('d-body').hidden = false;
    $('d-title').textContent = `'${String(H.ym[0][0]).slice(2)}.${H.ym.map(([, m]) => m).join('·')}월 도금 CGL 가동계획`;
    $('d-meta').textContent = [meta.asOf && `판매계획 기준 ${meta.asOf}`, meta.savedAt && `계산 ${new Date(meta.savedAt).toLocaleString('ko-KR')}`, `계획 기간 ${H.D0} ~ ${H.D1}`].filter(Boolean).join(' · ');
    renderNow(); renderReplan();
    const mcT = GP.sum(L, (l) => A.mc[l]), maxLoad = Math.max(...Object.values(A.load));
    $('d-kpis').className = 'kpis';
    $('d-kpis').innerHTML = [
      [`${mcT}회`, `M/C · ${L.map((l) => `${l} ${A.mc[l]}`).join(' / ')}`],
      [`${GP.fmt(A.short)}t`, '결품', A.short > 0.5], [`${GP.fmt(A.lateT)}t`, '지연', A.lateT > 0.5],
      [`${GP.fmt(A.earlyT)}t`, '전월 선생산'], [`${A.idle.length}일`, '유휴일'],
      [`${GP.fmt(maxLoad * 100, 1)}%`, '최대 월 부하'],
    ].map(([v, l, bad]) => `<div class="kpi ${bad ? 'bad' : ''}"><b>${v}</b><span>${l}</span></div>`).join('');
    const fams = [...new Set(L.flatMap((l) => P.lineFamilies[l]))];
    $('d-legend').innerHTML = fams.map((f) => `<span><i class="sw" style="background:${famVar(f)}"></i>${f}</span>`).join('') + '<span><i class="sw" style="background:var(--mc)"></i>M/C·재가동</span><span><i class="sw" style="background:var(--down)"></i>설비정지·실적 미달</span><span><i class="sw" style="background:var(--sd)"></i>정기수리</span>';
    renderDaily(); renderLoad(); renderEvents(); renderDept(); renderEarly();
    $('d-tabs').innerHTML = H.ym.map(([, m]) => `${m}월`).concat(['분기 요약']).map((t, i) => `<button type="button" data-tab="${i}">${t}</button>`).join('');
    drawTab(Math.min(gTab, H.ym.length));
  }

  // ---------------- 기준일 현황 ----------------
  function renderNow() {
    const d = $('d-date').value, P = R.P;
    const byDep = {};
    for (const [dd, l, a, c, t] of R.rows) if (dd === d) { byDep[l] = byDep[l] || {}; byDep[l][c] = (byDep[l][c] || 0) + t; }
    $('d-now').innerHTML = P.lines.map((l) => {
      const c = A.calBy[`${l}|${d}`]; if (!c) return '';
      const used = A.used[`${l}|${d}`] || 0, prod = A.prodLD[`${l}|${d}`] || 0;
      const cp = A.campaigns.find((x) => x.line === l && x.start <= d && d <= x.end);
      const next = A.events.find((e) => e.line === l && e.date > d);
      const sdNext = P.shutdowns.find((s) => s.line === l && s.start > d);
      const mi = A.mIdx(d);
      const monthPlan = GP.sum(R.rows.filter((r) => r[1] === l && A.mIdx(r[0]) === mi), (r) => r[4]);
      const toDate = GP.sum(R.rows.filter((r) => r[1] === l && A.mIdx(r[0]) === mi && r[0] <= d), (r) => r[4]);
      const deps = Object.entries(byDep[l] || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${GP.fmt(v)}t`).join(', ');
      const state = c.blackout ? '<span class="pill">정기수리</span>' : `<i class="sw" style="background:${famVar(c.fam)}"></i> ${c.fam}`;
      return `<div class="line-card"><h3>${l} ${state} ${c.event && !c.blackout ? `<span class="pill ${GP.isSwitch(c) ? 'warn' : 'down'}">${esc(c.event)}</span>` : ''}</h3><dl>
        <dt>계획 생산</dt><dd>${c.blackout ? '-' : `${GP.fmt(prod)}t (가동률 ${c.cap > 0 ? GP.fmt(used / c.cap * 100) : 0}%)`}</dd>
        <dt>부서별</dt><dd>${deps || '-'}</dd>
        <dt>현재 캠페인</dt><dd>${cp ? `${cp.fam} ${GP.md(cp.start)}~${GP.md(cp.end)} (${GP.diffDays(d, cp.start) + 1}/${GP.diffDays(cp.end, cp.start) + 1}일)` : '-'}</dd>
        <dt>다음 전환</dt><dd>${next ? `${GP.md(next.date)} (D-${GP.diffDays(next.date, d)}) ${next.kind === 'M/C' ? `M/C ${next.from}→${next.to}` : `재가동 ${next.from === next.to ? next.to + ' 유지' : next.from + '→' + next.to}`}` : '분기 내 없음'}</dd>
        ${sdNext ? `<dt>다음 정기수리</dt><dd>${GP.md(sdNext.start)}~${GP.md(sdNext.end)} (D-${GP.diffDays(sdNext.start, d)})</dd>` : ''}
        <dt>${A.H.ym[mi][1]}월 누계</dt><dd>${GP.fmt(toDate)} / ${GP.fmt(monthPlan)}t</dd>
      </dl></div>`;
    }).join('');
  }
  $('d-date').onchange = () => R && renderNow();
  function renderReplan() {
    const rp = R.replan, el = $('d-replan');
    if (!rp) { el.hidden = true; return; }
    const ev = (x) => { const [d, l, e] = x.split('|'); return `${GP.md(d)} ${l} ${esc(e)}`; };
    el.hidden = false;
    el.innerHTML = `<h2>실적 반영 재계획 <small class="muted">— ${GP.md(rp.t0)}까지 실적, ${rp.freezeUntil ? GP.md(rp.freezeUntil) + '까지 강종 동결' : '동결 없음'}</small></h2>
      <ul class="changes">${rp.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
      <li>실적 ${GP.fmt(rp.actualT)}t / 같은 기간 계획 ${GP.fmt(rp.planToDateT)}t (${rp.actualT >= rp.planToDateT ? '+' : ''}${GP.fmt(rp.actualT - rp.planToDateT)}t)</li>
      <li>전환 일정: ${rp.removed.length || rp.added.length ? `<b>취소</b> ${rp.removed.map(ev).join(', ') || '-'} · <b>신규</b> ${rp.added.map(ev).join(', ') || '-'}` : '변경 없음'}</li>
      <li>지연 ${GP.fmt(rp.late)}톤·일 · 결품 ${rp.shortBy.length ? rp.shortBy.map(esc).join(', ') : '없음'}</li></ul>`;
  }

  // ---------------- 일별 차트 (라인별 작은 배수, 같은 y축) ----------------
  function niceMax(v) { const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1); }
  function renderDaily() {
    const P = R.P, H = A.H, days = H.days, n = days.length;
    const box = $('d-daily'); const avail = Math.max(box.clientWidth || 700, 300);
    const ml = 44, mr = 8, mt = 16, mb = 22, h = 150;
    const band = Math.max(8, (avail - ml - mr) / n), W = ml + mr + band * n, bw = Math.min(24, band - 2);
    const ymax = niceMax(Math.max(...Object.values(A.prodLD), 1));
    const y = (v) => mt + h - (v / ymax) * h;
    const ticks = [0, ymax / 2, ymax];
    box.innerHTML = P.lines.map((l) => {
      let s = `<svg class="daily" width="${W}" height="${mt + h + mb}" role="img" aria-label="${l} 일별 계획 생산량">`;
      if (R.replan) {
        const i1 = days.indexOf(R.replan.t0);
        if (i1 >= 0) s += `<rect x="${ml}" y="${mt}" width="${(i1 + 1) * band}" height="${h}" fill="var(--soft)"/><line x1="${ml + (i1 + 1) * band}" x2="${ml + (i1 + 1) * band}" y1="${mt - 12}" y2="${mt + h}" stroke="var(--ink)" stroke-width="1"/><text x="${ml + (i1 + 1) * band - 4}" y="${mt + 10}" text-anchor="end" style="fill:var(--ink)">실적</text><text x="${ml + (i1 + 1) * band + 4}" y="${mt + 10}" style="fill:var(--ink)">재계획</text>`;
      }
      for (const t of ticks) s += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}"/><text x="${ml - 6}" y="${y(t) + 4}" text-anchor="end">${GP.fmt(t)}</text>`;
      days.forEach((d, i) => {
        const x = ml + i * band, c = A.calBy[`${l}|${d}`], v = A.prodLD[`${l}|${d}`] || 0;
        if (+d.slice(8) === 1) s += `<line class="grid" x1="${x}" x2="${x}" y1="${mt}" y2="${mt + h}"/><text x="${x + 2}" y="${mt + h + 16}">${+d.slice(5, 7)}월</text>`;
        else if (+d.slice(8) % 5 === 0 && +d.slice(8) <= GP.daysInMonth(+d.slice(0, 4), +d.slice(5, 7)) - 3) s += `<text x="${x + band / 2}" y="${mt + h + 16}" text-anchor="middle">${+d.slice(8)}</text>`;
        if (c.blackout) { s += `<rect x="${x}" y="${mt}" width="${band}" height="${h}" fill="var(--sd)"/>`; return; }
        if (GP.isSwitch(c) || GP.isDown(c)) s += `<rect x="${x}" y="${mt - 12}" width="${band}" height="6" rx="2" fill="var(${GP.isSwitch(c) ? '--mc' : '--down'})"/>`;
        if (v > 0.5) {
          const bx = x + (band - bw) / 2, by = y(v), r = Math.min(4, bw / 2, mt + h - by);
          s += `<path class="bar" d="M${bx},${mt + h} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + bw - r} Q${bx + bw},${by} ${bx + bw},${by + r} V${mt + h} Z" fill="${famVar(c.fam)}"/>`;
        }
        s += `<rect class="hit" data-l="${l}" data-d="${d}" x="${x}" y="${mt - 12}" width="${band}" height="${h + 12}"/>`;
      });
      // 정기수리 라벨
      for (const sd of P.shutdowns.filter((x) => x.line === l)) {
        const i0 = days.indexOf(sd.start < H.D0 ? H.D0 : sd.start), i1 = days.indexOf(sd.end > H.D1 ? H.D1 : sd.end);
        if (i0 >= 0 && i1 >= 0 && (i1 - i0 + 1) * band > 60) s += `<text x="${ml + (i0 + i1 + 1) / 2 * band}" y="${mt + h / 2}" text-anchor="middle" style="fill:var(--ink);font-weight:bold">정기수리 ${GP.md(sd.start)}~${GP.md(sd.end)}</text>`;
      }
      return `<div class="chart-line"><h3>${l} <span class="muted">(t/일)</span></h3><div class="chart-scroll">${s}</svg></div></div>`;
    }).join('');
  }
  const tip = $('tip');
  function showTip(el, ev) {
    const l = el.dataset.l, d = el.dataset.d, c = A.calBy[`${l}|${d}`];
    const deps = {}; for (const [dd, ll, a, cl, t] of R.rows) if (dd === d && ll === l) deps[cl] = (deps[cl] || 0) + t;
    const u = A.used[`${l}|${d}`] || 0;
    tip.innerHTML = `<b>${l} · ${GP.md(d)}(${GP.weekday(d)}) · ${c.fam}</b>${c.event ? `<div>${esc(c.event)} (손실 ${GP.fmt(c.mcdummy)}분)</div>` : ''}<div>생산 ${GP.fmt(A.prodLD[`${l}|${d}`] || 0)}t · 가동률 ${c.cap > 0 ? GP.fmt(u / c.cap * 100) : 0}%</div><table>${Object.entries(deps).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td class="n">${GP.fmt(v)}t</td></tr>`).join('')}</table>`;
    tip.hidden = false;
    const x = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8), yy = Math.max(8, ev.clientY - tip.offsetHeight - 12);
    tip.style.left = x + 'px'; tip.style.top = yy + 'px';
  }
  $('d-daily').addEventListener('pointermove', (ev) => { const el = ev.target.closest('.hit'); if (el) showTip(el, ev); else tip.hidden = true; });
  $('d-daily').addEventListener('pointerdown', (ev) => { const el = ev.target.closest('.hit'); if (el) showTip(el, ev); });
  $('d-daily').addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') tip.hidden = true; });
  document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
  let rT = null; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => R && renderDaily(), 200); });

  // ---------------- 월별 부하 ----------------
  function renderLoad() {
    $('d-load').innerHTML = R.P.lines.map((l) => `<div class="load-grp"><b>${l}</b>` + A.H.ym.map(([, m], i) => {
      const v = A.load[`${l}|${i}`] || 0;
      return `<div class="load-row"><span>${m}월</span><div class="load-track"><div class="load-fill ${v >= 0.995 ? 'full' : ''}" style="width:${Math.min(100, v * 100)}%"></div><div class="load-100"></div></div><span class="n">${GP.fmt(v * 100, 1)}%</span></div>`;
    }).join('') + '</div>').join('') + '<p class="hint">강조 색 막대 = 여유 없음(100%). 오른쪽 세로선 = 100%.</p>';
  }
  function renderEvents() {
    const P = R.P;
    const items = A.events.map((e) => ({ d: e.date, html: `<div class="when">${GP.md(e.date)}(${GP.weekday(e.date)}) ${e.line} ${e.kind === 'M/C' ? `M/C ${e.from}→${e.to}` : `S/D 재가동 ${e.from === e.to ? e.to + ' 유지' : e.from + '→' + e.to}`} <span class="muted">· 손실 ${GP.fmt(e.loss)}분</span></div><div class="why">${esc(GP.eventReason(R, A, e))}</div>` }))
      .concat(P.shutdowns.map((s) => ({ d: s.start, html: `<div class="when">${GP.md(s.start)}~${GP.md(s.end)} ${s.line} 정기수리 <span class="muted">· ${GP.diffDays(s.end, s.start) + 1}일</span></div>` })));
    items.sort((a, b) => (a.d < b.d ? -1 : 1));
    $('d-events').innerHTML = items.map((x) => `<li>${x.html}</li>`).join('');
  }
  function renderDept() {
    const H = A.H, t = {}, dem = {};
    for (const [d, l, a, c, x] of R.rows) { const k = `${c}|${A.mIdx(d)}`; t[k] = (t[k] || 0) + x; }
    const sept = {};
    for (const it of R.items) dem[it.cls] = (dem[it.cls] || 0) + it.tons;
    for (const it of R.sept) sept[it.cls] = (sept[it.cls] || 0) + it.tons;
    const mx = Math.max(...Object.values(t), 1);
    const cell = (v) => `<td class="n bar-cell"><i style="width:${(v / mx) * 100}%"></i><span>${GP.fmt(v)}</span></td>`;
    $('d-dept').innerHTML = `<tr><th>부서</th>${H.ym.map(([, m]) => `<th>${m}월</th>`).join('')}<th>분기 생산</th><th>전월 생산 가정</th><th>요구량(파일)</th></tr>` +
      GP.DEPTS.map((dp) => { const v = H.ym.map((_, i) => t[`${dp}|${i}`] || 0); return `<tr><td>${dp}</td>${v.map(cell).join('')}<td class="n"><b>${GP.fmt(GP.sum(v))}</b></td><td class="n">${GP.fmt(sept[dp] || 0)}</td><td class="n">${GP.fmt(dem[dp] || 0)}</td></tr>`; }).join('') +
      `<tr><td><b>합계</b></td>${H.ym.map((_, i) => `<td class="n"><b>${GP.fmt(GP.sum(GP.DEPTS, (dp) => t[`${dp}|${i}`] || 0))}</b></td>`).join('')}<td class="n"><b>${GP.fmt(A.prod)}</b></td><td class="n">${GP.fmt(GP.sum(R.sept, (i) => i.tons))}</td><td class="n">${GP.fmt(GP.sum(R.items, (i) => i.tons))}</td></tr>`;
  }
  function renderEarly() {
    const er = GP.earlyReasons(R, A);
    $('d-early').innerHTML = '<tr><th>라인</th><th>강종</th><th>부서</th><th>생산월</th><th>마감</th><th>물량(t)</th><th>이유</th></tr>' + er.map((x) => `<tr><td>${x.line}</td><td>${x.alloy}</td><td>${x.cls}</td><td>${x.prodMonth}월</td><td>${GP.md(x.due)}</td><td class="n">${GP.fmt(x.tons, 1)}</td><td class="l">${esc(x.why)}</td></tr>`).join('') + `<tr><td colspan="5"><b>합계</b></td><td class="n"><b>${GP.fmt(A.earlyT, 1)}</b></td><td></td></tr>`;
  }
  function drawTab(i) {
    gTab = i;
    document.querySelectorAll('#d-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.tab === i));
    const c = document.createElement('canvas');
    $('d-gantt').src = (i < A.H.ym.length ? GP.drawGanttMonth(c, R, A, i, 2) : GP.drawSummary(c, R, A, 2)).toDataURL('image/png');
  }
  $('d-tabs').onclick = (ev) => { if (ev.target.dataset.tab != null) drawTab(+ev.target.dataset.tab); };
  $('d-gantt').onclick = () => { const w = window.open(); if (w) { const im = w.document.createElement('img'); im.src = $('d-gantt').src; w.document.body.style.margin = '0'; w.document.body.appendChild(im); } };

  // ---------------- 불러오기 ----------------
  async function fromFile(f) { try { load(JSON.parse(await f.text())); } catch (e) { alert('결과 파일을 열지 못했습니다: ' + e.message); } }
  $('d-file').onchange = (ev) => ev.target.files[0] && fromFile(ev.target.files[0]);
  document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drag'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drag'); });
  document.addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) fromFile(f); });
  const src = new URLSearchParams(location.search).get('src');
  let handoff = null;
  try { handoff = sessionStorage.getItem('cgl-dash-handoff'); } catch (e) { handoff = null; }
  if (src) fetch(src, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(load).catch((e) => { $('d-empty').insertAdjacentHTML('beforeend', `<p class="hint" style="color:var(--err)">주소에서 결과를 읽지 못함: ${esc(e.message)}</p>`); });
  else if (handoff) { try { load(JSON.parse(handoff)); } catch (e) { /* 무시 */ } }
  else fetch(GP.PUBLISH_PATH, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((env) => {
    if (env) askPassword(env);
    else { $('d-empty-title').textContent = '아직 게시된 계획이 없습니다'; $('d-empty-text').textContent = '계획 담당자가 계획 계산 화면(plan.html)에서 계산 후 “게시”하면 여기에 자동으로 표시됩니다. 결과 파일(.json)이 있으면 위 “결과 파일 열기”로 볼 수도 있습니다.'; }
  }).catch(() => { /* 게시본 없음 */ });
  // 상시 화면용: 5분마다 새 게시본이 있으면 자동으로 바꿔 보여줌(암호를 기억한 기기)
  setInterval(async () => {
    if (!shownCreated || document.hidden) return;
    try {
      const r = await fetch(GP.PUBLISH_PATH, { cache: 'no-store' }); if (!r.ok) return;
      const env = await r.json(); if (env.created === shownCreated) return;
      const o = await GP.decryptJSON(env, $('d-pw').value);
      shownCreated = env.created; load(o);
      $('d-meta').textContent += ' · 새 게시본으로 자동 갱신됨';
    } catch (e) { /* 다음 주기에 재시도 */ }
  }, 5 * 60 * 1000);
})();
