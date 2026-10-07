/* 공통 셸: 헤더(워드마크·메뉴·화면 모드) + 움직임 도우미(UI.reveal / UI.count / UI.toast)
   페이지: <header id="shell" data-page="procure" data-crumb="소재" data-title="소재 조달 판단" data-sub="..."></header> */
(function () {
  'use strict';
  const NAV = [
    ['home', 'index.html', '홈'], '|',
    ['integrated', 'integrated.html', '통합 가동계획'], ['status', 'status.html', '가동 현황'], ['rolling', 'rolling.html', '계획 계산'], '|',
    ['analysis', 'analysis.html', '실적 분석'], ['report', 'report.html', '주간 보고'], '|',
    ['procure', 'procure.html', '조달 판단'], ['material', 'material.html', '소재 발주(월)'], '|',
    ['conditions', 'doc.html?d=conditions', '계획 조건식'], ['guide', 'doc.html?d=procure_guide', '사용법'],
  ];
  const TKEY = 'cgl-theme';
  const UI = window.UI = window.UI || {};
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  let theme = 'auto'; try { theme = localStorage.getItem(TKEY) || 'auto'; } catch (e) { /* 무시 */ }
  applyTheme(theme);

  function build() {
    const h = document.getElementById('shell'); if (!h) return;
    const d = h.dataset, esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nav = NAV.map((x) => (x === '|' ? '<span class="sep" aria-hidden="true"></span>' : `<a href="${x[1]}"${x[0] === d.page ? ' aria-current="page"' : ''}>${x[2]}</a>`)).join('');
    h.className = 'shell-top';
    h.innerHTML = `<div class="sheen" aria-hidden="true"></div><div class="wrap">
      <div class="shell-bar"><a class="wordmark" href="index.html"><span class="mk" aria-hidden="true"><i></i></span><b>POSCO STEELEON</b><span>도금·컬러 가동계획</span></a>
        <div class="shell-tools noprint"><button type="button" id="ui-theme" aria-label="화면 모드">${{ auto: '◐ 자동', light: '☀ 밝게', dark: '☾ 어둡게' }[theme]}</button></div></div>
      <div class="shell-head">${d.crumb ? `<div class="crumb">${esc(d.crumb)}</div>` : ''}<h1>${esc(d.title || document.title)}</h1>${d.sub != null ? `<p class="sub" id="ui-sub">${esc(d.sub)}</p>` : ''}</div>
      <nav class="shell-nav" aria-label="메뉴">${nav}<span class="ink" aria-hidden="true"></span></nav></div>`;
    const ink = h.querySelector('.ink'), cur = h.querySelector('.shell-nav a[aria-current]'), navEl = h.querySelector('.shell-nav');
    const place = (a) => { if (!a) { ink.style.width = 0; return; } ink.style.left = (a.offsetLeft + 10) + 'px'; ink.style.width = (a.offsetWidth - 20) + 'px'; };
    requestAnimationFrame(() => { place(cur); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    navEl.addEventListener('mouseover', (e) => { const a = e.target.closest('a'); if (a) place(a); });
    navEl.addEventListener('mouseleave', () => place(cur));
    addEventListener('resize', () => place(cur));
    h.querySelector('#ui-theme').addEventListener('click', (e) => {
      theme = { auto: 'light', light: 'dark', dark: 'auto' }[theme]; try { localStorage.setItem(TKEY, theme); } catch (x) { /* 무시 */ }
      applyTheme(theme); e.currentTarget.textContent = { auto: '◐ 자동', light: '☀ 밝게', dark: '☾ 어둡게' }[theme];
    });
  }

  UI.sub = (text) => { const s = document.getElementById('ui-sub'); if (s) s.textContent = text; };

  /* 처음 보이는 카드만 차례로 떠오르게(다시 그려도 반복하지 않음) */
  const seen = new Set();
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
      if (reduce() || from === to) { el.textContent = fmt(to); return; }
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
