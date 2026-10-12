/* 컬러 조건 분석: published/color_cond.enc.json (cglplan/color_cond.py)
   ① 핵심(라인별 계획 대비 속도) ② 라인별 비교 ③ 품명·라인별 차이 ④ 기준 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1));
  const n2 = (v) => (v == null || isNaN(v) ? '-' : v.toFixed(2));
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const pc = (r) => (r == null ? '-' : `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(1)}%`);
  const COL = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
  let O = null, pl = 'all';
  const card = (id, title, sm, unit, body) => `<section class="card" id="${id}"><h2>${esc(title)} ${sm ? `<small>${esc(sm)}</small>` : ''}${unit ? `<span class="unit">${unit}</span>` : ''}</h2>${body}</section>`;
  const verdict = (idx) => (idx == null ? ['-', ''] : Math.abs(idx - 1) < 0.05 ? ['계획 조건 맞음', 'good'] : idx < 1 ? ['계획보다 느림 — 조건 조정 검토', 'bad'] : ['계획보다 빠름 — 여유', 'info']);

  function kpis() {
    const k = (tone, l, v, b, ck) => `<div class="kpi tone-${tone}" data-rk="k-${ck}"><div class="l">${l}</div><div class="v"><b>${v}</b></div><div class="b">${b}</div></div>`;
    const t = O.tot;
    const all = k(Math.abs(t.idx - 1) < 0.05 ? 'good' : t.idx < 1 ? 'bad' : 'brand', '4라인 전체 — 계획 대비 속도', pc(t.idx - 1), `계획 조건 ${n0(t.planH)}h · 실제 ${n0(t.h4)}h (최근 4주 ${n0(t.t4)}t)`, 'all');
    const ls = O.lines.map((x, i) => k(Math.abs(x.idx - 1) < 0.05 ? 'good' : x.idx < 1 ? 'bad' : 'brand', `${x.line} 계획 대비 속도`, pc(x.idx - 1), `실제 ${n2(x.tph4)} t/hr · 계획 기준 ${n2(x.tphPlan)} · ${n0(x.tpd4)}t/일`, 'l' + i));
    return `<div class="kpis">${all}</div><div class="kpis" style="margin-top:12px">${ls.join('')}</div>`;
  }

  function lineTable() {
    const rows = O.lines.map((x, i) => { const v = verdict(x.idx); return `<tr><td class="l nm"><i class="dot" style="background:${COL[i]}"></i>${x.line}</td><td>${n0(x.t4)}</td><td>${x.days4}일</td><td>${n0(x.tpd4)}</td>
      <td>${n2(x.tphPlan)}</td><td>${n2(x.tph12)}</td><td><b>${n2(x.tph4)}</b></td><td>${n0(x.planH)}</td><td>${n0(x.h4)}</td><td><b class="${v[1]}">${pc(x.idx - 1)}</b></td><td class="l"><span class="tag ${v[1]}">${v[0]}</span></td></tr>`; }).join('');
    return card('cc-line', '라인별 비교', `최근 4주 ${md(O.w4[0])}~${md(O.w4[1])} · 앞 12주 ${md(O.w12[0])}~${md(O.w12[1])} · 계획 기준 ${md(O.planFrom)}~${md(O.planTo)} 실적`, '',
      `<div class="scroll"><table class="t big"><thead><tr><th class="l" rowspan="2">라인</th><th colspan="3">최근 4주 생산</th><th colspan="3">t/hr (작업 + 정지)</th><th colspan="3">같은 품목을 만드는 데 걸린 시간</th><th class="l" rowspan="2">판정</th></tr>
      <tr><th>톤</th><th>가동일</th><th>t/일</th><th>계획 기준</th><th>앞 12주</th><th>최근 4주</th><th>계획 조건대로</th><th>실제</th><th>속도 차이</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">t/hr 만 비교하면 품목 구성(얇은·프린트 품명 비중)에 따라 오르내림. 그래서 최근 4주에 실제로 만든 품목(품명·라인·부서)을 계획 t/hr 로 나눈 '계획 조건대로 걸렸을 시간'과 실제 시간을 비교 — 속도 차이 = 계획 시간 ÷ 실제 시간 − 1. ±5% 안이면 계획 조건 그대로 둬도 됨.</p>`);
  }

  function prodTable() {
    const P = O.prods.filter((x) => pl === 'all' || x.l === pl);
    const seg = [['all', '전체'], ...O.lines.map((x) => [x.line, x.line])].map(([k, l]) => `<button type="button" data-l="${k}" aria-pressed="${k === pl}">${l}</button>`).join('');
    const rows = P.map((x) => { const c = x.diff == null ? '' : x.diff < -0.1 ? 'bad' : x.diff > 0.1 ? 'info' : ''; return `<tr><td class="l nm">${esc(x.p)}</td><td class="l">${x.l}</td><td>${n1(x.t4)}</td><td>${n2(x.tphPlan)} <small class="muted">${x.tPlan ? n0(x.tPlan) + 't' : esc(x.planSrc)}</small></td><td>${n2(x.tph12)}</td><td><b>${n2(x.tph4)}</b></td><td class="${c}"><b>${pc(x.diff)}</b></td><td>${x.hLoss == null ? '-' : (x.hLoss > 0 ? '+' : '') + n1(x.hLoss)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">없음</td></tr>';
    return card('cc-prod', '품명·라인별 차이', '최근 4주 20t 이상 · 시간 영향 큰 순', '',
      `<div class="seg" id="cc-pl">${seg}</div><div class="scroll" style="margin-top:12px"><table class="t"><thead><tr><th class="l">품명</th><th class="l">라인</th><th>최근 4주 톤</th><th>계획 t/hr <small>(근거 톤)</small></th><th>앞 12주 t/hr</th><th>최근 4주 t/hr</th><th>차이</th><th>시간 영향 h<br><small>+ = 계획보다 더 걸림</small></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">시간 영향 = 최근 4주 톤을 실제 t/hr 로 만든 시간 − 계획 t/hr 로 만들었을 시간. 같은 품명이라도 두께·폭·색상 교체 횟수에 따라 크게 달라지므로, 톤이 적은 품명의 큰 차이는 조건을 바꿀 근거로 약함.</p>`);
  }

  function basis() {
    return card('cc-basis', '기준', '', '', `<ul class="small" style="line-height:1.8;margin:0;padding-left:20px">
      <li><b>계획 조건</b> 통합 가동계획 컬러 일정이 쓰는 t/hr = 품명·라인(·부서) 실적 t/hr, 계산 기간 ${O.planFrom} ~ ${O.planTo}. 작업 + 정지(색상교체·청소·테스트 등) 시간을 다 넣은 값이라 휴지가 따로 빠지지 않음.</li>
      <li><b>최근 실적</b> MES 컬러 생산 실적, 마지막 완결 주까지 4주. 매일 사내 PC 자동 실행이 다시 계산.</li>
      <li><b>조정</b> 라인 속도 차이가 ±5%를 넘는 상태가 2주 넘게 이어지면 계획 기간을 최근 13주로 바꿔 다시 계산하는 것을 권장. 휴지 사유별 시간은 <a href="color_actual.html">컬러 실적</a>의 휴지 구성 참고.</li></ul>`);
  }

  function render() {
    $('ca-main').innerHTML = `<section class="card" id="ca-kpi"><h2>핵심 <small>최근 4주 ${md(O.w4[0])}~${md(O.w4[1])} · 품목 구성 감안</small></h2>${kpis()}</section>` + lineTable() + prodTable() + basis();
    $('ca-meta').innerHTML = `<span><b>실적</b>~${O.asOf}</span><span><b>최근 4주</b>${md(O.w4[0])}~${md(O.w4[1])}</span><span><b>계획 기준</b>${md(O.planFrom)}~${md(O.planTo)}</span><span><b>계산</b>${String(O.built || '').replace('T', ' ')}</span>`;
    UI.reveal($('ca-main'));
    wire();
  }
  function wire() { document.querySelectorAll('#cc-pl button').forEach((b) => b.addEventListener('click', () => { pl = b.dataset.l; $('cc-prod').outerHTML = prodTable(); wire(); })); }
  let env = null;
  const envReady = GP.latest('color_cond.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;
    if (pw) { $('ca-lockbox').hidden = true; $('ca-skel').hidden = false; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } render(); }
    catch (e) { $('ca-lockbox').hidden = false; $('ca-skel').hidden = true; $('ca-form').hidden = false; $('ca-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('ca-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('ca-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else $('ca-form').hidden = false;
  }).catch(() => { $('ca-msg').textContent = '자료를 찾을 수 없습니다'; });
})();
