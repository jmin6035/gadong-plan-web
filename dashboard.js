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
    $('d-meta').textContent = [meta.asOf && `판매계획 기준 ${meta.asOf}`, meta.savedAt && `계산 ${new Date(meta.savedAt).toLocaleString('ko-KR')}`, meta.auto && `MES 자동 갱신 ${new Date(meta.auto.runAt).toLocaleString('ko-KR')}${meta.auto.actualTo ? ` (실적 ~${GP.md(meta.auto.actualTo)})` : ''}`, `계획 기간 ${H.D0} ~ ${H.D1}`].filter(Boolean).join(' · ');
    renderNow(); renderReplan(); renderMes();
    const mcT = GP.sum(L, (l) => A.mc[l]), maxLoad = Math.max(...Object.values(A.load));
    const maxKey = Object.keys(A.load).find((k) => A.load[k] === maxLoad), [ml, mi] = maxKey.split('|');
    renderExec();
    $('d-kpis').innerHTML = [
      [`${mcT}회`, 'M/C(강종 전환)', `${L.map((l) => `${l} ${A.mc[l]}회`).join(' · ')}`],
      [`${GP.fmt(A.short + A.lateT)}t`, '결품·지연', `결품 ${GP.fmt(A.short)}t · 지연 ${GP.fmt(A.lateT)}t`, A.short + A.lateT > 0.5],
      [`${GP.fmt(A.earlyT)}t`, '전월 선생산', '납기월보다 앞 달 생산'],
      [`${GP.fmt(maxLoad * 100, 1)}%`, '최대 월 부하', `${H.ym[+mi][1]}월 ${ml}`, maxLoad > 0.995],
    ].map(([v, l, sub, bad]) => `<div class="kpi ${bad ? 'bad' : ''}"><span class="kl">${l}</span><b>${v}</b><span class="ks">${sub}</span></div>`).join('');
    const fams = [...new Set(L.flatMap((l) => P.lineFamilies[l]))];
    const leg = fams.map((f) => `<span><i class="sw" style="background:${famVar(f)}"></i>${f}</span>`).join('') + '<span><i class="sw" style="background:var(--mc)"></i>M/C·재가동</span><span><i class="sw" style="background:var(--down)"></i>설비정지·실적 미달</span><span><i class="sw" style="background:var(--sd)"></i>정기수리</span>';
    $('d-legend').innerHTML = leg; $('g-legend').innerHTML = leg;
    $('g-tabs').innerHTML = H.ym.map(([, m], i) => `<button type="button" data-g="${i}">${m}월</button>`).join('');
    const today = localToday(), ti = A.mIdx(today);
    renderGantt(gMonth == null ? (ti >= 0 ? ti : 0) : Math.min(gMonth, H.ym.length - 1));
    renderLoad(); renderEvents(); renderDept(); renderEarly();
    $('d-tabs').innerHTML = H.ym.map(([, m]) => `${m}월`).concat(['분기 요약']).map((t, i) => `<button type="button" data-tab="${i}">${t}</button>`).join('');
    if (document.querySelector('details.more').open) { renderDaily(); drawTab(Math.min(gTab, H.ym.length)); }
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
      <li>지연 ${GP.fmt(rp.late)}톤·일 · 결품 ${rp.shortBy.length ? rp.shortBy.map(esc).join(', ') : '없음'}</li></ul>` + vsPlanHtml(rp);
  }
  // 계획 대비 실적: 라인별 누계 달성률 + 최근 7일 + 부서 누계
  function vsPlanHtml(rp) {
    if (!rp.vsPlan || !rp.vsPlan.length) return '';
    const L = R.P.lines, pct = (a, p) => (p > 0 ? `${GP.fmt(a / p * 100, 1)}%` : '-');
    const cum = L.map((l) => { const x = rp.vsPlan.filter((r) => r[1] === l); return [l, GP.sum(x, (r) => r[2]), GP.sum(x, (r) => r[3])]; });
    const days = [...new Set(rp.vsPlan.map((r) => r[0]))].slice(-7);
    const cell = (d, l) => { const r = rp.vsPlan.find((x) => x[0] === d && x[1] === l) || [d, l, 0, 0], g = r[3] - r[2];
      return `<td class="n ${g < -1 ? 'neg' : ''}">${GP.fmt(r[3])}<small>/${GP.fmt(r[2])}</small></td>`; };
    return `<h3>계획 대비 실적 <small class="muted">(실적/계획, t)</small></h3>
      <div class="vs-cards">${cum.map(([l, p, a]) => `<div class="vs-card"><b>${l}</b><span class="hero ${a < p - 1 ? 'neg' : ''}">${pct(a, p)}</span><small>누계 ${GP.fmt(a)} / ${GP.fmt(p)}t (${a >= p ? '+' : ''}${GP.fmt(a - p)})</small></div>`).join('')}</div>
      <div class="scroll"><table class="data vs"><tr><th>라인</th>${days.map((d) => `<th>${GP.md(d)}</th>`).join('')}</tr>${L.map((l) => `<tr><td>${l}</td>${days.map((d) => cell(d, l)).join('')}</tr>`).join('')}</table></div>
      ${rp.byDept ? `<div class="scroll"><table class="data vs"><tr><th>부서</th><th>계획</th><th>실적</th><th>차이</th><th>달성</th></tr>${rp.byDept.filter((r) => r[1] || r[2]).map(([c, p, a]) => `<tr><td>${c}</td><td class="n">${GP.fmt(p)}</td><td class="n">${GP.fmt(a)}</td><td class="n ${a < p - 1 ? 'neg' : ''}">${a >= p ? '+' : ''}${GP.fmt(a - p)}</td><td class="n">${pct(a, p)}</td></tr>`).join('')}</table></div>` : ''}`;
  }
  // MES 실적 분석 요약(게시 시 meta.mes)
  function renderMes() {
    const m = meta.mes, el = $('d-mes');
    if (!m) { el.hidden = true; return; }
    el.hidden = false;
    const v = (c, x) => (x == null ? '-' : GP.fmt(x * (c.scale || 1), 1));
    el.innerHTML = `<h2>실적 분석 <small class="muted">— MES 실적 ${m.period.from} ~ ${m.period.to}, 현재 계획 조건과 비교</small></h2>
      <div class="lines-now">${Object.entries(m.lines).map(([l, x]) => `<div class="line-card"><h3>${l}</h3><dl>
        <dt>제품 생산</dt><dd>${GP.fmt(x.tons)}t · 코일 ${GP.fmt(x.coils)}개</dd>
        <dt>제품 가동률</dt><dd>${GP.fmt(x.util * 100, 1)}%</dd>
        <dt>M/C</dt><dd>${x.mcN}건${x.mcMedian != null ? ` · 중앙값 ${GP.fmt(x.mcMedian)}분` : ''}</dd>
        <dt>배경손실</dt><dd>더미 ${GP.fmt(x.bgDummyPerDay, 1)} + 기타 ${GP.fmt(x.bgStopPerDay, 1)}분/일</dd></dl></div>`).join('')}</div>
      <div class="scroll"><table class="data mes-t"><tr><th>항목</th><th>현재</th><th>실적</th><th>차이</th></tr>${m.cands.map((c) => { const d = c.cur && c.act != null ? c.act / c.cur - 1 : null;
        return `<tr><td class="l">${esc(c.label.replace(/ 속도$/, ''))} <small class="muted">${esc(c.unit)}</small>${c.flag ? ` <span class="pill ${c.ok ? 'warn' : ''}">${c.ok ? '반영 검토' : '표본 부족'}</span>` : ''}</td><td class="n">${v(c, c.cur)}</td><td class="n"><b>${v(c, c.act)}</b></td><td class="n ${c.flag ? 'neg' : ''}">${d == null ? '-' : (d > 0 ? '+' : '') + GP.fmt(d * 100, 1) + '%'}</td></tr>`; }).join('')}</table></div>
      <p class="hint">속도는 두께 구성에 따라 달라지므로 28일 이상 쌓인 실적만 반영을 검토합니다. 반영 여부는 계획 담당자가 정합니다.</p>`;
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
    const rows = A.events.map((e) => ({ d: e.date, cls: '', cells: [`${GP.md(e.date)}(${GP.weekday(e.date)})`, e.line, e.kind === 'M/C' ? `<b>${e.from} → ${e.to}</b>` : `재가동 <b>${e.from === e.to ? e.to + ' 유지' : e.from + ' → ' + e.to}</b>`, `${GP.fmt(e.loss / 60, 1)}h`], why: GP.eventReason(R, A, e) }))
      .concat(P.shutdowns.map((x) => ({ d: x.start, cls: 'sdrow', cells: [`${GP.md(x.start)}~${GP.md(x.end)}`, x.line, `정기수리 ${GP.diffDays(x.end, x.start) + 1}일`, '-'], why: '' })));
    rows.sort((a, b) => (a.d < b.d ? -1 : 1));
    $('d-events').innerHTML = '<tr><th>일자</th><th>라인</th><th>전환</th><th>손실</th></tr>' + rows.map((r, i) =>
      `<tr class="evrow ${r.cls}" data-i="${i}">${r.cells.map((c) => `<td>${c}</td>`).join('')}</tr>` + (r.why ? `<tr class="why-row" data-w="${i}" hidden><td colspan="4">${esc(r.why)}</td></tr>` : '')).join('');
  }
  $('d-events').addEventListener('click', (ev) => { const tr = ev.target.closest('.evrow'); if (!tr) return; const w = $('d-events').querySelector(`[data-w="${tr.dataset.i}"]`); if (w) { w.hidden = !w.hidden; tr.classList.toggle('open', !w.hidden); } });

  function renderExec() {
    const P = R.P, L = P.lines, H = A.H, mcT = GP.sum(L, (l) => A.mc[l]);
    const risks = [];
    for (const l of L) H.ym.forEach(([, m], i) => { const v = A.load[`${l}|${i}`] || 0; if (v >= 0.995) risks.push(`${m}월 ${l} 부하 ${GP.fmt(v * 100)}% — 여유 없음, 설비 고장 시 바로 지연`); });
    if (A.short + A.lateT > 0.5) risks.unshift(`결품·지연 ${GP.fmt(A.short + A.lateT)}t 발생`);
    const sd = P.shutdowns.map((x) => `${x.line} 정기수리 ${GP.md(x.start)}~${GP.md(x.end)}`).join(', ');
    $('d-exec').innerHTML = `<p class="headline">M/C <b>${mcT}회</b> · 결품·지연 <b>${GP.fmt(A.short + A.lateT)}t</b> · 전월 선생산 <b>${GP.fmt(A.earlyT)}t</b>${sd ? ` · ${sd}` : ''}</p>`
      + (risks.length ? risks.map((t) => `<p class="risk">⚠ ${esc(t)}</p>`).join('') : '<p class="ok">✓ 결품·지연 없음, 모든 월 여유 있음</p>');
  }

  // ---------------- HTML 간트: 라인별 강종 행 + 부서 행 + 가동시간 ----------------
  let gMonth = null;
  const DSHORT = { '도금수출': '도금수출', '자동차수출': '자동차수출', '도금국내': '도금국내', '자동차내수': '자동차내수', '자가재': '자가재' };
  function renderGantt(mi) {
    gMonth = mi;
    document.querySelectorAll('#g-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.g === mi));
    const P = R.P, [y, m] = A.H.ym[mi], nd = GP.daysInMonth(y, m), FAM = P.alloyFamily;
    const ds = Array.from({ length: nd }, (_, i) => GP.ymd(y, m, i + 1));
    const fam = {}, dep = {};
    for (const [d, l, a, c, t] of R.rows) { if (A.mIdx(d) !== mi) continue; fam[`${l}|${d}|${FAM[a]}`] = (fam[`${l}|${d}|${FAM[a]}`] || 0) + t; dep[`${l}|${d}|${c}`] = (dep[`${l}|${d}|${c}`] || 0) + t; }
    const today = localToday();
    let h = `<colgroup><col class="cc0"><col class="cc1">${ds.map(() => '<col>').join('')}<col class="ctot"></colgroup>` + '<thead><tr><th class="c0" rowspan="2">라인</th><th class="c1" rowspan="2">구분</th>' + ds.map((d) => `<th class="${d === today ? 'today' : ''}">${+d.slice(8)}</th>`).join('') + '<th class="tot" rowspan="2">계</th></tr><tr>'
      + ds.map((d) => { const w = GP.weekday(d); return `<th class="wk ${w === '토' ? 'sat' : w === '일' ? 'sun' : ''}">${w}</th>`; }).join('') + '</tr></thead><tbody>';
    for (const l of P.lines) {
      const fams = GP.famOrder(P, l);
      const deps = GP.DEPTS.filter((c) => ds.some((d) => (dep[`${l}|${d}|${c}`] || 0) > 0.5));
      const rows = fams.map((f) => ({ kind: 'fam', f })).concat(deps.map((c) => ({ kind: 'dep', c })), [{ kind: 'hrs' }]);
      const sdIdx = ds.map((d, i) => (A.calBy[`${l}|${d}`].blackout ? i : -1)).filter((i) => i >= 0);
      rows.forEach((r, ri) => {
        h += `<tr class="r-${r.kind}${ri === 0 ? ' first' : ''}">`;
        if (ri === 0) h += `<th class="c0 line" rowspan="${rows.length}">${l}</th>`;
        h += `<th class="c1">${r.kind === 'fam' ? `<i class="sw" style="background:${famVar(r.f)}"></i>${r.f}` : r.kind === 'dep' ? DSHORT[r.c] : '가동시간(h)'}</th>`;
        let tot = 0;
        ds.forEach((d, i) => {
          if (sdIdx.includes(i)) {
            if (ri === 0 && i === sdIdx[0]) { const sd = P.shutdowns.find((x) => x.line === l && x.start <= d && d <= x.end); h += `<td class="sdblock" colspan="${sdIdx.length}" rowspan="${rows.length}">정기수리<br>${sd ? `${GP.md(sd.start)}~${GP.md(sd.end)}` : ''}</td>`; }
            return;
          }
          const c = A.calBy[`${l}|${d}`];
          let v = 0, txt = '';
          if (r.kind === 'fam') { v = fam[`${l}|${d}|${r.f}`] || 0; const mm = GP.isSwitch(c) && /\((.+)→/.exec(c.event); txt = v > 0.5 ? GP.fmt(v) : (mm && mm[1] === r.f && c.event.startsWith('M/C') ? 'M/C' : ''); }
          else if (r.kind === 'dep') { v = dep[`${l}|${d}|${r.c}`] || 0; txt = v > 0.5 ? GP.fmt(v) : ''; }
          else { const u = (A.used[`${l}|${d}`] || 0) / 60; txt = u > 0 ? u.toFixed(1) : ''; }
          tot += v;
          const cls = [GP.isSwitch(c) ? 'mc' : '', GP.isDown(c) ? 'down' : '', d === today ? 'today' : ''].filter(Boolean).join(' ');
          h += `<td class="${cls}">${txt}</td>`;
        });
        h += `<td class="tot">${r.kind === 'hrs' ? '' : GP.fmt(tot)}</td></tr>`;
      });
    }
    $('g-table').innerHTML = h + '</tbody>';
    // 모바일 등 좁은 화면: 오늘(없으면 1일) 열이 보이게 가로 스크롤
    const wrap = document.querySelector('.gtable-wrap'), ti = ds.indexOf(today);
    if (wrap && wrap.scrollWidth > wrap.clientWidth) { const th = $('g-table').querySelectorAll('thead tr:first-child th')[2 + Math.max(0, ti - 1)]; wrap.scrollLeft = ti > 0 && th ? th.offsetLeft - 144 - 8 : 0; }
  }
  $('g-tabs').onclick = (ev) => { if (ev.target.dataset.g != null) renderGantt(+ev.target.dataset.g); };
  document.querySelector('details.more').addEventListener('toggle', (ev) => { if (ev.target.open && R) { renderDaily(); drawTab(Math.min(gTab, A.H.ym.length)); } });

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
  else GP.fetchPublished().then((env) => {
    if (env && env.app === 'cgl-plan') { shownCreated = env.savedAt || 'plain'; load(env); }   // 사내 서버: 평문 결과 → 바로 표시
    else if (env) askPassword(env);
    else { $('d-empty-title').textContent = '아직 게시된 계획이 없습니다'; $('d-empty-text').textContent = '계획 담당자가 계획 계산 화면(plan.html)에서 계산 후 “게시”하면 여기에 자동으로 표시됩니다. 결과 파일(.json)이 있으면 위 “결과 파일 열기”로 볼 수도 있습니다.'; }
  }).catch(() => { /* 게시본 없음 */ });
  // 상시 화면용: 5분마다 새 게시본이 있으면 자동으로 바꿔 보여줌(암호를 기억한 기기)
  setInterval(async () => {
    if (!shownCreated || document.hidden) return;
    try {
      const env = await GP.fetchPublished(); if (!env) return;
      const stamp = env.created || env.savedAt; if (stamp === shownCreated) return;
      const o = env.app === 'cgl-plan' ? env : await GP.decryptJSON(env, $('d-pw').value);
      shownCreated = stamp; load(o);
      $('d-meta').textContent += ' · 새 게시본으로 자동 갱신됨';
    } catch (e) { /* 다음 주기에 재시도 */ }
  }, 5 * 60 * 1000);
})();
