/* 작업지시 순서 제안: published/wo_proposal.enc.json (tools/wo_sequence.py)
   라인 탭 → 요약(지금 라인 · 이번 제안 · 예상 휴지 · MES 순서와 비교) → 날짜별 제안 순서 표 → 확정 대기열(접힘) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '');
  const WD = '일월화수목금토';
  const dayNm = (d) => `${md(d)}(${WD[new Date(d + 'T00:00:00').getDay()]})`;
  // 'MM-DD HH:MM' → 그날이면 시각만, 다른 날이면 날짜도
  const tm = (s, d) => (!s ? '' : (d && s.slice(0, 5) === d.slice(5) ? s.slice(6) : `${+s.slice(0, 2)}/${+s.slice(3, 5)} ${s.slice(6)}`));
  const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${Math.round(m % 60)}분` : `${Math.round(m)}분`);
  const TIER = { 1: '수출', 2: '내수·수요개발·주문재', 3: '계획재' };
  const BLK = { general: '일반', pvs2: 'PVS2', print: '프린트' };
  const DZ = [['col', '색상교체'], ['test', '단판TEST'], ['roll', 'Roll교체'], ['dummy', 'Dummy'], ['block', '블록 전환']];
  let O = null, line = null;

  function row(x, day) {
    const dn = x.downMin > 0.5;
    const rdy = x.ready > O.today;
    const pfTxt = x.pf && x.pf !== '00' ? `PF ${esc(x.pf)} ${x.pfDate ? md(x.pfDate) : '<b class="rdy">입고일 없음</b>'}` : '';
    return `<tr><td><b>${x.seq}</b></td>`
      + `<td class="tm">${tm(x.start, day)}–${tm(x.end, day)}${dn ? `<br><span class="bk">휴지 ${tm(x.downStart, day)}부터</span>` : ''}</td>`
      + `<td>${esc(x.item)}<span class="gt gt${x.tier}">${TIER[x.tier]}</span><br><span class="bk">${esc(x.pdt)} · ${BLK[x.block]}</span></td>`
      + `<td>${esc(x.color)}${x.back ? `<br><span class="bk">이면 ${esc(x.back)}</span>` : ''}</td>`
      + `<td>${x.thk}×${n0(x.wdt)}</td><td class="num">${x.t.toFixed(1)}</td>`
      + `<td class="num" title="${esc(x.speedSrc)}">${x.ls}<br><span class="bk">${x.tph} t/hr</span></td>`
      + `<td class="num">${n0(x.runMin)}</td>`
      + `<td class="num ${dn ? 'dn' : 'dn0'}">${dn ? `<b>${n0(x.downMin)}</b>` : '0'}</td>`
      + `<td class="l">${esc(x.downWhy)}${x.why ? `<br><span class="why">${esc(x.why)}</span>` : ''}</td>`
      + `<td>${x.paint ? `도료 ${rdy && x.ready === x.paint ? `<b class="rdy">${md(x.paint)}</b>` : md(x.paint)}` : ''}${pfTxt ? `<br>${pfTxt}` : ''}</td>`
      + `<td>${md(x.mesDate)}${x.mesSeq != null ? ` <span class="bk">${esc(x.mesSeq)}번째</span>` : ''}</td></tr>`;
  }
  const HEAD = '<thead><tr><th>순서</th><th>시작–종료</th><th>품명 · 그룹</th><th>색상<br><small>Top Color</small></th><th>두께×폭</th><th>톤</th><th>속도<br><small>L/S m/분</small></th><th>생산<br><small>분</small></th><th>휴지<br><small>분</small></th><th>앞 작업과 무엇이 바뀌나 · 왜 이때</th><th>준비<br><small>도료생산일·PF</small></th><th>MES 작업예정일<br><small>담당자 입력, 비교용</small></th></tr></thead>';

  function table(v, items, ph) {
    const byS = {}; items.forEach((x) => { byS[x.seq] = x; });
    let h = '', curDay = null;
    (v.events || []).forEach((e) => {
      if (e.kind === 'job' ? !byS[e.seq] : e.ph !== ph) return;
      const d = e.kind === 'job' ? byS[e.seq].day : e.day;
      if (d !== curDay) {
        curDay = d;
        const s = ((v.days || {})[ph] || {})[d] || {};
        h += `<tr class="day"><td colspan="12">${dayNm(d)}<small>${n0(s.n)}건 · ${n0(s.t)}t · 생산 ${hm(s.run || 0)} · 휴지 ${n0(s.down)}분${s.plan ? ` · 휴지계획 ${hm(s.plan)}` : ''}${s.wait ? ` · 기다림 ${hm(s.wait)}` : ''}</small></td></tr>`;
      }
      if (e.kind === 'job') { h += row(byS[e.seq], curDay); return; }
      h += `<tr class="ev ${e.kind}"><td>—</td><td class="tm">${tm(e.start, curDay)}–${tm(e.end, curDay)}</td><td colspan="10"><b>${e.kind === 'plan' ? '휴지계획' : '라인 멈춤(기다림)'} ${hm(e.min)}</b> · ${esc(e.why)}</td></tr>`;
    });
    return `<div class="scroll"><table class="t wo">${HEAD}<tbody>${h}</tbody></table></div>`;
  }

  function render() {
    const L = Object.keys(O.lines);
    line = line && L.includes(line) ? line : (L.find((l) => O.lines[l].nFree) || L[0]);
    const v = O.lines[line];
    const free = v.items.filter((x) => !x.fixed), fx = v.items.filter((x) => x.fixed);
    $('wo-meta').textContent = `${O.now} 기준(지금) · 계산 ${O.built || ''}`;
    const dz = DZ.filter(([k]) => v.downFree[k] > 0.5).map(([k, nm]) => `${nm} ${n0(v.downFree[k])}`).join(' · ') || '없음';
    const gain = v.mes.sum - v.ours.sum;
    const stop = v.stop ? `<div class="miss"><b>${line} 휴지 중</b> — ${esc(v.stop.note)}. ${v.stop.until ? `재가동 ${md(v.stop.until)} 0시부터 시각 계산` : '재가동일 미정 — 아래 시각은 <b>지금 바로 재가동한다고 가정</b>한 것'}</div>` : '';
    $('wo-main').innerHTML = (O.missing && O.missing.length ? `<div class="miss"><b>아직 안 들어온 자료</b> — ${O.missing.map(esc).join(' / ')}</div>` : '')
      + '<details class="wo-how" open><summary>읽는 법 — 순서를 정한 기준</summary><ol>'
      + '<li><b>준비된 것만</b>: 도료생산일 이후, PF종류가 있으면 PF입고예정일 이후(둘 다 당일 가능)</li>'
      + '<li><b>먼저 넣을 묶음</b>: 넣을 수 있는 지시가 많으면 수출 → 가전내수·수요개발·주문재 → 계획재 순으로 먼저(산출근거서 컬러 배치 조건 ③). 그날 시간이 남으면 다음 순위로 채움</li>'
      + '<li><b>묶음 안 순서 = 휴지가 가장 적은 순서</b>: 같은 색 이어서, 2헤드에 걸린 두 색 번갈아, 넓은 폭 → 좁은 폭, 두께 급변 피함, 블록(일반·PVS2·프린트)끼리 모음</li></ol>'
      + '<p>휴지 계산 = 10/20 첨부 「계획재 일별배치 휴지시간 재산출」 파일 규칙: 색상교체 = 48분(프린트 84분) − 그 지시 생산시간(길면 0) · 2헤드 교대 0 · 순서기준 그룹이 바뀌면 색 교체 필수 · 블록(1CCL 일반↔PVS2, 4CCL 일반↔프린트)이 바뀌면 지난 1년 실측 빈 시간 중앙값(105~115분: EMBO 준비·Roll·색상교체·TEST 등 포함) · 단판TEST Y면 42분(프린트 54분) · 폭이 넓어지면 Roll교체 61~69분(4CCL 프린트 45분) · 두께비 1.5배(3·4CCL 1.3배) 넘으면 Dummy 38분</p>'
      + '<p>시각 = 마지막 실적 코일이 끝난 때와 지금 중 늦은 때부터, 확정 대기열을 MES 순서대로 먼저 돌리고 이어서 제안 순서. 생산시간 = 톤 ÷ (두께 × 폭 × L/S × 7.87). 그날 휴지계획(계획휴지·S/D·청소 등)은 시각이 없어 그날 첫 작업 앞에 둠</p></details>'
      + `<section class="card"><div class="seg" id="wo-lines">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l} <small>${O.lines[l].stop ? '휴지' : `${O.lines[l].nFree}건`}</small></button>`).join('')}</div>${stop}`
      + '<div class="kpis" style="margin-top:12px">'
      + `<div class="kpi"><div class="l">지금 라인</div><div class="v">${fx.length}<small>건 확정 대기</small></div><div class="b">마지막 코일 ${esc(v.lastCoil ? tm(v.lastCoil) : '-')} 끝 · 확정분 ${n0(v.tFixed)}t 은 ${esc(tm(v.fixedUntil))} 까지</div></div>`
      + `<div class="kpi"><div class="l">이번 제안(편성 대상)</div><div class="v">${v.nFree}<small>건 ${n0(v.tFree)}t</small></div><div class="b">${v.nFree ? `${esc(tm(free[0].start))} → ${esc(tm(v.until))}` : '편성할 지시 없음'}${v.waitN ? ` · 도료·PF 준비 기다리는 지시 ${v.waitN}건` : ''}</div></div>`
      + `<div class="kpi"><div class="l">예상 휴지(제안 순서)</div><div class="v wv">${n0(v.downFreeSum)}<small>분</small></div><div class="b">${dz}</div></div>`
      + '</div>'
      + (v.nFree ? `<div class="wo-cmp${gain < 0 ? ' bad' : ''}"><b>MES 순서와 비교</b> — 같은 ${v.nFree}건을 MES 에 지금 들어가 있는 작업예정일·순번대로 돌리면 휴지 ${n0(v.mes.down)}분${v.mes.wait ? ` + 도료 기다림 ${n0(v.mes.wait)}분` : ''} → 제안이 <b>${gain >= 0 ? `${n0(gain)}분 짧음` : `${n0(-gain)}분 김`}</b> <span class="bk">(같은 출발점, 같은 휴지 규칙)</span></div>` : '')
      + '</section>'
      + (v.nFree ? `<section class="card"><h2>제안 순서 <small class="bk">날짜별 · 줄마다 그 지시 앞에 생기는 휴지와 생산</small></h2>${table(v, free, 'free')}</section>` : '')
      + (fx.length ? `<section class="card"><details class="fx"><summary>이미 확정된 대기열 ${fx.length}건 ${n0(v.tFixed)}t — MES 순서 그대로 (${esc(tm(v.from))} → ${esc(tm(v.fixedUntil))})</summary>${table(v, fx, 'fixed')}</details></section>` : '');
    $('wo-lines').querySelectorAll('button').forEach((b) => b.onclick = () => { line = b.dataset.l; render(); });
    if (window.UI) UI.reveal($('wo-main'));
  }
  const envReady = GP.latest('wo_proposal.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('wo-msg').textContent = '아직 게시된 제안이 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('wo-form').hidden = false; $('wo-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    if (!O.lines || !Object.values(O.lines).every((v) => v.mes)) { $('wo-msg').textContent = '예전 형식의 제안입니다 — 다시 계산 후 게시가 필요합니다.'; return; }
    render();
  }
  $('wo-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('wo-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('wo-form').hidden = false; });
})();
