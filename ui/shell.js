/* 공통 셸: 헤더(워드마크·메뉴·화면 모드) + 움직임 도우미(UI.reveal / UI.count / UI.toast)
   페이지: <header id="shell" data-page="procure" data-crumb="소재" data-title="소재 발주 검토" data-sub="..."></header> */
(function () {
  'use strict';
  const NAV = [
    ['home', 'index.html', '홈'], ['supply', 'supply.html', '수급 캘린더'], ['integrated', 'integrated.html', '재고 추이'], ['report', 'report.html', '주간 보고'],
    '|도금', ['status', 'status.html', '가동 현황'], ['rolling', 'rolling.html', '계획 계산'], ['analysis', 'analysis.html', '조건 분석'], ['platact', 'plating_actual.html', '실적'],
    '|컬러', ['colorstat', 'color_status.html', '가동 현황'], ['coloranal', 'color_analysis.html', '조건 분석'], ['coloract', 'color_actual.html', '실적'], ['planstock', 'planstock.html', '계획재'],
    '|소재', ['procure', 'procure.html', '소재 발주'], '|',
    ['decisions', 'decisions.html', '결정 기록'], ['health', 'health.html', '자료 상태'], ['docs', 'docs.html', '문서'],
  ];
  const TKEY = 'cgl-theme', SKEY = 'cgl-scope';
  const ONLY = { status: 'G', analysis: 'G', rolling: 'G', platact: 'G', coloract: 'C', planstock: 'C', colorstat: 'C', coloranal: 'C' };     // 도금 자료만 있는 화면
  const SCN = { all: '전체', G: '도금', C: '컬러' };
  const DOCS = ['conditions', 'guide', 'requests', 'glossary', 'doc'];
  const UI = window.UI = window.UI || {};

  function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  let theme = 'auto'; try { theme = localStorage.getItem(TKEY) || 'auto'; } catch (e) { /* 무시 */ }
  applyTheme(theme);
  let scope = 'all'; try { scope = localStorage.getItem(SKEY) || 'all'; } catch (e) { /* 무시 */ }
  if (!SCN[scope]) scope = 'all';
  const subs = [];
  UI.scope = () => scope;
  UI.inScope = (p) => scope === 'all' || !p || String(p).includes(scope);
  UI.onScope = (fn) => { subs.push(fn); };
  function setScope(v) {
    scope = v; try { localStorage.setItem(SKEY, v); } catch (e) { /* 무시 */ }
    document.documentElement.dataset.scope = v;
    document.querySelectorAll('.scope-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sc === v)));
    document.querySelectorAll('.shell-nav a[data-only]').forEach((a) => a.classList.toggle('dim', v !== 'all' && !a.dataset.only.includes(v)));
    notice();
    subs.forEach((f) => { try { f(v); } catch (e) { console.error(e); } });
  }
  document.documentElement.dataset.scope = scope;
  function notice() {
    const h = document.getElementById('shell'); if (!h) return;
    const only = ONLY[h.dataset.page]; let el = document.getElementById('ui-scope-note');
    const show = only && scope !== 'all' && scope !== only;
    if (!show) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'ui-scope-note'; el.className = 'wrap scope-note'; h.after(el); }
    el.innerHTML = `<div><b>이 화면은 ${SCN[only]} 자료만 있습니다.</b> 현재 '${SCN[scope]}' 보기라 내용이 없습니다 — <button type="button" data-sc="${only}">${SCN[only]} 보기로</button> 또는 <a href="index.html">홈</a>에서 ${SCN[scope]} 화면을 고르세요.</div>`;
    el.querySelector('button').onclick = () => setScope(only);
  }
  function build() {
    const h = document.getElementById('shell'); if (!h) return;
    const d = h.dataset, esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nav = NAV.map((x) => (typeof x === 'string' ? `<span class="sep" aria-hidden="true"></span>${x.length > 1 ? `<span class="grp">${x.slice(1)}</span>` : ''}` : `<a href="${x[1]}"${x[0] === d.page || (x[0] === 'docs' && DOCS.includes(d.page)) ? ' aria-current="page"' : ''}${ONLY[x[0]] ? ` data-only="${ONLY[x[0]]}"` : ''}>${x[2]}</a>`)).join('');   // 같은 이름(가동 현황·조건 분석·실적)은 앞의 묶음 이름(도금·컬러)으로 구분
    h.className = 'shell-top';
    h.innerHTML = `<div class="sheen" aria-hidden="true"></div><div class="wrap">
      <div class="shell-bar"><a class="wordmark" href="index.html"><span class="mk" aria-hidden="true"><i></i></span><b>POSCO STEELEON</b><span>도금·컬러 가동계획</span></a>
        <div class="shell-tools noprint"><a class="fresh" id="ui-fresh" href="health.html" hidden></a><button type="button" id="ui-theme" aria-label="화면 모드">${{ auto: '◐ 자동', light: '☀ 밝게', dark: '☾ 어둡게' }[theme]}</button></div></div>
      <div class="shell-head"><div class="sh-l">${d.crumb ? `<div class="crumb">${esc(d.crumb)}</div>` : ''}<h1>${esc(d.title || document.title)}</h1>${d.sub != null ? `<p class="sub" id="ui-sub">${esc(d.sub)}</p>` : ''}${HELP[d.page] ? `<p class="help"><b>이 화면에서</b> ${esc(HELP[d.page])}</p>` : ''}</div>
        <div class="scope noprint"><span>보기</span><div class="scope-seg" role="group" aria-label="공정 보기">${Object.entries(SCN).map(([k, n]) => `<button type="button" data-sc="${k}" aria-pressed="${k === scope}">${n}</button>`).join('')}</div></div></div>
      <nav class="shell-nav" aria-label="메뉴">${nav}<span class="ink" aria-hidden="true"></span></nav></div>`;
    const ink = h.querySelector('.ink'), cur = h.querySelector('.shell-nav a[aria-current]'), navEl = h.querySelector('.shell-nav');
    const place = (a) => { if (!a) { ink.style.width = 0; return; } ink.style.left = (a.offsetLeft + 10) + 'px'; ink.style.top = (a.offsetTop + a.offsetHeight - 6) + 'px'; ink.style.width = (a.offsetWidth - 20) + 'px'; };
    requestAnimationFrame(() => { place(cur); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    navEl.addEventListener('mouseover', (e) => { const a = e.target.closest('a'); if (a) place(a); });
    navEl.addEventListener('mouseleave', () => place(cur));
    addEventListener('resize', () => place(cur));
    addEventListener('load', () => place(cur)); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place(cur));   // 글꼴이 늦게 오면 메뉴 폭이 바뀜
    h.querySelectorAll('.scope-seg button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.sc !== scope) setScope(b.dataset.sc); }));
    h.querySelectorAll('.shell-nav a[data-only]').forEach((a) => a.classList.toggle('dim', scope !== 'all' && !a.dataset.only.includes(scope)));
    notice();
    h.querySelector('#ui-theme').addEventListener('click', (e) => {
      theme = { auto: 'light', light: 'dark', dark: 'auto' }[theme]; try { localStorage.setItem(TKEY, theme); } catch (x) { /* 무시 */ }
      applyTheme(theme); e.currentTarget.textContent = { auto: '◐ 자동', light: '☀ 밝게', dark: '☾ 어둡게' }[theme];
    });
  }

  /* 자료 신선도: status.json(사내 PC 자동 실행기·클라우드 게시 중 최신) → 헤더 배지 + 오래되면 경고 띠 */
  const FEED = { platact: 'MES 도금 실적', coloract: '컬러 생산 실적', planstock: '컬러 생산 실적', coloranal: '컬러 생산 실적', procure: '소재재고List(컬러)' };
  async function fresh() {
    const h = document.getElementById('shell'); if (!h) return;
    const urls = ['https://gatcqxrzaonjsixajrwd.supabase.co/storage/v1/object/public/published/status.json?v=' + Date.now(), 'published/status.json'];
    const got = (await Promise.all(urls.map((u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)))).filter(Boolean);
    if (!got.length) return;
    const S = got.sort((a, b) => (String(a.runAt) < String(b.runAt) ? 1 : -1))[0];
    UI.status = S;
    const want = FEED[h.dataset.page] || '도금 생산 실적(코일)';
    const f = (S.feeds || []).find((x) => x.name === want) || (S.feeds || [])[0];
    if (!f || !f.last) return;
    const today = new Date(); const d0 = new Date(f.last + 'T00:00:00');
    const age = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - d0) / 864e5);
    const el = document.getElementById('ui-fresh');
    el.hidden = false; el.className = 'fresh ' + (age <= 1 ? 'ok' : age <= 2 ? 'warn' : 'bad');
    el.title = `${want} 마지막 날짜 · 게시 ${String(S.runAt || '').replace('T', ' ').slice(0, 16)}`;
    el.innerHTML = `<i></i>자료 ~${+f.last.slice(5, 7)}/${+f.last.slice(8, 10)}${age >= 1 ? ` · ${age}일 전` : ''}`;
    if (age >= 2 && h.dataset.page !== 'health' && !document.getElementById('ui-stale')) {
      const b = document.createElement('div'); b.id = 'ui-stale'; b.className = 'wrap stale-band';
      b.innerHTML = `<div>⚠ <b>자료가 ${age}일 전(${f.last})에서 멈춰 있습니다.</b> 숫자는 그날 기준입니다 — 사내 PC 자동 실행을 확인하세요. <a href="health.html">자료 상태 보기 →</a></div>`;
      h.after(b);
    }
  }
  UI.fresh = fresh;

  /* 화면 한 줄 도움말 */
  const HELP = {
    home: '아침에 한 번: 오늘 볼 것 → 핵심 지표 → 필요한 화면으로 이동. 보는 사람(역할)과 보기(도금/컬러)를 고르면 맞는 것만 남음',
    integrated: '확정 계획 기준 주별 제품·자가재 재고 추이와 일별 배치 기준. 날짜별 가동은 수급 캘린더, 라인별 일정은 가동 현황에서',
    status: '도금 1·2CGL 게시 계획(매일 재계획)의 월별 간트·강종 전환·부서별 물량',
    rolling: '판매계획·자가재계획 엑셀로 도금 계획을 새로 계산하거나 실적으로 재계획하고 게시(담당자용). 정기수리를 추가하면 정지 시나리오도 볼 수 있음',
    analysis: '(계획 담당자용) MES 도금 실적으로 속도·M/C 손실·정지를 다시 계산해 계획 조건과 비교 — 반영권장 값은 계획 계산에 넣을 후보',
    platact: '도금 2라인 이번 달 진도, 일별·주별 생산, 속도, 제품·강종, 휴지, 강종 전환. 컬러 실적과 같은 양식',
    coloract: '컬러 4라인 이번 달 진도, 일별·주별 생산, 속도, 품명, 휴지. 지난주가 12주 평균과 얼마나 다른지',
    colorstat: '컬러 1~4CCL 4분기 계획의 월별 간트(지난 날 = 실적), 라인 한도 대비 편성, 그룹별 물량, 못 넣은 물량. 도금 가동 현황과 같은 역할',
    coloranal: '(계획 담당자용) MES 컬러 실적으로 라인·품명 t/hr 를 다시 재서 계획 조건과 비교 — 라인 속도 차이가 ±5%를 넘으면 계획 조건 조정 검토',
    planstock: '계획재 운영안(TF) 187개 사양의 재고·생산·판매 진도와 월말 재고 예측. \'조치 필요\'부터 보고 담당자별로 확인',
    report: '주 1회 임원 보고 양식. 인쇄/PDF 로 그대로 씀',
    procure: '발주 캘린더로 날짜별 발주 마감·입고 필요를 보고, 판단 목록에서 업체·수량을 정해 구매 요청서를 만듦. 기발주는 입고예정 탭에 넣어야 정확',
    decisions: '회의·보고에서 정한 것과 할 일을 남기고 기한·상태를 추적(공유 설정 후 모두가 같은 기록)',
    health: '숫자가 언제 기준인지 확인. 일일 자료가 2일 넘게 멈추면 사내 PC 자동 실행 점검',
    docs: '계획 조건식·용어 정의·사용법·요청 메일 모음',
    conditions: '계획 계산식과 문제점', guide: '발주 검토 사용 순서', requests: '부서별 협조 요청 메일(복사해 보내기)', glossary: '숫자 정의와 아직 확인 안 된 가정',
  };

  /* 표가 있는 카드마다 '엑셀(CSV)' 내려받기 */
  function csvOf(card) {
    const q = (v) => { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [...card.querySelectorAll('table')].map((t) => [...t.rows].map((r) => [...r.cells].map((c) => q(c.innerText)).join(',')).join('\r\n')).join('\r\n\r\n');
  }
  function addExport(root) {
    (root || document).querySelectorAll('.card').forEach((c) => {
      if (c.querySelector(':scope > .xbtn') || !c.querySelector('table') || c.classList.contains('lock') || c.hasAttribute('data-noexport')) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'xbtn noprint'; b.title = '이 카드의 표를 엑셀(CSV)로 받기'; b.textContent = '⤓ 엑셀';
      b.onclick = () => {
        const h = c.querySelector('h2'); const name = `${(document.querySelector('.shell-head h1') || {}).textContent || document.title}_${h ? h.childNodes[0].textContent.trim() : '표'}_${new Date().toISOString().slice(0, 10)}.csv`.replace(/[\\/:*?"<>|]/g, '');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csvOf(c)], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        UI.toast && UI.toast('내려받음: ' + name);
      };
      c.prepend(b);
    });
  }
  function watchExport() {
    const m = document.querySelector('main'); if (!m) return;
    let t = null; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => addExport(m), 120); }).observe(m, { childList: true, subtree: true });
    addExport(m);
  }

  UI.sub = (text) => { const s = document.getElementById('ui-sub'); if (s) s.textContent = text; };

  /* 처음 보이는 카드만 차례로 떠오르게(다시 그려도 반복하지 않음) */
  const seen = new Set();
  /* 그래프 눈금(전 화면 공통): 1·2·5 × 10^k 간격, 4~6칸 — 625·1,875·2.6k 같은 어색한 눈금이 안 나오게 */
  UI.scale = (max, min = 0, n = 5) => {
    const span = Math.max(1e-9, max - min), raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return { lo, hi, step, ticks };
  };
  UI.tick = (v, step) => (Math.abs(v) >= 10000 && step >= 1000 ? `${+(v / 1000).toFixed(step >= 10000 ? 0 : 1)}k` : (step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : Math.round(v).toLocaleString('ko-KR')));
  UI.reveal = (root) => {
    let i = 0;
    (root || document).querySelectorAll('.card, .tile, .kpi').forEach((el) => {
      const k = el.id || el.dataset.rk || (el.className + ':' + (el.textContent || '').slice(0, 24));
      if (seen.has(k)) return; seen.add(k);
      el.style.setProperty('--i', i++); el.classList.add('rv');
    });
  };

  /* 숫자 카운트업: <b data-count="1234" data-ck="key"> — 같은 key 의 이전 값에서 새 값으로 */
  const last = {};
  UI.count = (root) => {
    (root || document).querySelectorAll('[data-count]').forEach((el) => {
      const to = +el.dataset.count, key = el.dataset.ck || '', dec = +(el.dataset.dec || 0);
      const from = key in last ? last[key] : 0; last[key] = to;
      const fmt = (v) => v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (from === to) { el.textContent = fmt(to); return; }
      const t0 = performance.now(), dur = 650;
      const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  };

  let tt = null;
  UI.toast = (msg) => {
    let el = document.getElementById('ui-toast');
    if (!el) { el = document.createElement('div'); el.id = 'ui-toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 1600);
  };

  const boot = () => { build(); fresh(); watchExport(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  /* 표 줄 번호(--ri) — 줄 나타나기 애니메이션 순서. 새로 그려지는 표도 자동 */
  function tagRows(root) { (root || document).querySelectorAll('table tbody').forEach((tb) => { if (tb.dataset.ri) return; tb.dataset.ri = '1'; [...tb.rows].forEach((r, i) => r.style.setProperty('--ri', i)); }); }
  const mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) tagRows(n.tagName === 'TBODY' ? n.parentNode : n); });
  document.addEventListener('DOMContentLoaded', () => { tagRows(); mo.observe(document.body, { childList: true, subtree: true }); });
})();
