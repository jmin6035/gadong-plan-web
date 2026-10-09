/* 소재 조달 판단: published/procure.enc.json (tools/procure_data.py --out)
   필요 주차 × 소재마다 → 재고·입고예정 충당 → 부족분을 '남은 일수 안에 들어오는 업체' 중 우선순위로 추천.
   업체 기준정보·입고예정·주문재 목록·판단(업체/수량/상태/메모)은 이 브라우저(localStorage)에 저장, JSON 으로 주고받기 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw', ST_KEY = 'cgl-procure-v0';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const addD = (s, k) => { const d = new Date(s + 'T00:00:00Z'); if (isNaN(d)) return ''; d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  const diff = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5);
  const PL = { C: '컬러', G: '도금 FH' };
  const G_CODES = 'FHNTY';
  const plantOf = (code) => (G_CODES.includes(code) ? 'G' : 'C');
  const PERIODS = [['w1', '1주차'], ['w4', '2~4주'], ['w8', '5~8주'], ['w9', '9주 이후'], ['all', '전체']];
  const STATUS = ['판단대기', '요청', '발주됨', '보류'];
  let D = null, S = null, tab = 'board', period = 'w4', plantF = 'all', open = {}, onlyShort = true, justOpened = null, lastTab = null;

  /* ---------- 저장 상태 ---------- */
  function defaults() {
    return { today: D.today, safety: 5, dueLead: 7, sup: D.suppliers.map((s) => ({ ...s, on: true, memo: '' })), arr: [], orders: [], dec: {} };
  }
  function load() { try { const x = JSON.parse(localStorage.getItem(ST_KEY) || 'null'); if (x && x.sup) return { ...defaults(), ...x, today: D.today }; } catch (e) { /* 무시 */ } return defaults(); }
  function save() { try { localStorage.setItem(ST_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ } }

  /* ---------- 계산 ---------- */
  function units() {
    // 주문재 목록이 있으면 그 목록의 마지막 필요일까지 '주문재(추정)'을 빼고 목록으로 대체
    const cut = S.orders.length ? S.orders.map((o) => o.need).sort().pop() : null;
    const M = new Map();
    const get = (wk, plant, code) => { const k = `${wk}|${plant}|${code}`; if (!M.has(k)) M.set(k, { key: k, wk, plant, code, first: null, t: 0, use: [], thk: null, est: 0, ord: 0 }); return M.get(k); };
    D.units.forEach((u) => {
      const est = u.src['주문재(추정)'] || 0;
      const drop = cut && u.wk <= cut ? est : 0;
      const x = get(u.wk, u.plant, u.code);
      x.t += u.t - drop; x.est += est - drop; x.first = x.first && x.first < u.first ? x.first : u.first;
      x.use.push(...u.use.filter((r) => !(drop && r[0] === '주문재(추정)')));
      if (u.thk) x.thk = u.thk;
    });
    S.orders.forEach((o) => {
      const wk = monday(o.need), x = get(wk, plantOf(o.code), o.code);
      x.t += o.mat; x.ord += o.mat; x.first = x.first && x.first < o.need ? x.first : o.need;
      x.use.push(['주문재(목록)', o.cust || '-', o.prod + (o.con ? ' ' + o.con : ''), o.mat]);
      if (o.thk) x.thk = x.thk ? [Math.min(x.thk[0], o.thk), Math.max(x.thk[1], o.thk)] : [o.thk, o.thk];
    });
    return [...M.values()].filter((x) => x.t >= 1).sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.code < b.code ? -1 : 1));
  }
  function monday(s) { const d = new Date(s + 'T00:00:00Z'); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10); }

  function judge() {
    const U = units();
    const lots = {};                                              // 공장:코드 → [{date, t}] (재고 = 오늘)
    Object.entries(D.stock).forEach(([k, t]) => { (lots[k] = lots[k] || []).push({ date: S.today, t, src: '재고' }); });
    S.arr.forEach((a) => { const k = `${plantOf(a.code)}:${a.code}`; (lots[k] = lots[k] || []).push({ date: a.date, t: +a.t || 0, src: a.sup || '입고예정' }); });
    Object.values(lots).forEach((L) => L.sort((a, b) => (a.date < b.date ? -1 : 1)));
    return U.map((u) => {
      const needBy = addD(u.first, -S.safety), left = diff(needBy, S.today);
      let rem = u.t; const L = lots[`${u.plant}:${u.code}`] || [];
      const cutoff = needBy > S.today ? needBy : S.today;          // 이미 늦은 주는 지금 있는 재고·도착분으로 충당
      for (const l of L) { if (rem <= 0) break; if (l.date > cutoff || l.t <= 0) continue; const q = Math.min(l.t, rem); l.t -= q; rem -= q; }
      const short = Math.max(0, rem), cover = u.t - short;
      const cand = S.sup.filter((s) => s.on && s.plant === u.plant && s.code === u.code).sort((a, b) => a.prio - b.prio);
      const specOk = (s) => !u.thk || !s.thk || (u.thk[0] >= s.thk[0] - 0.005 && u.thk[1] <= s.thk[1] + 0.005);
      const feas = cand.filter((s) => +s.lt <= left && specOk(s));
      const first = cand[0];
      const dec = S.dec[u.key] || {};
      const rec = feas[0] || null;
      let kind;
      if (short < 1) kind = 'ok';
      else if (!cand.length) kind = 'nosup';
      else if (!rec) kind = S.arr.some((a) => a.code === u.code && plantOf(a.code) === u.plant) ? 'adjust' : 'check';   // 그 소재 기발주를 넣었으면 '조정', 아니면 '기발주 확인'
      else if (first && rec !== first) kind = 'alt';
      else kind = 'normal';
      const deadline = first ? addD(needBy, -first.lt) : null;
      return { ...u, needBy, left, short, cover, cand, feas, rec, kind, deadline, dec, specOk };
    });
  }
  const inPeriod = (j) => {
    const w = diff(j.wk, monday(S.today)) / 7;
    return period === 'all' || (period === 'w1' && w < 1) || (period === 'w4' && w >= 1 && w < 4) || (period === 'w8' && w >= 4 && w < 8) || (period === 'w9' && w >= 8);
  };
  const KIND = { ok: ['재고 충당', 'good'], normal: ['1순위 업체', 'good'], alt: ['대체 업체', 'warn'], adjust: ['조정 필요', 'bad'], check: ['기발주 확인', 'warn'], nosup: ['업체 없음', 'bad'] };
  const supName = (s) => (s ? `${s.name && s.name !== s.sup ? s.name : s.sup}` : '-');

  /* ---------- 화면 ---------- */
  const card = (id, title, sm, body) => `<section class="card" id="${id}"><h2>${esc(title)} ${sm ? `<small>${esc(sm)}</small>` : ''}</h2>${body}</section>`;
  const codeNm = (c) => D.matCode[c] || c || '-';                 // 소재는 이름으로만 표시(내부 키는 품명코드)
  const toCode = (v) => { const x = String(v || '').trim(); if (!x) return ''; const u = x.toUpperCase(); const hit = Object.entries(D.matCode).find(([, n]) => n.toUpperCase() === u || n.toUpperCase().replace(/[^A-Z0-9가-힣]/g, '') === u.replace(/[^A-Z0-9가-힣]/g, '')); return hit ? hit[0] : (u.length === 1 && D.matCode[u] ? u : ''); };
  const matSel = (attr, cur) => `<select ${attr} aria-label="소재"><option value="">-</option>${Object.entries(D.matCode).sort((a, b) => (a[1] < b[1] ? -1 : 1)).map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;

  function board() {
    const J = judge(), V0 = J.filter((j) => inPeriod(j) && UI.inScope(j.plant)), V = V0;
    const sum = (f) => V.filter(f).reduce((a, j) => a + j.short, 0);
    const cnt = (k) => V.filter((j) => j.kind === k).length;
    const near = J.filter((j) => j.deadline && j.short >= 1 && diff(j.deadline, S.today) >= 0 && diff(j.deadline, S.today) <= 14).sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
    const nAdj = cnt('adjust') + cnt('nosup'), nChk = cnt('check');
    const kpiBox = (tone, l, v, unit, b, ck, extra = '') => `<div class="kpi tone-${tone}" data-rk="k-${ck}"><div class="l">${l}</div><div class="v ${extra}"><b data-count="${v}" data-ck="${ck}">${n0(v)}</b><small>${unit}</small></div><div class="b">${b}</div></div>`;
    const kp = `<div class="kpis">
      ${kpiBox('brand', '발주 필요(이 기간)', Math.round(sum(() => true)), 't', `${V.filter((j) => j.short >= 1).length}건 · 재고·입고예정 충당 후`, 'need')}
      ${kpiBox(cnt('alt') ? 'warn' : 'good', '대체 업체 필요', cnt('alt'), '건', `1순위 리드타임이 남은 일수보다 김 · ${n0(sum((j) => j.kind === 'alt'))}t`, 'alt', cnt('alt') ? 'wv' : '')}
      <div class="kpi tone-${nAdj ? 'bad' : nChk ? 'warn' : 'good'}" data-rk="k-adj"><div class="l">기발주 확인 · 조정 필요</div><div class="v ${nAdj ? 'bv' : nChk ? 'wv' : ''}"><b data-count="${nChk}" data-ck="chk">${nChk}</b> · <b data-count="${nAdj}" data-ck="adj">${nAdj}</b><small>건</small></div><div class="b">리드타임 안쪽이라 새 발주로는 못 맞춤 · ${n0(sum((j) => ['adjust', 'nosup', 'check'].includes(j.kind)))}t</div></div>
      ${kpiBox(near.length ? 'warn' : 'good', '1순위 발주 시한 2주 안', near.length, '건', near[0] ? `가장 급한 시한 ${esc(codeNm(near[0].code))} ${md(near[0].first)} 필요분 · ${md(near[0].deadline)}` : '-', 'near')}</div>`;
    const ctl = `<div class="bar">
      <div class="tabs">${PERIODS.map(([k, n]) => `<button type="button" data-per="${k}" aria-pressed="${k === period}">${n}</button>`).join('')}</div>
      <label class="onlyshort"><input type="checkbox" id="p-only" ${onlyShort ? 'checked' : ''}> 발주 필요만 보기 <span class="muted">(${V.filter((j) => j.short >= 1).length}/${V.length})</span></label>
      <span class="sp"></span>
      <button type="button" class="btn primary" id="p-export">구매 요청서 내보내기(.xlsx)</button></div>`;
    const VR = onlyShort ? V.filter((j) => j.short >= 1) : V;
    const rows = VR.map((j) => {
      const [kn, kc] = KIND[j.kind], d = j.dec;
      const okL = j.cand.filter((x) => j.specOk(x)).map((x) => +x.lt), minLT = okL.length ? Math.min(...okL) : null;
      const specNote = j.cand.some((x) => !j.specOk(x) && +x.lt <= j.left) ? ' · 더 빠른 업체는 두께 범위 밖' : '';
      const sel = d.sup || (j.rec && j.rec.sup) || '';
      const qty = d.qty != null && d.qty !== '' ? d.qty : Math.ceil(j.short);
      const opts = ['<option value="">-</option>'].concat(j.cand.map((s) => `<option value="${esc(s.sup)}" ${s.sup === sel ? 'selected' : ''}>${esc(supName(s))} · LT ${s.lt}일${+s.lt > j.left ? ' (늦음)' : ''}${j.specOk(s) ? '' : ' (사양 밖)'}</option>`)).join('');
      const why = j.kind === 'ok' ? '재고·입고예정으로 충당'
        : j.kind === 'nosup' ? '등록된 업체 없음 → 업체 기준정보에 추가'
          : j.kind === 'check' ? `${minLT == null ? '두께 범위에 맞는 등록 업체 없음' : `남은 ${j.left}일 < 리드타임(최단 ${minLT}일)`} → 이미 발주돼 있어야 할 양(입고예정에 기발주 입력)${specNote}`
          : j.kind === 'adjust' ? `${minLT == null ? '두께 범위에 맞는 등록 업체 없음' : `남은 ${j.left}일 < 최단 LT ${minLT}일`} → 재고 전환·투입 순서 변경·자가재 대체 검토${specNote}`
            : j.kind === 'alt' ? `1순위 ${esc(supName(j.cand[0]))} LT ${j.cand[0].lt}일 > 남은 ${j.left}일 → ${esc(supName(j.rec))}(LT ${j.rec.lt}일)`
              : `남은 ${j.left}일 ≥ LT ${j.rec.lt}일 · 시한 ${md(j.deadline)}`;
      const isOpen = open[j.key];
      return `<tr class="u ${isOpen ? 'on' : ''}" data-k="${esc(j.key)}">
        <td class="l"><button type="button" class="tg" aria-expanded="${!!isOpen}" aria-label="용도 보기">${isOpen ? '▾' : '▸'}</button> ${md(j.first)} <span class="muted">(${j.left >= 0 ? 'D-' + j.left : -j.left + '일 지남'})</span></td>
        <td class="l">${PL[j.plant]} <b>${esc(codeNm(j.code))}</b>${j.thk ? `<br><span class="muted">${j.thk[0]}~${j.thk[1]}mm</span>` : ''}</td>
        <td>${n0(j.t)}${j.est >= 1 ? `<br><span class="muted">추정 ${n0(j.est)}</span>` : ''}</td><td>${n0(j.cover)}</td><td><b>${j.short >= 1 ? n0(j.short) : '·'}</b></td>
        <td class="l jd"><span class="st ${kc}">${kn}</span><div class="why">${why}</div></td>
        <td class="l dec">${j.short >= 1 ? `<div class="dg"><label>업체<select data-f="sup" aria-label="업체">${opts}</select></label><label>수량<input data-f="qty" type="number" min="0" step="10" value="${esc(qty)}" aria-label="수량"></label><label>상태<select data-f="status" aria-label="상태">${STATUS.map((x) => `<option ${x === (d.status || '판단대기') ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>` : '<span class="muted">발주 불필요</span>'}
          <input class="memo" data-f="memo" type="text" value="${esc(d.memo || '')}" placeholder="메모" aria-label="메모"></td></tr>
        ${isOpen ? `<tr class="ux"><td colspan="7"><div class="${j.key === justOpened ? 'drop' : ''}"><div class="use"><b>무엇을 만들려고</b> ${j.use.slice().sort((a, b) => b[3] - a[3]).slice(0, 12).map((r) => `<span><i>${esc(r[0])}</i> ${esc(r[1])} ${esc(r[2])} <b>${n0(r[3])}t</b></span>`).join('')}</div>
          <div class="use"><b>업체별</b> ${j.cand.map((s) => `<span class="${+s.lt <= j.left && j.specOk(s) ? '' : 'no'}">${s.prio}순위 ${esc(supName(s))} LT ${s.lt}일 → 발주 시한 ${md(addD(j.needBy, -s.lt))}${j.specOk(s) ? '' : ' · 두께 범위 밖'}</span>`).join('') || '-'}</div></div></td></tr>` : ''}`;
    }).join('');
    return card('p-board', '판단 보드', `기준일 ${S.today} · 필요일 = 투입 ${S.safety}일 전 입고`, kp + ctl + `
      <div class="scroll"><table class="t bd"><thead><tr><th class="l">첫 필요일</th><th class="l">소재</th><th>필요(t)</th><th>충당</th><th>발주 필요</th><th class="l">판단 · 이유</th><th class="l">결정 (업체 · 수량 · 상태 · 메모)</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="c muted">이 기간에 해당 없음</td></tr>'}</tbody></table></div>
      <p class="small">판단 단위 = 필요 주차 × 소재. 충당 = 오늘 재고 + 필요일까지 들어오는 입고예정(이른 주부터). 남은 일수 = 첫 필요일 − ${S.safety}일 − 기준일. 업체는 리드타임 ≤ 남은 일수 · 두께 범위 안에서 우선순위가 가장 높은 곳을 추천 — 선택을 바꾸면 이 브라우저에 저장.</p>`);
  }

  function arrivals() {
    const rows = S.arr.map((a, i) => `<tr data-i="${i}"><td><input data-a="sup" value="${esc(a.sup)}" aria-label="업체"></td><td>${matSel('data-a="code"', a.code)}</td><td><input data-a="t" type="number" value="${esc(a.t)}" aria-label="수량"></td><td><input data-a="date" type="date" value="${esc(a.date)}" aria-label="입고예정일"></td><td><input data-a="po" value="${esc(a.po || '')}" aria-label="발주번호"></td><td><input data-a="memo" value="${esc(a.memo || '')}" aria-label="메모"></td><td><button type="button" class="x" data-del="arr" data-i="${i}" aria-label="삭제">✕</button></td></tr>`).join('');
    return card('p-arr', '입고예정 · 기발주 잔량', `${S.arr.length}건 · 합계 ${n0(S.arr.reduce((a, x) => a + (+x.t || 0), 0))}t`, `
      <p class="lead">MES 기발주 화면이 생기기 전까지 소재구매그룹 목록을 여기에 넣으면 '충당'에 반영됩니다.</p>
      <div class="bar"><button type="button" class="btn" data-add="arr">+ 줄 추가</button><label class="btn">엑셀 올리기<input type="file" accept=".xlsx" data-up="arr" hidden></label><span class="small">양식: 소재조달_양식_v0.xlsx '입고예정' 시트 (업체 · 소재 · 수량(t) · 입고예정일 · 발주번호 · 메모)</span></div>
      <div class="scroll"><table class="t ed"><thead><tr><th>업체</th><th>소재</th><th>수량(t)</th><th>입고예정일</th><th>발주번호</th><th>메모</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="c muted">없음 — 지금 판단은 재고만으로 충당</td></tr>'}</tbody></table></div>
      <h3>현재 재고(구매소재, 자가 제외)</h3><p class="small">${esc(D.stockNote)}</p>
      <div class="chips">${Object.entries(D.stock).filter(([k, t]) => t >= 1 && UI.inScope(k[0])).sort((a, b) => b[1] - a[1]).map(([k, t]) => `<span class="chip">${PL[k[0]]} ${esc(codeNm(k.slice(2)))} <b>${n0(t)}t</b></span>`).join('')}</div>`);
  }

  function orders() {
    const cut = S.orders.length ? S.orders.map((o) => o.need).sort().pop() : null;
    const rows = S.orders.map((o, i) => `<tr><td class="l">${esc(o.con || '')}</td><td class="l">${esc(o.prod)}</td><td class="l">${esc(o.cust || '')}</td><td>${o.thk || '-'}</td><td>${o.wid || '-'}</td><td>${esc(codeNm(o.code))}</td><td>${n0(o.qty)}</td><td>${md(o.due)}</td><td>${md(o.need)}</td><td>${n0(o.mat)}</td><td><button type="button" class="x" data-del="orders" data-i="${i}" aria-label="삭제">✕</button></td></tr>`).join('');
    return card('p-ord', '주문재 목록 (마케팅)', S.orders.length ? `${S.orders.length}건 · ${md(cut)} 필요분까지 추정치 대신 사용` : '아직 없음 — 판단 보드의 주문재는 추정치', `
      <p class="lead">마케팅 목록을 올리면 그 목록의 마지막 필요일까지 '주문재(추정)'을 빼고 목록 수량으로 판단합니다.</p>
      <div class="bar"><label class="btn">엑셀 올리기<input type="file" accept=".xlsx" data-up="orders" hidden></label>${S.orders.length ? '<button type="button" class="btn" data-clear="orders">목록 비우기</button>' : ''}
        <label class="small">납기 → 컬러 투입 <input type="number" id="p-duelead" value="${S.dueLead}" min="0" max="60" style="width:56px">일 전</label>
        <span class="small">양식: '주문재 목록' 시트 (계약번호 · 품명 · 고객 · 두께 · 폭 · 소재 · 수량(t) · 납기)</span></div>
      <div class="scroll"><table class="t"><thead><tr><th class="l">계약번호</th><th class="l">품명</th><th class="l">고객</th><th>두께</th><th>폭</th><th>소재</th><th>제품(t)</th><th>납기</th><th>투입</th><th>구매소재(t)</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="11" class="c muted">없음</td></tr>'}</tbody></table></div>
      <p class="small">구매소재 = 제품 × 소재/제품 비(품명별 실수율) × (1 − 자가재 비중). 소재 칸이 비면 품명의 과거 소재(가장 많은 것), 채우면 그 소재 전량 구매로 봄. 소재 칸은 소재명(CGI, GALVALUME(AZ) 등)으로 적음.</p>`);
  }

  function suppliers() {
    const L = S.sup.map((s, i) => ({ s, i })).filter(({ s }) => UI.inScope(s.plant)).sort((a, b) => (a.s.plant + a.s.code + String(a.s.prio).padStart(3, '0') < b.s.plant + b.s.code + String(b.s.prio).padStart(3, '0') ? -1 : 1));
    const rows = L.map(({ s, i }) => `<tr data-i="${i}"><td><input type="checkbox" data-s="on" ${s.on ? 'checked' : ''} aria-label="사용"></td><td>${PL[s.plant] || ''}</td><td>${matSel('data-s="code"', s.code)}</td>
      <td class="l"><input data-s="sup" value="${esc(s.sup)}" size="3" aria-label="업체코드"> <input data-s="name" value="${esc(s.name)}" aria-label="업체명"></td>
      <td><input data-s="prio" type="number" min="1" value="${esc(s.prio)}" style="width:52px" aria-label="우선순위"></td><td><input data-s="lt" type="number" min="0" value="${esc(s.lt)}" style="width:60px" aria-label="리드타임"></td>
      <td class="muted">${s.ltMed != null ? `${s.ltMed}일 · ${s.ltN || 0}건` : '-'}</td><td class="muted">${s.share != null ? Math.round(s.share * 100) + '%' : '-'}</td>
      <td class="muted">${s.thk ? `${s.thk[0]}~${s.thk[1]}` : '-'}</td><td><input data-s="memo" value="${esc(s.memo || '')}" placeholder="정기 마감·MOQ 등" aria-label="메모"></td><td><button type="button" class="x" data-del="sup" data-i="${i}" aria-label="삭제">✕</button></td></tr>`).join('');
    return card('p-sup', '업체 기준정보', '우선순위 · 리드타임은 소재구매그룹과 맞춰 고칠 값', `
      <div class="bar"><button type="button" class="btn" data-add="sup">+ 업체 추가</button><button type="button" class="btn" id="p-supreset">처음 값으로</button><span class="small">리드타임 = 발주 → 입고(일). 초기값은 재고현황 '주문일시 → 소재입고일' 실적 80% (주문일시가 소재 발주일인지 전산 확인 중)</span></div>
      <div class="scroll"><table class="t ed"><thead><tr><th>사용</th><th>공장</th><th>소재</th><th class="l">업체</th><th>우선</th><th>LT(일)</th><th>LT 실적(중앙)</th><th>이력 비중</th><th>두께 범위</th><th>메모</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }

  function basis() {
    return card('p-basis', '계산 기준', '', `<ul class="notes">
      <li><b>필요량</b> 컬러 구매소재 = 통합 계획(V1) 컬러 일별 ÷ 실수율 × (1 − 자가재 비중) × 품명별 소재 비중(13주 실적, 매칭률 ${Math.round(D.codeMix.matchedShare * 100)}%) · 도금 FH = 도금 일별 ÷ 실수율, AL→H · AZ·MAC→F · AL-STS→N · 27.1~3월은 TF 월 판매계획을 주별로 나눔</li>
      <li><b>계획재</b>는 우리가 정하는 양(계획 그대로), 나머지 컬러 그룹은 <b>주문재(추정)</b> — 마케팅 목록이 오면 대체</li>
      <li><b>충당</b> 재고 → 입고예정 순, 이른 필요일부터. ${esc(D.stockNote)}. 9월말 이후 FH 입고는 자료가 없어 FH 충당은 적게 잡힘 — 입고예정 탭에 기발주를 넣어야 정확</li>
      <li><b>업체 판단</b> 남은 일수 = 첫 필요일 − 여유일 − 기준일. 리드타임 ≤ 남은 일수인 업체 중 우선순위 1등을 추천. 1순위가 안 되면 '대체 업체', 아무도 안 되면 '조정 필요'</li>
      <li><b>확인할 점</b> 리드타임 기준(주문일시), 업체별 정기 마감·최소량, AL-STS 소재(도금용 SUS 재고가 월 사용량에 비해 매우 적음 — 코드 확인 필요), 업체명이 없는 코드(V3·YB·YF)</li></ul>
      <div class="bar"><label class="small">기준일 <input type="date" id="p-today" value="${S.today}"></label><label class="small">입고 → 투입 여유 <input type="number" id="p-safety" value="${S.safety}" min="0" max="30" style="width:56px">일</label>
      <button type="button" class="btn" id="p-dl">설정·판단 내보내기(.json)</button><label class="btn">설정 가져오기<input type="file" accept=".json" id="p-ul" hidden></label><button type="button" class="btn" id="p-resetall">모두 초기화</button></div>
      <h3>공유(서버)</h3><div class="bar"><button type="button" class="btn primary" id="p-push" ${window.SHARE && SHARE.on() ? '' : 'disabled'}>서버에 올리기</button><button type="button" class="btn" id="p-pull" ${window.SHARE && SHARE.on() ? '' : 'disabled'}>서버에서 받기</button><span class="small">${window.SHARE && SHARE.on() ? '업체 기준정보·입고예정·주문재 목록·판단을 모두가 같은 것으로 — 올린 사람·시각이 남음' : '공유 저장소가 아직 꺼져 있음(결정 기록 화면의 공유 설정 참고) — 지금은 .json 내보내기/가져오기로 맞추기'}</span></div>
      <p class="small">저장 위치 = 이 브라우저. 다른 사람과 맞추려면 내보낸 .json 을 보내 가져오기. 자료 계산 ${String(D.built).replace('T', ' ')} (tools/procure_data.py)</p>`);
  }

  const TABS = [['board', '판단 보드'], ['arr', '입고예정'], ['ord', '주문재 목록'], ['sup', '업체 기준정보'], ['basis', '계산 기준·설정']];
  function render() {
    const y = scrollY;
    const body = { board, arr: arrivals, ord: orders, sup: suppliers, basis }[tab]();
    const fresh = lastTab !== tab; lastTab = tab;
    $('p-main').innerHTML = `<nav class="tabs big noprint">${TABS.map(([k, n]) => `<button type="button" data-tab="${k}" aria-pressed="${k === tab}">${n}</button>`).join('')}</nav><div class="${fresh ? 'fade' : ''}">${body}</div>`;
    UI.sub(`필요 시점 → 가능한 업체 → 구매 요청 · 기준일 ${S.today} · 컬러·도금 계획(V1) 연동`);
    $('p-meta').innerHTML = `<span><b>기준일</b>${S.today}</span><span><b>자료</b>컬러·도금 계획 V1 · 소재재고List · 재고현황</span><span><b>계산</b>${String(D.built).replace('T', ' ')}</span><span><b>단위</b>톤</span>`;
    UI.reveal($('p-main')); UI.count($('p-main')); justOpened = null;
    scrollTo(0, y);
  }

  /* ---------- 엑셀 ---------- */
  async function readSheet(file, want) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets.find((w) => want.some((n) => w.name.includes(n))) || wb.worksheets[0];
    let hdr = null, hr = 0; const out = [];
    ws.eachRow((row, r) => {
      const v = row.values.slice(1).map((c) => (c && typeof c === 'object' ? (c instanceof Date ? c : c.result != null ? c.result : c.text != null ? c.text : '') : c));
      if (!hdr) { if (v.filter((c) => typeof c === 'string' && c.length <= 20 && /수량|업체|품명|소재|납기|입고/.test(c)).length >= 2) { hdr = v.map((c) => String(c || '').replace(/\s/g, '')); hr = r; } return; }
      if (r > hr && v.some((c) => c !== '' && c != null) && !v.some((c) => typeof c === 'string' && c.includes('예시'))) out.push(Object.fromEntries(hdr.map((h, i) => [h, v[i]])));
    });
    return out;
  }
  const pick = (o, ...keys) => { for (const k of keys) { const h = Object.keys(o).find((x) => x.includes(k)); if (h && o[h] !== '' && o[h] != null) return o[h]; } return ''; };
  const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10) : String(v || '').replace(/[./]/g, '-').slice(0, 10));
  function topCode(p) { const m = D.codeMix.byProduct[p] || D.codeMix.byProduct[String(p).replace(/\d+$/, '')] || { G: 1 }; return Object.entries(m).sort((a, b) => b[1] - a[1])[0][0]; }
  function orderRow(o) {
    const prod = String(pick(o, '품명')).trim().toUpperCase(), qty = +pick(o, '수량') || 0, due = dstr(pick(o, '납기', '필요일'));
    const given = toCode(pick(o, '소재'));
    const fac = D.cfac[prod] || 1, self = given ? 0 : (D.selfShare[prod] || 0);
    return { con: String(pick(o, '계약')), prod, cust: String(pick(o, '고객')), thk: +pick(o, '두께') || null, wid: +pick(o, '폭') || null, code: given || topCode(prod), qty, due, need: addD(due, -S.dueLead), mat: qty * fac * (1 - self) };
  }
  async function upload(kind, file) {
    try {
      if (kind === 'arr') {
        const R = await readSheet(file, ['입고']);
        S.arr = S.arr.concat(R.map((o) => ({ sup: String(pick(o, '업체')), code: toCode(pick(o, '소재')), t: +pick(o, '수량') || 0, date: dstr(pick(o, '입고')), po: String(pick(o, '발주번호')), memo: String(pick(o, '메모')) })).filter((a) => a.code && a.t && /^\d{4}-\d\d-\d\d$/.test(a.date)));
      } else {
        const R = await readSheet(file, ['주문재']);
        S.orders = R.map(orderRow).filter((o) => o.prod && o.qty && /^\d{4}-\d\d-\d\d$/.test(o.due));
      }
      save(); render();
    } catch (e) { alert('엑셀을 읽지 못했습니다: ' + e.message); }
  }
  async function exportReq() {
    const J = judge().filter((j) => j.short >= 1);
    let L = J.filter((j) => j.dec.status === '요청');
    if (!L.length) { L = J.filter((j) => inPeriod(j) && UI.inScope(j.plant) && j.dec.status !== '보류' && j.dec.status !== '발주됨' && (j.dec.sup || j.rec)); if (!L.length) { alert('내보낼 줄이 없습니다'); return; } }
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('구매 요청서');
    ws.addRow([`소재 구매 요청서 — 작성 ${S.today} (상태 '요청' 줄, 없으면 보고 있는 기간 전체)`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    const H = ['요청번호', '업체', '업체코드', '공장', '소재', '두께(mm)', '수량(t)', '입고 요청일', '첫 투입일', '리드타임(일)', '선정 이유', '용도(상위)', '메모', '발주번호(회신)', '약속 납기(회신)', '회신 메모'];
    const hr = ws.addRow(H); hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }; hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
    const bySup = {};
    L.forEach((j) => { const sup = j.dec.sup || (j.rec && j.rec.sup) || '미정'; (bySup[sup] = bySup[sup] || []).push(j); });
    let n = 0;
    Object.keys(bySup).sort().forEach((sup) => bySup[sup].forEach((j) => {
      const s = S.sup.find((x) => x.sup === sup && x.code === j.code && x.plant === j.plant);
      const reason = !s ? '업체 미정' : (+s.lt > j.left ? `리드타임 ${s.lt}일 > 남은 ${j.left}일 — 확인 필요` : j.kind === 'alt' ? `1순위 ${supName(j.cand[0])} 리드타임 초과 → 대체` : '우선순위 1 · 리드타임 충족');
      ws.addRow([`R${S.today.replace(/-/g, '').slice(2)}-${String(++n).padStart(3, '0')}`, s ? supName(s) : sup, sup, PL[j.plant], codeNm(j.code), j.thk ? `${j.thk[0]}~${j.thk[1]}` : '', Math.round(+(j.dec.qty || Math.ceil(j.short))), j.needBy, j.first, s ? +s.lt : '', reason,
        j.use.slice().sort((a, b) => b[3] - a[3]).slice(0, 3).map((r) => `${r[1]} ${r[2]} ${Math.round(r[3])}t`).join(', '), j.dec.memo || '', '', '', '']);
    }));
    [10, 16, 8, 8, 16, 10, 9, 11, 11, 9, 30, 40, 16, 14, 13, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    for (let r = 4; r <= ws.rowCount; r++) ws.getRow(r).eachCell({ includeEmpty: true }, (c, ci) => { c.border = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } }, left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } }; if (ci >= 14) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E0' } }; c.alignment = { vertical: 'top', wrapText: ci >= 11 }; });
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = `소재구매요청서_${S.today}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target; let b;
    if ((b = t.closest('[data-tab]'))) { tab = b.dataset.tab; render(); return; }
    if ((b = t.closest('[data-per]'))) { period = b.dataset.per; render(); return; }
    if ((b = t.closest('button.tg'))) { const k = b.closest('tr').dataset.k; open[k] = !open[k]; justOpened = open[k] ? k : null; render(); return; }
    if ((b = t.closest('[data-add]'))) { if (b.dataset.add === 'arr') S.arr.push({ sup: '', code: '', t: '', date: S.today, po: '', memo: '' }); else S.sup.push({ plant: 'C', code: '', sup: '', name: '', prio: 9, lt: 30, on: true, memo: '' }); save(); render(); return; }
    if ((b = t.closest('[data-del]'))) { S[b.dataset.del].splice(+b.dataset.i, 1); save(); render(); return; }
    if ((b = t.closest('[data-clear]'))) { S[b.dataset.clear] = []; save(); render(); return; }
    if (t.id === 'p-export') { exportReq(); return; }
    if (t.id === 'p-supreset' && confirm('업체 기준정보를 처음 값으로 되돌릴까요?')) { S.sup = defaults().sup; save(); render(); return; }
    if (t.id === 'p-resetall' && confirm('모든 설정·입고예정·주문재·판단을 지울까요?')) { S = defaults(); save(); render(); return; }
    if (t.id === 'p-push') { const by = (() => { try { return localStorage.getItem('cgl-me') || ''; } catch (x) { return ''; } })(); SHARE.put('procure_state', { id: 'main', state: S, by }).then(() => UI.toast('서버에 올림')).catch((x) => alert(x.message)); return; }
    if (t.id === 'p-pull') { SHARE.get('procure_state', 'main').then((r) => { if (!r) { alert('서버에 올라간 상태가 없습니다'); return; } if (!confirm(`${String(r.at).slice(0, 16).replace('T', ' ')} ${r.by || ''} 이 올린 상태로 바꿀까요? (이 브라우저 입력은 덮어씀)`)) return; S = { ...defaults(), ...r.state, today: D.today }; save(); render(); UI.toast('서버 상태로 바꿈'); }).catch((x) => alert(x.message)); return; }
    if (t.id === 'p-dl') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); a.download = `소재조달_설정_${S.today}.json`; a.click(); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.f) { const k = t.closest('tr').dataset.k; const d = S.dec[k] = S.dec[k] || {}; d[t.dataset.f] = t.value; save(); UI.toast('저장됨'); if (t.dataset.f !== 'memo') render(); return; }
    if (t.dataset.a) { const a = S.arr[+t.closest('tr').dataset.i]; a[t.dataset.a] = t.dataset.a === 'code' ? t.value.trim().toUpperCase().slice(0, 1) : t.value; save(); return; }
    if (t.dataset.s) { const s = S.sup[+t.closest('tr').dataset.i]; const f = t.dataset.s; s[f] = f === 'on' ? t.checked : (f === 'prio' || f === 'lt') ? +t.value : f === 'code' ? t.value.trim().toUpperCase().slice(0, 1) : t.value; if (f === 'code') s.plant = plantOf(s.code); save(); if (f === 'code' || f === 'prio') render(); return; }
    if (t.dataset.up) { if (t.files[0]) upload(t.dataset.up, t.files[0]); return; }
    if (t.id === 'p-only') { onlyShort = t.checked; render(); return; }
    if (t.id === 'p-today' && t.value) { S.today = t.value; save(); return; }
    if (t.id === 'p-safety') { S.safety = +t.value || 0; save(); return; }
    if (t.id === 'p-duelead') { S.dueLead = +t.value || 0; S.orders = S.orders.map((o) => ({ ...o, need: addD(o.due, -S.dueLead) })); save(); render(); return; }
    if (t.id === 'p-ul' && t.files[0]) { t.files[0].text().then((x) => { const o = JSON.parse(x); if (!o.sup) throw new Error('형식'); S = { ...defaults(), ...o }; save(); render(); }).catch(() => alert('설정 파일이 아닙니다')); }
  });

  let env = null;
  const envReady = GP.latest('procure.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;                              // 자료를 받기 전에 암호를 넣은 경우
    if (pw) { $('p-lockbox').hidden = true; $('p-skel').hidden = false; }
    try { D = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } S = load(); render(); UI.onScope(() => render()); }
    catch (e) { $('p-lockbox').hidden = false; $('p-skel').hidden = true; $('p-form').hidden = false; $('p-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('p-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('p-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; $('p-lock').querySelector('h2').textContent = '소재 조달 판단 — 암호를 입력하세요';
    let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else $('p-form').hidden = false;
  }).catch(() => { $('p-msg').textContent = '자료를 찾을 수 없습니다'; });
})();
