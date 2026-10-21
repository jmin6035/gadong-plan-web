/* 도금 작업지시 순서 제안: published/cg_wo_proposal.enc.json (tools/cg_wo_sequence.py)
   라인 탭 → 요약(1010 대상 · 제안대로면 · 예상 더미 · MES 비교) → 표면사상 묶음 → 날짜별 제안 순서(하루 띠) → 편성 조건 · 더미 기준표(접힘 유지) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toFixed(1));
  const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '');
  const WD = '일월화수목금토';
  const dayNm = (d) => `${md(d)}(${WD[new Date(d + 'T00:00:00').getDay()]})`;
  const tm = (s, d) => (!s ? '' : (d && s.slice(0, 5) === d.slice(5) ? s.slice(6) : `${+s.slice(0, 2)}/${+s.slice(3, 5)} ${s.slice(6)}`));
  const hm = (m) => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
  let O = null, line = null;
  let view = 'seq';                                               // 탭: 작업지시 순서 | 작업지시 규칙(사용자 10/21) — 다시 바꿀 때까지 유지
  try { view = location.hash === '#rules' ? 'rules' : (localStorage.getItem('cgwo-view') || 'seq'); } catch (e) { /* 기본 */ }
  const tabs = () => `<div class="seg pgtab" id="wo-view"><button type="button" data-v="seq" aria-pressed="${view === 'seq'}">작업지시 순서</button><button type="button" data-v="rules" aria-pressed="${view === 'rules'}">작업지시 규칙</button></div>`;
  function bindTabs() {
    $('wo-view').querySelectorAll('button').forEach((b) => b.onclick = () => { view = b.dataset.v; try { localStorage.setItem('cgwo-view', view); history.replaceState(null, '', view === 'rules' ? '#rules' : location.pathname); } catch (e) { /* 무시 */ } render(); });
  }

  function row(x, day) {
    const dn = x.exp >= 0.05;
    const t = x.trt;
    const spec = `<div class="sp1">${x.thick} × ${n0(x.width)} <span class="bk">· 표면사상 ${esc(x.sur)}${t && t.cot ? ` · 도금량 ${esc(t.cot)}` : ''}</span></div>`
      + (t ? `<div class="sp2" title="${esc(t.src)}"><b>후처리</b> ${esc(t.aft || '-')} <span class="bk">${esc(t.aftNm || '')}</span></div><div class="sp2"><b>도유</b> ${esc(t.oil || '-')} <span class="bk">${esc(t.oilNm || '')}</span></div>`
        : '<div class="sp2 bk">후처리·도유 — 계약 연결 대기</div>');
    return `<tr${dn ? ' class="hasdn"' : ''}><td class="c"><b>${x.seq}</b></td>`
      + `<td class="tm">${dn ? `<span class="bk">더미 ${tm(x.downStart, day)}</span><br>` : ''}<b>${tm(x.start, day)}</b> – ${tm(x.end, day)}</td>`
      + `<td class="l"><b>${esc(x.raw)}</b>${x.conf ? '' : '<span class="gt gt3">미확정</span>'}<br><span class="bk">${x.con ? esc(x.con) : '계약 연결 대기'}</span></td>`
      + `<td class="c">${md(x.req) || '-'}</td>`
      + `<td class="l wr">${spec}</td>`
      + `<td class="num" title="톤은 추정(1010 표에 무게가 없음): 같은 두께·폭 제품 코일 무게 × 생산코일 ${esc(x.cnt)}개 · 속도 ${esc(x.tphSrc)}"><b>${n1(x.t)}t</b> · ${n0(x.runMin)}분<br><span class="bk">추정 ${esc(x.cnt)}코일 · ${n1(x.tph)}t/h</span></td>`
      + `<td class="l chg">${(x.chg || []).map((c) => `<div>${esc(c)}</div>`).join('')}</td>`
      + `<td class="l wr">${(x.downs || []).length ? ((x.downs.length > 1 && dn) ? `<div class="wo-ds">합계 ${n1(x.exp)}분</div>` : '') + x.downs.map((d) => `<div class="wo-dl"><b>${esc(d.c)}</b> <span class="wo-dm">${n1(d.m)}분</span><div class="bk">${esc(d.b)}</div></div>`).join('') : '<span class="bk">없음</span>'}</td></tr>`;
  }
  const HEAD = '<thead><tr><th>순서</th><th>시간 (추정)</th><th class="l">소재 코일 · 계약</th><th>생산요청일</th><th class="l">두께 × 폭 · 후처리 · 도유</th><th>톤 · 생산</th><th class="l">앞 코일과 바뀌는 것</th><th class="l">예상 더미 (분 · 근거)</th></tr></thead>';
  const NC = 8;
  const mins = (s, d) => { if (!s) return 0; const sd = s.slice(0, 5), dd = d.slice(5); if (sd < dd) return 0; if (sd > dd) return 1440; return (+s.slice(6, 8)) * 60 + (+s.slice(9, 11)); };
  function strip(v, d, byS) {
    const seg = [];
    const add = (a, b, cls, tip) => { const x0 = mins(a, d), x1 = mins(b, d); if (x1 > x0) seg.push(`<i class="${cls}" style="left:${(x0 / 14.4).toFixed(2)}%;width:${(Math.max(x1 - x0, 2) / 14.4).toFixed(2)}%" title="${esc(tip)}"></i>`); };
    (v.events || []).forEach((e) => { const x = byS[e.seq]; if (!x) return; if (x.exp >= 0.05) add(x.downStart, x.start, 'sd', `${x.seq} 앞 예상 더미 ${n1(x.exp)}분`); add(x.start, x.end, 'sr', `${x.seq} ${x.raw} ${x.thick}×${n0(x.width)} ${n1(x.t)}t`); });
    return `<div class="strip">${seg.join('')}<span class="h0">0시</span><span class="h6">6</span><span class="h12">12</span><span class="h18">18</span><span class="h24">24시</span></div>`;
  }
  function table(v) {
    const byS = {}; v.items.forEach((x) => { byS[x.seq] = x; });
    let h = '', cur = null;
    v.items.forEach((x) => {
      if (x.day !== cur) {
        cur = x.day;
        const s = (v.days || {})[cur] || {};
        h += `<tr class="day"><td colspan="${NC}"><div class="dayh"><b>${dayNm(cur)}</b><span>${n0(s.n)}코일 · ${n0(s.t)}t(추정) · 생산 ${hm(s.run || 0)} · <em>예상 더미 ${n1(s.down)}분</em></span></div>${strip(v, cur, byS)}</td></tr>`;
      }
      h += row(x, cur);
    });
    return `<div class="scroll"><table class="t wo cgwo"><colgroup><col style="width:54px"><col style="width:124px"><col style="width:160px"><col style="width:84px"><col style="width:210px"><col style="width:124px"><col><col style="width:190px"></colgroup>${HEAD}<tbody>${h}</tbody></table></div>`
      + '<p class="hint lg"><i class="sr"></i>생산 <i class="sd"></i>예상 더미(앞 코일과 바뀜) — 띠에 마우스를 올리면 내용이 보입니다. 시각·톤은 추정(1010 표에 무게가 없음)</p>';
  }

  function conditions(l) {
    const C = [
      ['편성 대상', 'SSCHB1010 이 고른 소재 코일 전부(확정여부 Y·N) — 1010 이 쓰는 표 PF_CG_FORECAST_ORD. 여러 날치가 한꺼번에 올라옴', 'cg_forecast_daily (매일 쌓는 중, 10/20 부터)', '대상 정의'],
      ['① 강종', '확정 계획(MILP)이 정한 그날 강종 그대로 — M/C 날짜는 여기서 안 바꿈', '확정 계획 도금 일별', '반드시 지킴'],
      ['② 표면사상끼리', '같은 표면사상 코일을 묶어 한 번만 바뀌게 (1010 에서 먼저 나온 표면사상부터)', 'SUR_FIN', '반드시 지킴'],
      ['③ 더미 최소', '앞 코일 → 다음 코일에서 바뀐 것별 예상 더미 분(아래 표) 합이 가장 적은 순서 — 결과적으로 비슷한 두께끼리, 크게 넓어지는 전환을 피함', '3개월 코일 실적', '최대한'],
      ['④ 넓은 폭 → 좁은 폭', '더미 분이 같으면 폭이 좁아지는 쪽으로, 그것도 같으면 1010 순서 그대로', 'RAW_WDT', '최대한'],
      ['⑤ 후처리 조건', 'NX 3연속 불가 등 — 사용자 조건(다음 주) 받으면 넣음', '-', '대기'],
      ['시각 계산', '출발 = 지금. 코일마다 예상 더미 → 생산(톤 ÷ t/h). 톤 = 같은 두께·폭 제품 코일 무게 × 생산코일건수(추정), t/h = 3개월 실적 중앙값', '코일 실적', '추정'],
    ];
    const T = O.cond || [], f1 = (v) => (v >= 0.05 ? n1(v) : '0');
    const pt = O.condSrc === '학습 방 1년 조건표';
    const rows = T.map((r) => { const x = r.lines[l] || {}; return x.n ? `<tr><td class="l">${esc(r.cond)}${x.stage && x.stage !== '기본' ? ` <span class="bk">(${esc(x.stage)})</span>` : ''}</td><td class="num">${n0(x.n)}</td><td class="num">${(x.rate * 100).toFixed(0)}%</td><td class="num">${pt ? `${x.dn ?? '-'}코일 · ${x.dt ?? '-'}t` : (x.minIf ? n0(x.minIf) : '-')}</td><td class="num"><b>${f1(x.exp)}</b></td></tr>` : ''; }).join('');
    const lr = O.learnRange || [], cv = (O.condVal || {})[l];
    return `<section class="card"><h2>편성 조건 <small class="bk">이 순서로 봅니다 — ${l}</small></h2>`
      + '<div class="scroll"><table class="t cond"><thead><tr><th>조건</th><th class="l">내용</th><th class="l">MES 칸·자료</th><th>지키는 정도</th></tr></thead><tbody>'
      + C.map((r) => `<tr><td class="l"><b>${r[0]}</b></td><td class="l wrap">${r[1]}</td><td class="l bk">${r[2]}</td><td>${r[3]}</td></tr>`).join('') + '</tbody></table></div></section><section class="card">'
      + `<h3>더미·전환 기준표 — ${l} (같은 강종 안, 바뀐 것마다 더함)</h3>`
      + (pt ? `<p class="hint">도금은 코일을 이어 붙여 돌려서, 사양이 바뀌면 라인이 서는 대신 더미 코일이 들어감. 기준 = <b>지난 1년 코일 실적으로 만든 전환 조건표</b> — 매일 갱신(바뀐 값은 아래 '기준 변경 이력'). 예상 시간 = 바뀐 것별 더미 작업·짧은 휴지 분(조건끼리 겹치는 시간은 뺌).${cv ? ` 검증(${esc(cv.period)}): 하루 실제 ${cv.actual}분 · 표 ${cv.pred}분 · 상관 ${cv.corr} — <b>아직 약함</b> — 코일별 휴지 상세 자료로 다시 맞추는 중.` : ''}</p>`
        : `<p class="hint">${esc(lr[0] || '')}~${esc(lr[1] || '')} 실제 코일 사이에 더미가 들어간 비율 × 들어가면 더미 작업 분(잠정).</p>`)
      + `<div class="scroll"><table class="t cond dtab"><thead><tr><th class="l">바뀌는 것</th><th>${pt ? '1년' : '3개월'} 건수</th><th>더미 들어간 비율</th><th>${pt ? '더미(코일·톤)' : '들어가면 더미(분)'}</th><th>예상 시간(분)</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + learnBox() + '</section>';
  }

  function learnBox() {             // 기준 변경 이력(보고용, tools/learn_sync.publish): 적용한 기준 변경 · 검토 결과
    const E = O.learnLog || [];
    if (!E.length || !E[0].applied) return '<h3>기준 변경 이력</h3><p class="hint">최근 바뀐 기준 없음</p>';
    const sgn = (p) => (p == null ? '-' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`);
    const ST = { '적용 중': 'ok', '휴지 기준으로 반영': 'ok', '미적용': 'no', '점검용': 'mid', '검토 중': 'mid' };
    return '<h3>기준 변경 이력</h3>' + E.slice().reverse().map((e) => `<div class="lg-day"><b>${esc(e.at)}</b></div>`
      + (e.applied.length ? '<div class="scroll"><table class="t cond lgt"><thead><tr><th class="l">조정한 기준</th><th>이전</th><th>변경</th><th>증감</th></tr></thead><tbody>'
        + e.applied.map((c) => `<tr><td class="l">${esc(c.what)}</td><td class="num">${esc(c.before)}${c.u}</td><td class="num"><b>${esc(c.after)}${c.u}</b></td><td class="num">${sgn(c.pct)}</td></tr>`).join('') + '</tbody></table></div>' : '')
      + (e.review.length ? '<div class="scroll"><table class="t cond lgt"><thead><tr><th>구분</th><th class="l">검토한 조건·규칙</th><th class="l">근거 수치</th><th>결과</th><th class="l">비고</th></tr></thead><tbody>'
        + e.review.map((r) => `<tr><td>${esc(r.kind)}</td><td class="l wrap">${esc(r.what)}</td><td class="l bk wrap">${esc(r.detail || '-')}</td><td><span class="lgs ${ST[r.status] || 'mid'}">${esc(r.status)}</span></td><td class="l bk wrap">${esc(r.why || '')}</td></tr>`).join('') + '</tbody></table></div>' : '')).join('');
  }


  function renderRules() {
    const L = Object.keys(O.lines);
    line = line && L.includes(line) ? line : L[0];
    $('wo-meta').textContent = `${O.now} 기준(지금) · 계산 ${O.built || ''}`;
    $('wo-main').innerHTML = tabs() + `<section class="card"><div class="seg" id="wo-lines">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l}</button>`).join('')}</div></section>` + conditions(line);
    $('wo-lines').querySelectorAll('button').forEach((b) => b.onclick = () => { line = b.dataset.l; renderRules(); });
    bindTabs();
    if (window.UI) UI.reveal($('wo-main'));
  }
  function render() {
    if (view === 'rules') { renderRules(); return; }
    const L = Object.keys(O.lines);
    line = line && L.includes(line) ? line : L[0];
    const v = O.lines[line];
    $('wo-meta').textContent = `${O.now} 기준(지금) · 계산 ${O.built || ''}`;
    const gain = (v.mes || 0) - (v.ours || 0);
    const plan = v.plan ? Object.entries(v.plan).map(([a, t]) => `${a} ${n0(t)}t`).join(' · ') : '-';
    const blk = (v.blocks || []).map((b) => `<span class="cgb"><b>${esc(b.sur)}</b> ${n0(b.n)}코일 · ${n0(b.t)}t</span>`).join('<span class="cga">→</span>');
    $('wo-main').innerHTML = tabs() + (O.missing && O.missing.length ? `<div class="miss"><b>아직 안 들어온 자료·조건</b> — ${O.missing.map(esc).join(' / ')}</div>` : '')
      + `<section class="card"><div class="seg" id="wo-lines">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l} <small>${O.lines[l].n}코일</small></button>`).join('')}</div>`
      + '<div class="kpis" style="margin-top:12px">'
      + `<div class="kpi"><div class="l">1010 대상</div><div class="v">${n0(v.n)}<small>코일 ${n0(v.tSum)}t</small></div><div class="b">확정 ${n0(v.nConf)}코일 · 톤은 추정 · 확정 계획 ${esc(md(v.day))} 강종 ${esc(plan)}</div></div>`
      + `<div class="kpi"><div class="l">제안 순서대로면</div><div class="v">${v.until ? esc(tm(v.until)) : '-'}<small>까지</small></div><div class="b">${esc(tm(v.from))} 출발 · 생산 ${hm(v.runSum || 0)}</div></div>`
      + `<div class="kpi"><div class="l">예상 더미 (제안 순서)</div><div class="v wv">${n1(v.ours)}<small>분</small></div><div class="b">사양 바뀜 ${n0(v.oursChg)}번</div></div>`
      + '</div>'
      + (v.n ? `<div class="wo-cmp${gain < 0 ? ' bad' : ''}"><b>1010 순서와 비교</b> — 같은 ${n0(v.n)}코일을 1010 에 들어간 순서대로 돌리면 예상 더미 ${n1(v.mes)}분 (사양 바뀜 ${n0(v.mesChg)}번) → 제안이 <b>${gain >= 0 ? `${n1(gain)}분 짧음` : `${n1(-gain)}분 김`}</b> <span class="bk">(같은 더미 기준표)</span></div>` : '')
      + (blk ? `<div class="cgbs"><span class="bk">표면사상 묶음</span> ${blk}</div>` : '')
      + '</section>'
      + (v.n ? `<section class="card"><h2>제안 순서 <small class="bk">날짜별 · 줄마다 그 코일 앞에 생길 더미와 생산</small></h2>${table(v)}</section>` : '<section class="card"><p>1010 대상 코일이 없습니다.</p></section>');
    $('wo-lines').querySelectorAll('button').forEach((b) => b.onclick = () => { line = b.dataset.l; render(); });
    bindTabs();
    if (window.UI) UI.reveal($('wo-main'));
  }
  const envReady = GP.latest('cg_wo_proposal.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('wo-msg').textContent = '아직 게시된 제안이 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('wo-form').hidden = false; $('wo-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    if (!O.lines || !Object.values(O.lines).every((v) => !v.n || v.events)) { $('wo-msg').textContent = '예전 형식의 제안입니다 — 다시 계산 후 게시가 필요합니다.'; return; }
    render();
  }
  $('wo-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('wo-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('wo-form').hidden = false; });
})();
