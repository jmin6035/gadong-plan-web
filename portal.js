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
    ['가동계획', [['integrated.html', 'plan', '통합 가동계획', '컬러 → 도금 4분기 일별 계획, 버전 비교·재고 추이'], ['status.html', 'gantt', '가동 현황', '도금 1·2CGL 월별 간트, 강종 전환, 부서별 물량', 0, 'G'], ['rolling.html', 'calc', '계획 계산', '도금 실적을 넣어 다시 계산(롤링)하고 게시', 0, 'G']]],
    ['실적', [['analysis.html', 'chart', '도금 실적 분석', '도금 속도·손실·M/C 실적과 파라미터 보정 후보', 0, 'G'], ['color_actual.html', 'chart', '컬러 실적', '1~4CCL 진도·일별·주별 생산·속도·품명·휴지', true, 'C'], ['report.html', 'report', '주간 보고', '도금·컬러 주간 계획 대비 실적 보고 양식']]],
    ['소재', [['procure.html', 'truck', '조달 판단', '필요 시점별 가능 업체 추천, 구매 요청서', true], ['material.html', 'box', '소재 발주(월)', '업체 × 월 입고 필요량과 발주 마감(~27.3)']]],
    ['자료', [['health.html', 'help', '자료 상태', '원천 자료별 마지막 날짜·화면별 게시 시각 — 자동 실행 점검'], ['doc.html?d=glossary', 'book', '용어·정의 · 확인 대기', '숫자 정의 사전과 아직 확인 안 된 가정 목록', true], ['doc.html?d=conditions', 'book', '계획 조건식', '컬러·도금·소재 계산식과 보완할 점'], ['doc.html?d=procure_guide', 'help', '조달 판단 사용법', '사용 순서 10단계와 계산 조건'], ['doc.html?d=requests', 'mail', '협조 요청 메일', '전산·구매·판매·생산 요청 사항']]],
  ];

  $('h-groups').innerHTML = GROUPS.map(([g, L]) => `<div class="group"><h3>${g}</h3>${L.map(([u, ic, t, d, nw, only]) => `<a class="tile" href="${u}" data-rk="t-${u}"${only ? ` data-only="${only}"` : ''}><span class="ic">${IC[ic]}</span><b>${t}${nw ? '<em class="new">NEW</em>' : ''}</b><span>${d}</span>${only ? `<em class="only">${only === 'G' ? '도금' : '컬러'} 전용</em>` : ''}</a>`).join('')}</div>`).join('');
  UI.reveal(document);

  function kpi(tone, l, valHtml, b, href, ck) { return `<div class="kpi tone-${tone}" data-rk="k-${ck}">${href ? `<a class="go" href="${href}" aria-label="${esc(l)} 자세히"></a>` : ''}<div class="l">${l}</div><div class="v">${valHtml}</div><div class="b">${b}</div></div>`; }

  let lastO = null;
  const scN = { all: '', G: '도금 ', C: '컬러 ' };
  const ROLES = [['all', '전체'], ['exec', '임원'], ['plan', '생산기획'], ['buy', '구매'], ['sales', '판매']];
  const RWHO = { plan: '생산기획', buy: '구매', sales: '판매' };
  const RHINT = { all: '모든 항목', exec: '심각한 것만 · 결정 필요', plan: '가동·재계획·자료', buy: '발주 시한·기발주', sales: '재고·납기' };
  let role = 'all'; try { role = localStorage.getItem('cgl-role') || 'all'; } catch (e) { /* 무시 */ }
  function roleBar() {
    $('h-role').innerHTML = ROLES.map(([k, n]) => `<button type="button" data-r="${k}" aria-pressed="${k === role}">${n}</button>`).join('');
    $('h-rolehint').textContent = RHINT[role];
    $('h-role').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { role = b.dataset.r; try { localStorage.setItem('cgl-role', role); } catch (e) { /* 무시 */ } roleBar(); if (lastO) render(lastO); }));
  }
  roleBar();
  const exPl = (e) => (e.area === '도금' ? 'G' : e.area === '컬러' ? 'C' : e.area === '재고' ? (/컬러/.test(e.text) ? 'C' : /도금/.test(e.text) ? 'G' : 'GC') : 'GC');
  function exCard(O) {
    let E = (O.exceptions || []).filter((e) => UI.inScope(exPl(e)));
    if (role === 'exec') E = E.filter((e) => e.lvl === 'bad').concat(E.filter((e) => e.lvl !== 'bad')).slice(0, 5);
    else if (RWHO[role]) E = E.filter((e) => String(e.who).includes(RWHO[role]) || e.area === '자료');
    const nb = E.filter((e) => e.lvl === 'bad').length;
    return `<h2>오늘 볼 것 <small>${E.length}건${nb ? ` · 심각 ${nb}` : ''} · ${md(O.today || O.asOf)} 아침 자동 점검</small></h2>
      <div class="exl">${E.map((e, i) => `<a class="ex ${e.lvl}" href="${e.link}"><span class="no">${i + 1}</span><span class="ar">${esc(e.area)}</span><span>${esc(e.text)}</span><span class="who">${esc(e.who)} →</span></a>`).join('') || '<p class="lead">기준을 넘은 항목이 없습니다.</p>'}</div>
      <p class="small" style="margin-top:10px">기준: 실적 자료 2일 이상 멈춤 · 도금 라인 이틀 연속 계획 90% 미만 · 3일 안 납기 1일 이내 생산 · 컬러 라인 지난주 −20% 이하 또는 월 진도 95% 미만 · 1순위 발주 시한 3일 안 · 재고가 목표의 70% 미만/130% 초과</p>`;
  }
  function accCard(O) {
    const A = O.acc || {}; const L = Object.keys(A);
    if (!L.length) return '<h2>계획 정확도</h2><p class="small">이력이 아직 없습니다.</p>';
    return `<h2>계획 정확도 <small>전날 게시 계획 vs 다음 날 실적 · 최근 ${Math.max(...L.map((l) => A[l].days))}일</small><span class="unit">단위: 톤</span></h2>
      <div class="scroll"><table class="t acc"><thead><tr><th class="l">라인</th><th>계획</th><th>실적</th><th>편차</th><th>일평균 오차</th><th>계획 95% 미만</th></tr></thead><tbody>${L.map((l) => { const x = A[l]; return `<tr><td class="l"><b>${l}</b></td><td>${n0(x.plan)}</td><td><b>${n0(x.actual)}</b></td><td style="color:var(--${Math.abs(x.bias) < 5 ? 'good' : 'bad'});font-weight:800">${x.bias > 0 ? '+' : ''}${x.bias}%</td><td>${x.mae}%</td><td>${x.under}/${x.days}일</td></tr>
        <tr><td></td><td colspan="5" class="l"><div class="accd">${x.last.map((r) => `<span class="${r[3] < r[2] * 0.95 ? 'lo' : ''}">${md(r[0])} ${n0(r[3])}/${n0(r[2])}</span>`).join('')}</div></td></tr>`; }).join('')}</tbody></table></div>
      <p class="small" style="margin-top:8px">한쪽으로 계속 치우치면(편차 ±10% 이상) 재계획을 자주 하는 것보다 속도·강종 순서 같은 계획 조건을 실적으로 고쳐야 함 → <a href="analysis.html">도금 실적 분석</a>의 '반영권장'</p>`;
  }
  function render(O) {
    lastO = O;
    const sc = UI.scope(), p = O.plating, r = O.roll, c = O.color, q = sc === 'all' ? O.procure : (O.procureBy || {})[sc] || O.procure;
    const cl = c.lines, cm = O.months.map((m) => { const L = cl[m] || {}; const pl = Object.values(L).reduce((a, x) => a + x.plan, 0), pd = Object.values(L).reduce((a, x) => a + x.placed, 0); return [pl, pd]; });
    const tot = p.g1.reduce((a, x) => a + x, 0) + p.g2.reduce((a, x) => a + x, 0);
    const diff = r.actual - r.plan;
    $('h-asof').textContent = `실적 기준 ${md(r.asOf)} · 계획 ${O.rec}`;
    $('h-meta').innerHTML = `<span><b>실적</b>~${O.asOf}</span><span><b>확정 계획</b>${O.rec}</span><span><b>자료</b>MES 생산·재고, 판매계획, 소재재고</span><span><b>계산</b>${String(O.built).replace('T', ' ')}</span>`;
    const K = [
      ['G', kpi(p.short + p.late ? 'bad' : p.tightN ? 'warn' : 'good', '도금 납기 빠듯 (계획상 결품·지연 0)', `<b data-count="${p.tightN || 0}" data-ck="pt">0</b><small>건</small>`, `납기 2일 이내 생산 ${n0(p.tightT || 0)}t · 2CGL 하루 여유 최대 ${p.slack ? n0(p.slack['2CGL']) : '-'}분`, 'integrated.html', 'pl')],
      ['G', kpi(diff >= 0 ? 'good' : 'warn', `도금 생산 vs 확정 ${O.rec} (~${md(r.asOf)})`, `<b data-count="${r.actual}" data-ck="ra">0</b><small>t</small><span class="pm" style="color:var(--${diff >= 0 ? 'good' : 'warn'})">${diff >= 0 ? '▲' : '▼'} ${n0(Math.abs(diff))}</span>`, `확정 계획 누계 ${n0(r.plan)}t (${(r.actual / r.plan * 100).toFixed(0)}%) · MES 생산, 더미 제외`, 'status.html', 'ra')],
      ['C', kpi(c.unplaced[0] > 0 ? 'warn' : 'good', '컬러 미편성 (10월)', `<b data-count="${c.unplaced[0]}" data-ck="cu">0</b><small>t</small>`, `11월 ${n0(c.unplaced[1])}t · 12월 ${n0(c.unplaced[2])}t — 라인 전용 품목`, 'integrated.html', 'cu')],
      ['C', kpi(cm[0][1] < cm[0][0] ? 'warn' : 'good', '컬러 10월 월차 편성률', `<b data-count="${(cm[0][1] / cm[0][0] * 100).toFixed(1)}" data-dec="1" data-ck="cr">0</b><small>%</small>`, `편성 ${n0(cm[0][1])} / 월차 ${n0(cm[0][0])}t · 11월 ${(cm[1][1] / cm[1][0] * 100).toFixed(1)}%`, 'integrated.html', 'cr')],
      ['GC', kpi(q.near ? 'warn' : 'good', `${{ all: '소재', G: '도금 FH', C: '컬러 소재' }[sc]} 1순위 발주 시한 2주 안`, `<b data-count="${q.near}" data-ck="qn">0</b><small>건</small>`, q.nearTop[0] ? `가장 급함 ${esc(q.nearTop[0].mat)} · 시한 ${md(q.nearTop[0].deadline)}` : '-', 'procure.html', 'qn')],
    ];
    $('h-kpis').innerHTML = (sc === 'all' ? [K[0], K[1], K[2], K[4]] : K.filter(([pl]) => UI.inScope(pl))).map((x) => x[1]).join('');
    // 월별 도금 계획(라인 누적)
    const mx = Math.max(...O.months.map((m, i) => p.g1[i] + p.g2[i])) * 1.04;
    $('h-load').innerHTML = `<h2>월별 도금 생산계획 <small>${O.rec} · 라인별</small><span class="unit">단위: 톤</span></h2>
      <div class="legend"><span><i style="background:var(--c1)"></i>1CGL</span><span><i style="background:var(--c2)"></i>2CGL</span></div>
      <div class="load" role="img" aria-label="월별 도금 생산계획 1CGL·2CGL">${O.months.map((m, i) => {
        const a = p.g1[i], b = p.g2[i];
        return `<div class="lrow"><span class="m">${+m.slice(5)}월</span><div class="track"><i class="seg s1" style="width:${a / mx * 100}%;--i:${i}" data-tip="${+m.slice(5)}월 1CGL ${n0(a)}t"></i><i class="seg s2" style="left:${a / mx * 100}%;width:${b / mx * 100}%;--i:${i}" data-tip="${+m.slice(5)}월 2CGL ${n0(b)}t"></i></div><span class="pct">${n0(a + b)}</span></div>`;
      }).join('')}</div>
      <details style="margin-top:12px"><summary class="small" style="cursor:pointer">표로 보기</summary><div class="scroll" style="margin-top:8px"><table class="t"><thead><tr><th class="l">월</th><th>1CGL</th><th>2CGL</th><th>합계</th></tr></thead><tbody>${O.months.map((m, i) => `<tr><td class="l">${+m.slice(5)}월</td><td>${n0(p.g1[i])}</td><td>${n0(p.g2[i])}</td><td><b>${n0(p.g1[i] + p.g2[i])}</b></td></tr>`).join('')}</tbody></table></div></details>
`;
    $('h-color').innerHTML = `<h2>컬러 라인 월차 편성 <small>편성 / MES 월차</small><span class="unit">단위: %</span></h2>
      <div class="crow hd"><span></span>${['1CCL', '2CCL', '3CCL', '4CCL'].map((l) => `<span>${l}</span>`).join('')}</div>
      ${O.months.map((m, i) => `<div class="crow"><span class="m">${+m.slice(5)}월</span>${['1CCL', '2CCL', '3CCL', '4CCL'].map((l, j) => { const x = (cl[m] || {})[l] || { plan: 0, placed: 0 }; const pc = x.plan ? x.placed / x.plan : 0; return `<div class="cl" title="${+m.slice(5)}월 ${l} 편성 ${n0(x.placed)} / 월차 ${n0(x.plan)}t"><i class="${pc < 0.995 ? 'short' : ''}" style="width:${Math.min(100, pc * 100)}%;--i:${i * 4 + j}"></i><span>${(pc * 100).toFixed(pc < 0.995 ? 1 : 0)}%</span></div>`; }).join('')}</div>`).join('')}
      <p class="small" style="margin-top:8px">주황 = 월차를 다 못 채움(라인 전용 품목 미편성) · 10월 미편성 ${n0(c.unplaced[0])}t</p>`;
    $('h-rec').innerHTML = `<h2>확정 계획 <small>${O.rec} · 2026-10-07</small></h2><div class="decide"><b class="tag">진행</b><br>${esc(O.recWhy)}</div>`;
    $('h-due').innerHTML = `<h2>${scN[sc]}발주 시한 임박 <small>1순위 업체 기준 · 2주 안</small><span class="unit">단위: 톤</span></h2>
      <div class="scroll"><table class="t"><thead><tr><th class="l">시한</th><th class="l">소재</th><th class="l">업체</th><th>첫 필요일</th><th>부족</th></tr></thead><tbody>${q.nearTop.map((x) => `<tr><td class="l"><b>${md(x.deadline)}</b></td><td class="l">${esc(x.mat)}</td><td class="l">${esc(x.sup)}</td><td>${md(x.first)}</td><td>${n0(x.t)}</td></tr>`).join('') || '<tr><td colspan="5" class="c muted">없음</td></tr>'}</tbody></table></div>
      <div class="kpis" style="margin-top:14px;grid-template-columns:1fr 1fr">
        ${kpi(q.alt ? 'warn' : 'good', '대체 업체 필요 (2~4주)', `<b data-count="${q.alt}" data-ck="qa">0</b><small>건</small>`, '1순위 리드타임 초과', '', 'qa')}
        ${kpi(q.check ? 'warn' : 'good', '기발주 확인 (2~4주)', `<b data-count="${q.check}" data-ck="qc">0</b><small>건</small>`, '리드타임 안쪽 수량', '', 'qc')}</div>
      <p class="small" style="margin-top:10px">조달 판단 화면의 기본값(여유 5일, 기발주 미입력) 기준 — 입력한 기발주·판단은 <a href="procure.html">조달 판단</a>에서 확인</p>`;
    $('h-ex').innerHTML = exCard(O); $('h-ex').hidden = false;
    $('h-acc').innerHTML = accCard(O);
    $('h-detail').hidden = false;
    UI.reveal(document); UI.count(document);
    const tip = $('h-tip');
    document.querySelectorAll('.seg').forEach((s) => {
      s.addEventListener('mousemove', (e) => { tip.textContent = s.dataset.tip; tip.style.display = 'block'; tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 34) + 'px'; });
      s.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  }

  let env = null;
  const envReady = GP.latest('portal.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;                              // 자료를 받기 전에 암호를 넣은 경우
    try { const O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } $('h-lock').hidden = true; render(O); UI.onScope(() => render(lastO)); }
    catch (e) { $('h-kpis').innerHTML = ''; $('h-lock').hidden = false; $('h-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('h-form').addEventListener('submit', (e) => { e.preventDefault(); $('h-kpis').innerHTML = '<div class="skel" style="grid-column:1/-1"><i style="width:30%"></i><i></i></div>'; unlock($('h-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else { $('h-kpis').innerHTML = ''; $('h-lock').hidden = false; }
  }).catch(() => { $('h-kpis').innerHTML = ''; $('h-lock').hidden = false; $('h-msg').textContent = '요약 자료를 찾을 수 없습니다'; });
})();
