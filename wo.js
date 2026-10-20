/* 작업지시 순서 제안: published/wo_proposal.enc.json (tools/wo_sequence.py) — 라인 탭 · 제안 순서 표 · MES 순번 비교 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '-');
  let O = null, line = null;
  function render() {
    const L = Object.keys(O.lines);
    line = line && L.includes(line) ? line : L[0];
    const v = O.lines[line] || { items: [] };
    $('wo-meta').textContent = `기준일 ${O.today} · 계산 ${O.built || ''} · ${O.rule}`;
    const wait = v.items.filter((x) => x.ready > O.today).length;
    $('wo-main').innerHTML = (O.missing && O.missing.length ? `<div class="miss"><b>아직 안 들어온 자료</b> — ${O.missing.map(esc).join(' / ')}</div>` : '')
      + `<section class="card"><div class="seg" id="wo-lines">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l} <small>${O.lines[l].n}</small></button>`).join('')}</div>`
      + `<div class="wo-kpi" style="margin-top:12px"><div><small>편성 대상(미확정·소재 매치)</small><b>${v.nFree != null ? v.nFree : v.n}건</b><small>${n0(v.tFree != null ? v.tFree : v.t)}t · 확정된 대기열 ${v.n - (v.nFree != null ? v.nFree : v.n)}건은 앞에 MES 순서대로</small></div><div><small>도료·PF 대기</small><b>${wait}건</b><small>준비일이 오늘 이후</small></div>`
      + `<div><small>전환 휴지 합(실측 조건표)</small><b>${n0(v.costOurs)}분</b><small>MES 현재 순서 ${n0(v.costMes)}분</small></div></div>`
      + `<p class="hint">가동 ${esc(v.from || '')} → ${esc(v.until || '')} · 시각 = 마지막 실적 코일 끝부터 (휴지계획) → 전환 → 생산(톤 ÷ 예상 t/hr)</p>`
      + `<div class="scroll"><table class="t"><thead><tr><th>제안</th><th>시작</th><th>종료</th><th>품명</th><th>그룹</th><th>톤</th><th>폭</th><th>두께</th><th>L/S<br><small>m/분</small></th><th>t/hr</th><th>생산<br><small>분</small></th><th>전환<br><small>분</small></th><th>도료생산일</th><th>PF</th><th>PF입고</th><th>MES 예정·순번</th><th class="l">이유(전환 내용)</th></tr></thead><tbody>`
      + (() => { const byS = {}; v.items.forEach((x) => { byS[x.seq] = x; }); let h = '';
          (v.events || v.items.map((x) => ({ kind: 'job', seq: x.seq }))).forEach((e) => {
            if (e.kind !== 'job') { h += `<tr class="${e.kind === 'down' ? 'down' : 'waitrow'}"><td>—</td><td>${esc(e.start)}</td><td>${esc(e.end)}</td><td colspan="14" class="l"><b>${e.kind === 'down' ? '휴지' : '대기'} ${n0(e.min)}분</b> · ${esc(e.why)}</td></tr>`; return; }
            const x = byS[e.seq]; if (!x) return;
            h += `<tr${x.fixed ? ' class="fx"' : ''}><td><b>${x.seq}</b></td><td>${esc(x.start || '')}</td><td>${esc(x.end || '')}</td><td>${esc(x.pdt)}<br><small>${esc(x.item || '')}</small></td><td>${esc(x.g)}</td><td>${n0(x.t)}</td><td>${n0(x.wdt)}</td><td>${x.thk || '-'}</td><td title="${esc(x.speedSrc || '')}">${x.ls || '-'}</td><td>${x.tph || '-'}</td><td>${n0(x.runMin)}</td><td>${n0(x.cost)}</td><td>${md(x.paint)}</td><td>${esc(x.pf)}</td><td>${md(x.pfDate)}</td><td>${md(x.mesDate)} #${esc(x.mesSeq)}</td><td class="l">${esc(x.why)}${x.paintSrc && x.paintSrc !== '도료 코드' ? ` <small>(도료: ${esc(x.paintSrc)})</small>` : ''}</td></tr>`;
          }); return h; })()
      + '</tbody></table></div><p class="hint">제안만 보여 줍니다(MES 에 쓰지 않음). 전환 분 = 컬러 학습(코일 사이 빈 시간 실측) 조건표, L/S = 같은 라인·부서·품명·두께 실적 중앙값. 흐린 줄 = 이미 확정된 대기열.</p></section>';
    $('wo-lines').querySelectorAll('button').forEach((b) => b.onclick = () => { line = b.dataset.l; render(); });
    if (window.UI) UI.reveal($('wo-main'));
  }
  const envReady = GP.latest('wo_proposal.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('wo-msg').textContent = '아직 게시된 제안이 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } render(); }
    catch (e) { $('wo-form').hidden = false; $('wo-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; }
  }
  $('wo-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('wo-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('wo-form').hidden = false; });
})();
