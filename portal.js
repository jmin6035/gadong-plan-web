/* 포털(홈): published/portal.enc.json (tools/portal_data.py) — 핵심 지표 4개 + 월별 도금 계획 + 발주 시한 임박 + 메뉴 타일 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    plan: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h8"/>'),
    gantt: svg('<path d="M4 5h9M7 10h11M5 15h7M9 20h11"/>'),
    calc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h6"/>'),
    chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    report: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
    box: svg('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>'),
    truck: svg('<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
    book: svg('<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6"/><path d="M14 7v13M20 4v14h-6"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h0"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  };
  const GROUPS = [
    ['가동계획', [['supply.html', 'plan', '수급 캘린더', '일별 가동·자가재·구매 소재(발주·입고·재고)·제품 재고', true], ['integrated.html', 'plan', '통합 가동계획', '컬러 → 도금 4분기 일별 계획, 버전 비교·재고 추이'], ['status.html', 'gantt', '가동 현황', '도금 1·2CGL 월별 간트, 강종 전환, 부서별 물량', 0, 'G'], ['rolling.html', 'calc', '계획 계산', '도금 실적을 넣어 다시 계산(롤링)하고 게시', 0, 'G']]],
    ['실적', [['analysis.html', 'chart', '도금 실적 분석', '도금 속도·손실·M/C 실적과 파라미터 보정 후보', 0, 'G'], ['color_actual.html', 'chart', '컬러 실적', '1~4CCL 진도·일별·주별 생산·속도·품명·휴지', true, 'C'], ['report.html', 'report', '주간 보고', '도금·컬러 주간 계획 대비 실적 보고 양식']]],
    ['소재', [['procure.html', 'truck', '조달 판단', '필요 시점별 가능 업체 추천, 구매 요청서', true], ['material.html', 'box', '소재 발주(월)', '업체 × 월 입고 필요량과 발주 마감(~27.3)']]],
    ['자료', [['decisions.html', 'report', '결정 기록', '누가·무엇을·언제까지 — 결정과 할 일 추적', true], ['health.html', 'help', '자료 상태', '원천 자료별 마지막 날짜·화면별 게시 시각 — 자동 실행 점검'], ['doc.html?d=glossary', 'book', '용어·정의 · 확인 대기', '숫자 정의 사전과 아직 확인 안 된 가정 목록', true], ['doc.html?d=conditions', 'book', '계획 조건식', '컬러·도금·소재 계산식과 보완할 점'], ['doc.html?d=procure_guide', 'help', '조달 판단 사용법', '사용 순서 10단계와 계산 조건'], ['doc.html?d=requests', 'mail', '협조 요청 메일', '전산·구매·판매·생산 요청 사항']]],
  ];

  $('h-groups').innerHTML = GROUPS.map(([g, L]) => `<div><h3>${g}</h3>${L.map(([u, ic, t, d, nw, only]) => `<a href="${u}" title="${esc(d)}"${only ? ` data-only="${only}"` : ''}>${IC[ic]}${t}${only ? `<em>${only === 'G' ? '도금' : '컬러'}</em>` : ''}</a>`).join('')}</div>`).join('');

  const pc = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0);
  const sg = (v) => `<span class="${v < 0 ? 'neg' : 'pos'}">${v < 0 ? '−' : '+'}${n0(Math.abs(v))}</span>`;
  const dim = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  const DOM = (pl) => (pl === 'G' ? 'G' : pl === 'C' ? 'C' : 'M');
  let lastO = null;
  const ROLES = [['all', '전체'], ['exec', '임원'], ['plan', '생산기획'], ['buy', '구매'], ['sales', '판매']];
  const RWHO = { plan: '생산기획', buy: '구매', sales: '판매' };
  let role = 'all'; try { role = localStorage.getItem('cgl-role') || 'all'; } catch (e) { /* 무시 */ }
  function roleBar() {
    $('h-role').innerHTML = ROLES.map(([k, n]) => `<button type="button" data-r="${k}" aria-pressed="${k === role}">${n}</button>`).join('');
    $('h-role').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { role = b.dataset.r; try { localStorage.setItem('cgl-role', role); } catch (e) { /* 무시 */ } roleBar(); if (lastO) render(lastO); }));
  }
  roleBar();
  const exPl = (e) => (e.area === '도금' ? 'G' : e.area === '컬러' ? 'C' : e.area === '재고' ? (/컬러/.test(e.text) ? 'C' : /도금/.test(e.text) ? 'G' : 'GC') : 'GC');

  // KPI 한 칸: 이름 · 큰 숫자 · 한 줄 보조 · 막대(진도) · 상태 점
  function K(dom, tone, l, v, unit, sub, bar, href, ck) {
    return `<a class="k" data-dom="${dom}" href="${href || '#'}"><span class="dot ${tone}"></span><div class="l">${l}</div>
      <div class="v"><b data-count="${v}" data-ck="${ck}">0</b><small>${unit}</small></div><div class="s">${sub}</div>${bar != null ? `<div class="mb"><i style="width:${Math.max(0, Math.min(100, bar))}%"></i></div>` : ''}</a>`;
  }
  function kstrip(O) {
    const L = O.lines || [], sr = O.sr || {}, pl = O.plating || {}, now = pl.now || {}, q = O.procure || {};
    const sum = (pl_, k) => L.filter((x) => x.pl === pl_).reduce((a, x) => a + (x[k] || 0), 0);
    const g = { a: sum('G', 'actual'), s: sum('G', 'sched'), m: sum('G', 'month') }, c = { a: sum('C', 'actual'), s: sum('C', 'sched'), m: sum('C', 'month') };
    const sh = (sr.ship || []).find((x) => x.name === '합계') || {};
    const st = {}; (sr.stock || []).forEach((x) => { st[x.name] = x; });
    const tone = (r) => (r >= 0.98 ? 'good' : r >= 0.9 ? 'warn' : 'bad');
    const stk = (n) => { const x = st[n]; return x && x.target ? x.current / x.target : null; };
    const cs = stk('컬러 제품'), gs = stk('도금 제품(판매재)');
    const it = [
      ['G', K('G', tone(g.a / g.s), '도금 생산 누계', g.a, 't', `일정 ${n0(g.s)} 대비 ${sg(g.a - g.s)} · 월차 ${n0(g.m)}`, pc(g.a, g.m), 'status.html', 'kg')],
      ['C', K('C', tone(c.a / c.s), '컬러 생산 누계', c.a, 't', `일정 ${n0(c.s)} 대비 ${sg(c.a - c.s)} · 월차 ${n0(c.m)}`, pc(c.a, c.m), 'color_actual.html', 'kc')],
      ['GC', K('M', tone((sh.actual || 0) / (sh.sched || 1)), '출하 누계(전체)', sh.actual || 0, 't', `일정 ${n0(sh.sched || 0)} 대비 ${sg((sh.actual || 0) - (sh.sched || 0))} · 월차 ${n0(sh.month || 0)}`, pc(sh.actual || 0, sh.month || 1), 'report.html', 'ks')],
      ['G', K('G', now.short ? 'bad' : now.late ? 'warn' : 'good', '도금 결품 예상', now.short || 0, 't', `지연 ${n0(now.late || 0)}톤·일 · 납기 빠듯 ${pl.tightN || 0}건`, null, 'status.html', 'kx')],
      ['GC', K('M', q.near ? 'warn' : 'good', '발주 시한 2주 안', q.near || 0, '건', q.nearTop && q.nearTop[0] ? `가장 급함 ${esc(q.nearTop[0].mat)} ${md(q.nearTop[0].deadline)}` : '-', null, 'procure.html', 'kq')],
      ['GC', (() => { const hi = (cs || 0) >= (gs || 0) ? ['컬러 제품', cs] : ['도금 제품', gs]; return K('M', (hi[1] || 0) > 1.3 || (hi[1] || 0) < 0.7 ? 'bad' : (hi[1] || 0) > 1.15 ? 'warn' : 'good', `재고 / 목표 (${hi[0]})`, Math.round((hi[1] || 0) * 100), '%', `컬러 제품 ${cs ? Math.round(cs * 100) + '%' : '-'} · 도금 제품 ${gs ? Math.round(gs * 100) + '%' : '-'}`, null, 'report.html', 'kr'); })()],
    ];
    const has = [L.some((x) => x.pl === 'G'), L.some((x) => x.pl === 'C'), !!sh.month, !!pl.now, true, !!(sr.stock || []).length];   // 예전 형식 자료(라인·속보 요약 없음)면 그 칸은 숨김
    return it.filter(([p], j) => has[j] && UI.inScope(p)).map((x) => x[1]).join('');
  }
  // 라인 타일: 월차·누계·일정 대비 + 14일 추이(선이 그려지는 애니메이션) + 다음 전환
  function spark(days) {
    const v = days.map((d) => d[1]), mx = Math.max(...v, 1), W = 140, H = 34, n = v.length;
    const xy = v.map((y, i) => [i * W / (n - 1), H - 3 - y / mx * (H - 6)]);
    const li = 'M' + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
    return `<svg class="sp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="${li} L${W},${H} L0,${H} Z"/><path class="li" d="${li}"/></svg>`;
  }
  function lines(O) {
    return (O.lines || []).filter((x) => UI.inScope(x.pl)).map((x) => {
      const r = x.sched ? x.actual / x.sched : null, cls = r == null ? '' : r >= 0.98 ? 'good' : r >= 0.9 ? 'warn' : 'bad';
      const t = x.days.map((d) => `${md(d[0])} ${n0(d[1])}t`).join(' · ');
      return `<div class="ln" data-dom="${x.pl}" title="최근 14일: ${t}"><div class="hd"><b>${x.line}</b>${x.fam ? `<span class="fam">${esc(x.fam)}</span>` : ''}<span class="pc ${cls}">${r == null ? '-' : Math.round(r * 100) + '%'}</span></div>
        <div class="nums"><b>${x.actual != null ? n0(x.actual) : '-'}</b> / 월차 ${x.month != null ? n0(x.month) : '-'}t · 일정 ${x.sched != null ? n0(x.sched) : '-'}</div>
        ${x.month ? `<div class="pb"><i style="width:${Math.min(100, x.actual / x.month * 100)}%"></i><em style="left:${Math.min(100, x.sched / x.month * 100)}%"></em></div>` : ''}
        ${spark(x.days)}<div class="nx">${x.next ? `다음 ${md(x.next[0])} ${esc(x.next[1])}` : `어제 ${n0(x.days[x.days.length - 1][1])}t`}</div></div>`;
    }).join('');
  }
  // 마케팅 그룹 표: 생산(실적/계획·남은·하루 필요·월말 예상) · 출하(실적/월차·일정 대비)
  function grp(O) {
    const G = (O.groups || []).filter((g) => UI.inScope(g.pl));
    if (!G.length) return '';
    let i = 0;
    const row = (g) => {
      const P = g.prod, D = dim(P.asOf.slice(0, 7)), el = +P.asOf.slice(8, 10), rem = D - el, left = Math.max(0, P.month - P.actual);
      const proj = P.actual + (P.after || 0), r = P.month ? proj / P.month : 1, st = left <= 0 || r >= 0.98 ? '' : r >= 0.9 ? 'warn' : 'bad';
      const w = Math.max(P.month, proj, 1) * 1.02, S = g.ship;
      return `<tr data-dom="${g.pl}"><td class="nm"><i class="${st}"></i>${esc(g.name.replace('(컬러 소재)', ''))}</td>
        <td class="gbar"><div class="hb" title="실적 ${n0(P.actual)} · 남은 계획대로면 ${n0(proj)} · 월 계획 ${n0(P.month)}"><i style="width:${P.actual / w * 100}%;--i:${i}"></i><u style="left:${P.actual / w * 100}%;width:${Math.max(0, proj - P.actual) / w * 100}%"></u><em style="left:${P.month / w * 100}%"></em></div></td>
        <td><b>${n0(P.actual)}</b><span class="mu"> / ${n0(P.month)}</span></td><td class="hide-m">${n0(left)}</td><td class="hide-m">${rem ? n0(left / rem) : '-'}</td>
        <td>${pc(proj, P.month)}%</td>
        <td>${S ? `<b>${n0(S.actual)}</b><span class="mu"> / ${n0(S.month)}</span>` : '<span class="mu">-</span>'}</td><td class="hide-m">${S ? sg(S.actual - S.sched) : ''}</td></tr>`.replace('--i:' + i, '--i:' + (i++));
    };
    const sec = (pl, t) => { const L = G.filter((g) => g.pl === pl); return L.length ? `<tr class="sec" data-dom="${pl}"><td colspan="8">${t}</td></tr>` + L.map(row).join('') : ''; };
    const g0 = G.find((g) => g.pl === 'G'), c0 = G.find((g) => g.pl === 'C'), s0 = (G.find((g) => g.ship) || {}).ship;
    return `<h2>마케팅 그룹별 이번 달 <small>${g0 ? `도금 ~${md(g0.prod.asOf)}` : ''}${c0 ? ` · 컬러 ~${md(c0.prod.asOf)}` : ''}${s0 ? ` · 출하 ${esc(String(s0.asOf).slice(5, 10).replace('-', '/'))} 속보` : ''}</small><span class="unit">톤</span></h2>
      <div class="scroll"><table class="gt"><thead><tr><th class="l">그룹</th><th class="l">생산 진도 <span style="font-weight:400">(줄무늬 = 남은 계획, 선 = 월 계획)</span></th><th>실적 / 계획</th><th class="hide-m">남은</th><th class="hide-m">하루 필요</th><th>월말 예상</th><th>출하 / 월차</th><th class="hide-m">일정 대비</th></tr></thead>
      <tbody>${sec('G', '도금')}${sec('C', '컬러')}</tbody></table></div>`;
  }
  function exCard(O) {
    let E = (O.exceptions || []).filter((e) => UI.inScope(exPl(e)));
    if (role === 'exec') E = E.filter((e) => e.lvl === 'bad').concat(E.filter((e) => e.lvl !== 'bad')).slice(0, 5);
    else if (RWHO[role]) E = E.filter((e) => String(e.who).includes(RWHO[role]) || e.area === '자료');
    const nb = E.filter((e) => e.lvl === 'bad').length, N = 8;
    return `<h2>오늘 볼 것 <small>${E.length}건${nb ? ` · 심각 ${nb}` : ''}</small></h2>
      <div class="exl">${E.slice(0, N).map((e) => `<a class="ex ${e.lvl}" href="${e.link}" title="${esc(e.text)} — ${esc(e.who)}"><i></i><span class="ar">${esc(e.area)}</span><span class="t">${esc(e.text)}</span></a>`).join('') || '<p class="small">기준을 넘은 항목 없음</p>'}</div>
      ${E.length > N ? `<details class="more"><summary>${E.length - N}건 더</summary><div class="exl">${E.slice(N).map((e) => `<a class="ex ${e.lvl}" href="${e.link}"><i></i><span class="ar">${esc(e.area)}</span><span class="t">${esc(e.text)}</span></a>`).join('')}</div></details>` : ''}`;
  }
  function loadCard(O) {
    const p = O.planMonth || O.plating, mx = Math.max(...O.months.map((m, i) => p.g1[i] + p.g2[i])) * 1.04;
    return `<h2>월별 도금 계획 <small>${O.planMonth ? '실적 + 최신 재계획' : O.rec}</small><span class="unit">톤</span></h2><div class="legend"><span><i style="background:var(--c1)"></i>1CGL</span><span><i style="background:var(--c2)"></i>2CGL</span></div>
      ${O.months.map((m, i) => { const a = p.g1[i], b = p.g2[i]; return `<div class="lrow"><span>${+m.slice(5)}월</span><div class="track"><i class="seg s1" style="width:${a / mx * 100}%;--i:${i}" data-tip="${+m.slice(5)}월 1CGL ${n0(a)}t"></i><i class="seg s2" style="left:${a / mx * 100}%;width:${b / mx * 100}%;--i:${i}" data-tip="${+m.slice(5)}월 2CGL ${n0(b)}t"></i></div><span class="pct">${n0(a + b)}</span></div>`; }).join('')}`;
  }
  function colorCard(O) {
    const cl = O.color.lines;
    return `<h2>컬러 월차 편성률 <small>편성 / 월차</small></h2><div class="crow hd"><span></span>${['1CCL', '2CCL', '3CCL', '4CCL'].map((l) => `<span>${l}</span>`).join('')}</div>
      ${O.months.map((m, i) => `<div class="crow"><span>${+m.slice(5)}월</span>${['1CCL', '2CCL', '3CCL', '4CCL'].map((l, j) => { const x = (cl[m] || {})[l] || { plan: 0, placed: 0 }; const r = x.plan ? x.placed / x.plan : 0; return `<div class="cl" title="${+m.slice(5)}월 ${l} 편성 ${n0(x.placed)} / 월차 ${n0(x.plan)}t"><i class="${r < 0.995 ? 'short' : ''}" style="width:${Math.min(100, r * 100)}%;--i:${i * 4 + j}"></i><span>${(r * 100).toFixed(r < 0.995 ? 1 : 0)}%</span></div>`; }).join('')}</div>`).join('')}`;
  }
  function stockCard(O) {
    const L = ((O.sr || {}).stock || []).filter((x) => x.target);
    if (!L.length) return '';
    const mx = Math.max(...L.map((x) => Math.max(x.current, x.target))) * 1.08;
    return `<h2>재고 vs 목표 <small>판매생산속보</small><span class="unit">톤</span></h2>
      ${L.map((x, i) => { const r = x.current / x.target, c = r > 1.3 || r < 0.7 ? 'var(--bad)' : r > 1.15 || r < 0.85 ? 'var(--warn)' : 'var(--good)'; return `<div class="lrow" style="grid-template-columns:96px 1fr 50px"><span style="font-size:12.5px">${esc(x.name.replace('(판매재)', ''))}</span><div class="track" style="height:16px"><i class="seg" style="left:0;width:${x.current / mx * 100}%;background:${c};border-radius:4px;--i:${i}" data-tip="${esc(x.name)} 현재 ${n0(x.current)}t / 목표 ${n0(x.target)}t"></i><em style="position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink);left:${x.target / mx * 100}%"></em></div><span class="pct" style="color:${c}">${Math.round(r * 100)}%</span></div>`; }).join('')}
      <p class="small" style="margin:4px 0 0">세로선 = 목표</p>`;
  }
  function dueCard(O) {
    const sc = UI.scope(), q = sc === 'all' ? O.procure : (O.procureBy || {})[sc] || O.procure;
    if (!q) return '';
    return `<h2>발주 시한 임박 <small>1순위 업체 · 2주 안</small><span class="unit">톤</span></h2>
      <table class="mini"><tbody>${(q.nearTop || []).slice(0, 6).map((x) => `<tr><td><b>${md(x.deadline)}</b></td><td>${esc(x.mat)}</td><td class="r">${n0(x.t)}</td><td class="small">${esc(String(x.sup || '').slice(0, 10))}</td></tr>`).join('') || '<tr><td class="small">없음</td></tr>'}</tbody></table>
      <a class="more" href="procure.html">조달 판단 →</a>`;
  }
  function basis(O) {
    const now = (O.plating || {}).now || {};
    return `<summary>숫자 기준 · 알림</summary><ul>
      <li>생산·출하 누계, 월차, 일정 = 판매생산속보(공식). 라인 14일 추이 = MES 코일(도금 더미 제외).</li>
      <li>그룹 실적 = MES 판매그룹. 계획 = 도금 확정 ${esc(O.rec)} 일별 합 · 컬러 편성. 월말 예상 = 실적 + 남은 계획(도금 매일 재계획).</li>
      <li>그룹별 날짜 계획 누계는 비교하지 않음(부서 배정일은 계획 모델상 정해지지 않음). 컬러 그룹 합은 MES 코일 합이라 속보 누계와 다를 수 있음.</li>
      ${(now.lockNotes || []).map((n) => `<li>재계획: ${esc(n)}</li>`).join('')}${(now.shortBy || []).length ? `<li>결품 예상: ${now.shortBy.map(esc).join(', ')}</li>` : ''}</ul>`;
  }

  function render(O) {
    lastO = O;
    $('h-meta').innerHTML = `실적 <b>~${md(O.asOf)}</b> · 계획 <b>${O.planMonth ? '기준 재수립·매일 재계획' : esc(O.rec)}</b> · 계산 ${esc(String(O.built).replace('T', ' ').slice(5, 16))}`;
    $('h-k').innerHTML = kstrip(O);
    $('h-lines').innerHTML = lines(O);
    const gh = grp(O); $('h-grp').innerHTML = gh; $('h-grp').hidden = !gh;
    $('h-ex').innerHTML = exCard(O); $('h-ex').hidden = false;
    $('h-load').innerHTML = loadCard(O); $('h-load').hidden = false;
    $('h-color').innerHTML = colorCard(O); $('h-color').hidden = false;
    const dc = dueCard(O); $('h-due').innerHTML = dc; $('h-due').hidden = !dc;
    const sk = stockCard(O); $('h-stock').innerHTML = sk; $('h-stock').hidden = !sk;
    $('h-basis').innerHTML = basis(O); $('h-basis').hidden = false;
    UI.reveal(document); UI.count(document);
    const tip = $('h-tip');
    document.querySelectorAll('[data-tip]').forEach((s) => {
      s.addEventListener('mousemove', (e) => { tip.textContent = s.dataset.tip; tip.style.display = 'block'; tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 34) + 'px'; });
      s.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  }

  let env = null;
  const envReady = GP.latest('portal.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;
    try { const O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } $('h-lock').hidden = true; render(O); UI.onScope(() => render(lastO)); }
    catch (e) { $('h-k').innerHTML = ''; $('h-lock').hidden = false; $('h-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('h-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('h-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else { $('h-k').innerHTML = ''; $('h-lock').hidden = false; }
  }).catch(() => { $('h-k').innerHTML = ''; $('h-lock').hidden = false; $('h-msg').textContent = '요약 자료를 찾을 수 없습니다'; });
})();
