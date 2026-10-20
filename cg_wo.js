/* 도금 작업지시 순서 제안(틀): published/cg_wo_proposal.enc.json (tools/cg_wo_sequence.py)
   라인 탭 → 요약(1010 대상 · 예상 더미 · MES 순서와 비교) → 제안 순서 표 → 편성 조건 · 전환(더미) 기준표(접힘 유지) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toFixed(1));
  const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '');
  let O = null, line = null;
  let howOpen = true;                                              // 편성 조건 접힘 상태 — 라인 바꿔도·새로고침해도 유지(사용자 10/20)
  try { howOpen = localStorage.getItem('cgwo-how-open') !== '0'; } catch (e) { /* 펼침 */ }

  function table(v) {
    const head = '<colgroup><col style="width:60px"><col style="width:180px"><col style="width:120px"><col style="width:84px"><col style="width:160px"><col><col style="width:110px"><col style="width:100px"><col style="width:90px"></colgroup>'
      + '<thead><tr><th>순서</th><th class="l">소재 코일</th><th>두께×폭</th><th>표면사상</th><th class="l">도금량·후처리·도유</th><th class="l">앞 코일과 바뀌는 것</th><th class="l">예상 더미</th><th>생산요청일</th><th>MES 순번</th></tr></thead>';
    let prev = null;
    const body = v.items.map((x) => {
      const t = x.trt ? `${esc(x.trt.cot || '-')} · ${esc(x.trt.aft || '-')} · ${esc(x.trt.oil || '-')}` : '<span class="bk">자료 대기</span>';
      const ch = x.seq === 1 ? '<span class="bk">첫 코일</span>' : (x.chg.length ? x.chg.map(esc).join('<br>') : '<span class="bk">같은 사양</span>');
      const dm = x.exp >= 0.5 ? `<span class="dnb">${n1(x.exp)}분</span>` : '<span class="bk">0</span>';
      const thk = prev && Math.abs(prev.thick - x.thick) > 1e-6 ? '<b>' : '';
      const r = `<tr${x.exp >= 0.5 ? ' class="hasdn"' : ''}><td class="c"><b>${x.seq}</b></td><td class="l">${esc(x.raw)}${x.con ? `<div class="bk">${esc(x.con)}</div>` : ''}${x.conf ? '' : ' <span class="gt gt3">미확정</span>'}</td>`
        + `<td class="num">${thk}${x.thick}${thk ? '</b>' : ''}×${n0(x.width)}</td><td class="c">${esc(x.sur)}</td><td class="l">${t}</td><td class="l wr">${ch}</td><td class="l wr">${dm}</td><td class="c">${md(x.req)}</td><td class="c">${n0(x.mesSeq)}</td></tr>`;
      prev = x;
      return r;
    }).join('');
    return `<div class="scroll"><table class="t wo cgwo">${head}<tbody>${body}</tbody></table></div>`;
  }

  function conditions(l) {
    const C = [
      ['편성 대상', 'SSCHB1010 이 고른 그날 소재 코일(확정여부 Y·N 모두) — 1010 이 쓰는 표 PF_CG_FORECAST_ORD', 'cg_forecast_daily (매일 쌓는 중, 10/20 부터)', '대상 정의'],
      ['① 강종', '확정 계획(MILP)이 정한 그날 강종 그대로 — M/C 날짜는 여기서 안 바꿈', '확정 계획 도금 일별', '반드시 지킴'],
      ['② 표면사상끼리', '같은 표면사상 코일을 묶음 (MES 순서에서 먼저 나온 표면사상부터)', 'SUR_FIN', '반드시 지킴'],
      ['③ 더미 최소', '앞 코일 → 다음 코일에서 바뀐 것별 예상 더미 분(아래 표) 합이 가장 적은 순서', '3개월 코일 실적', '최대한'],
      ['④ 넓은 폭 → 좁은 폭', '더미 분이 같으면 폭이 좁아지는 쪽으로', 'RAW_WDT', '최대한'],
      ['⑤ 후처리 조건', 'NX 3연속 불가 등 — 사용자 조건(다음 주) 받으면 넣음', '-', '대기'],
    ];
    const T = O.cond || [], f1 = (v) => (v >= 0.05 ? n1(v) : '0');
    const rows = T.map((r) => { const x = r.lines[l] || {}; return x.n ? `<tr><td class="l">${esc(r.cond)}</td><td class="num">${n0(x.n)}</td><td class="num">${(x.rate * 100).toFixed(0)}%</td><td class="num">${x.minIf ? n0(x.minIf) : '-'}</td><td class="num"><b>${f1(x.exp)}</b></td></tr>` : ''; }).join('');
    const lr = O.learnRange || [];
    return `<details class="wo-how" id="cg-how"${howOpen ? ' open' : ''}><summary>편성 조건 · 전환(더미) 기준표 — 이 순서로 봅니다</summary>`
      + '<div class="scroll"><table class="t cond"><thead><tr><th>조건</th><th class="l">내용</th><th class="l">MES 칸·자료</th><th>지키는 정도</th></tr></thead><tbody>'
      + C.map((r) => `<tr><td class="l"><b>${r[0]}</b></td><td class="l wrap">${r[1]}</td><td class="l bk">${r[2]}</td><td>${r[3]}</td></tr>`).join('') + '</tbody></table></div>'
      + `<h3>전환(더미) 기준표 — ${l} (같은 강종 안, 바뀐 것마다 더함)</h3>`
      + `<p class="hint">도금은 코일을 이어 붙여 돌려서 바뀔 때 라인이 서는 대신 더미 코일이 들어감. ${esc(lr[0] || '')}~${esc(lr[1] || '')} 실제 코일 사이에 더미가 들어간 비율 × 들어가면 더미 작업 분 = 한 번 바꿀 때 예상 더미 분. <b>잠정</b> — 정비·고장 앞뒤 더미가 섞여 있음. 코일별 휴지 상세(원격 조회 hist_cg_pau_*)가 들어오면 사양 전환 때문에 넣은 더미만 골라 다시 셈.</p>`
      + `<div class="scroll"><table class="t cond dtab"><thead><tr><th class="l">바뀌는 것</th><th>3개월 건수</th><th>더미 들어간 비율</th><th>들어가면 더미(분)</th><th>예상 더미(분)</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }

  function render() {
    const L = Object.keys(O.lines);
    line = line && L.includes(line) ? line : L[0];
    const v = O.lines[line];
    $('wo-meta').textContent = `${O.now} 기준 · 계산 ${O.built || ''}`;
    const gain = (v.mes || 0) - (v.ours || 0);
    const plan = v.plan ? Object.entries(v.plan).map(([a, t]) => `${a} ${n0(t)}t`).join(' · ') : '-';
    $('wo-main').innerHTML = (O.missing && O.missing.length ? `<div class="miss"><b>아직 안 들어온 자료·조건</b> — ${O.missing.map(esc).join(' / ')}</div>` : '')
      + `<section class="card"><div class="seg" id="wo-lines">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l} <small>${O.lines[l].n}개</small></button>`).join('')}</div>`
      + '<div class="kpis" style="margin-top:12px">'
      + `<div class="kpi"><div class="l">1010 대상 (${esc(md(v.day))})</div><div class="v">${n0(v.n)}<small>개 코일</small></div><div class="b">확정 ${n0(v.nConf)}개 · 확정 계획 그날 강종 ${esc(plan)}</div></div>`
      + `<div class="kpi"><div class="l">예상 더미 (제안 순서)</div><div class="v wv">${n1(v.ours)}<small>분</small></div><div class="b">사양 바뀜 ${n0(v.oursChg)}번</div></div>`
      + `<div class="kpi"><div class="l">MES 1010 순서대로면</div><div class="v">${n1(v.mes)}<small>분</small></div><div class="b">사양 바뀜 ${n0(v.mesChg)}번</div></div>`
      + '</div>'
      + (v.n ? `<div class="wo-cmp${gain < 0 ? ' bad' : ''}"><b>MES 순서와 비교</b> — 같은 ${n0(v.n)}개를 1010 작업순번대로 돌리면 예상 더미 ${n1(v.mes)}분 → 제안이 <b>${gain >= 0 ? `${n1(gain)}분 짧음` : `${n1(-gain)}분 김`}</b> <span class="bk">(같은 기준표 · 도금량·후처리·도유는 자료 들어오면 반영)</span></div>` : '')
      + '</section>'
      + (v.n ? `<section class="card"><h2>제안 순서 <small class="bk">줄마다 앞 코일과 바뀌는 것과 예상 더미</small></h2>${table(v)}</section>` : '<section class="card"><p>오늘 1010 대상 코일이 없습니다.</p></section>')
      + conditions(line);
    $('wo-lines').querySelectorAll('button').forEach((b) => b.onclick = () => { line = b.dataset.l; render(); });
    $('cg-how').addEventListener('toggle', (e) => { howOpen = e.target.open; try { localStorage.setItem('cgwo-how-open', howOpen ? '1' : '0'); } catch (er) { /* 무시 */ } });
    if (window.UI) UI.reveal($('wo-main'));
  }
  const envReady = GP.latest('cg_wo_proposal.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('wo-msg').textContent = '아직 게시된 제안이 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('wo-form').hidden = false; $('wo-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    render();
  }
  $('wo-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('wo-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('wo-form').hidden = false; });
})();
