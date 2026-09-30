/* 롤링 재계획: 실적(t0까지)을 반영해 남은 기간을 다시 최적화한다.
   lateW = 지연 1톤·일의 M/C 환산(기본 0.01 = M/C 1회 ↔ 100톤·일). 2026-10 시험: 2CGL 이틀 고장 시 M/C +2회로 지연 907t·1,139톤·일 감소 — 기준은 사업 판단.
   stabW = 기존 계획과 강종이 다른 라인·일 1일당 M/C 환산(기본 0.1 = 10일 ↔ M/C 1회). 0.01이면 12월 재가동 강종까지 바꿔 M/C 환산 0.33을 아끼는 등
   교란과 먼 일정이 흔들렸음(지연 동일) → 0.1로 상향. 1이면 사실상 고정(지연 +335톤·일).
   - 남은 수요 = 계획 수요 − 실적(부서·강종·마감일 버킷 단위)
   - t0 당일 라인 강종 = 현재 상태, t0+1 ~ t0+동결일수는 기존 계획 강종 유지(소재 준비 등 현장 제약)
   - 지연·결품을 M/C보다 우선해 최소화, 같은 조건이면 기존 계획과 가까운 일정 선호(계획 안정성)
   사내에서는 MES 실적(코일 → 주문 → 버킷 매핑)과 설비정지 예정을 actual로 넣는다. */
(function (root) {
  const GP = root.GP || (root.GP = {});

  // timeLimit 1e7초 = 사실상 무제한: 재계획은 오래 걸려도 최적 증명까지(시간 제한에 걸리면 최적이 아닌 해가 조용히 나옴). phase2Mode 'exact' = 2단계도 전체 탐색
  GP.REPLAN_DEFAULTS = { freezeDays: 2, allowLate: true, maxLate: 14, lateW: 0.01, shortW: 1000, stabW: 0.1, stabW2: 500, timeLimit: 1e7, phase2Mode: 'exact' };

  /* 시험용 가짜 실적: 기존 계획을 t0까지 그대로 생산했다고 보고 교란을 적용.
     교란: {type:'down', line, from, to, minutes?} 설비정지(과거면 실적 감소, 미래면 가동가능시간 차감, minutes 없으면 종일)
           {type:'reject', line, date, tons} 불량(해당일 실적에서 제외 → 다시 만들어야 함) */
  GP.simulateActuals = function (R, t0, disruptions = []) {
    const P = R.P;
    let rows = R.rows.filter((r) => r[0] <= t0).map((r) => r.slice());
    const extraDown = {}, notes = [];
    for (const x of disruptions) {
      if (x.type === 'down') {
        for (const d of GP.dateRange(x.from, x.to)) {
          if (d <= t0) {
            const frac = x.minutes ? Math.min(1, x.minutes / Math.max(1, (R.cal.find((c) => c.line === x.line && c.date === d) || { cap: 1440 }).cap)) : 1;
            rows.forEach((r) => { if (r[1] === x.line && r[0] === d) r[4] = GP.round(r[4] * (1 - frac), 2); });
          } else extraDown[`${x.line}|${d}`] = (extraDown[`${x.line}|${d}`] || 0) + (x.minutes || 1440);
        }
        notes.push(`${x.line} ${GP.md(x.from)}~${GP.md(x.to)} 설비정지${x.minutes ? ` ${GP.fmt(x.minutes)}분/일` : '(종일)'}`);
      } else if (x.type === 'reject') {
        const day = rows.filter((r) => r[1] === x.line && r[0] === x.date), tot = GP.sum(day, (r) => r[4]);
        day.forEach((r) => { r[4] = GP.round(r[4] * Math.max(0, 1 - x.tons / tot), 2); });
        notes.push(`${x.line} ${GP.md(x.date)} 불량 ${GP.fmt(x.tons)}t (재생산 필요)`);
      }
    }
    rows = rows.filter((r) => r[4] > 0.05);
    const state = {};
    for (const l of P.lines) { const c = R.cal.find((c) => c.line === l && c.date === t0); state[l] = c ? c.fam : P.initFamily[l]; }
    return { t0, rows, state, extraDown, notes };
  };

  /* R: 기준 계획 결과, act: {t0, rows, state, extraDown, notes}. 반환: 같은 형식의 결과(과거=실적 + 미래=재계획) */
  GP.DEPTS_ALL = ['도금수출', '자동차수출', '도금국내', '자동차내수', '자가재'];   // report.js DEPTS 와 같은 순서(워커엔 report.js 없음)
  GP.replan = function (highs, R, act, opts = {}, log) {
    const P = R.P, H = GP.horizon(P), O = Object.assign({}, GP.REPLAN_DEFAULTS, opts);
    if (act.t0 < H.D0 || act.t0 >= H.D1) throw new Error(`실적 기준일 ${act.t0}이 계획 기간 밖`);
    const done = {};
    for (const [d, l, a, c, t, du] of act.rows) done[`${c}|${a}|${du}`] = (done[`${c}|${a}|${du}`] || 0) + t;
    const over = [];
    const rem = R.buckets.map((b) => {
      const k = `${b.cls}|${b.alloy}|${b.due}`, left = b.orig - (done[k] || 0);
      if (left < -0.5) over.push(`${b.cls} ${b.alloy} ${GP.md(b.due)} +${GP.fmt(-left)}t`);
      return Object.assign({}, b, { orig: Math.max(0, left) });
    });
    const baseState = {};
    for (const c of R.cal) baseState[`${c.line}|${c.date}`] = c.fam;
    const MO = { t0: act.t0, init: act.state, freezeUntil: O.freezeDays > 0 ? GP.addDays(act.t0, O.freezeDays) : null, baseState, allowLate: O.allowLate, maxLate: O.maxLate, lateW: O.lateW, shortW: O.shortW, stabW: O.stabW, stabW2: O.stabW2, extraDown: act.extraDown || {} };
    log && log(`실적 ${GP.fmt(GP.sum(act.rows, (r) => r[4]))}t 반영(~${GP.md(act.t0)}), 남은 수요 ${GP.fmt(GP.sum(rem, (b) => b.orig))}t, 강종 동결 ~${MO.freezeUntil ? GP.md(MO.freezeUntil) : '없음'}`);
    const PS = Object.assign({}, P, { timeLimit1: O.timeLimit, timeLimit2: O.timeLimit, phase2Mode: O.phase2Mode });
    const milp = GP.runMILP(highs, rem, PS, log, MO);
    const lev = GP.runLevel(highs, rem, PS, milp.state, log, MO);
    const rows = act.rows.concat(lev.rows).sort((p, q) => (p.join('\u0001') < q.join('\u0001') ? -1 : 1));
    const actDay = {};
    for (const r of act.rows) actDay[`${r[1]}|${r[0]}`] = (actDay[`${r[1]}|${r[0]}`] || 0) + r[4];
    const planDay = {};
    for (const r of R.rows) if (r[0] <= act.t0) planDay[`${r[1]}|${r[0]}`] = (planDay[`${r[1]}|${r[0]}`] || 0) + r[4];
    const past = R.cal.filter((c) => c.date <= act.t0).map((c) => {
      const k = `${c.line}|${c.date}`, gap = (planDay[k] || 0) - (actDay[k] || 0);
      return gap > 1 ? Object.assign({}, c, { event: (c.event ? c.event + ' · ' : '') + `실적 미달 ${GP.fmt(gap)}t` }) : c;
    });
    const cal = past.concat(lev.cal).sort((a, b) => (a.date + a.line < b.date + b.line ? -1 : 1));
    const dest = GP.splitDest(rows, R.items, P);
    // 기존 대비 전환 일정 변화(t0 이후)
    const ev = (cal_) => cal_.filter((c) => c.date > act.t0 && /M\/C|재가동/.test(c.event || '')).map((c) => `${c.date}|${c.line}|${c.event.split(' · ')[0]}`);
    const before = ev(R.cal), after = ev(cal);
    const shortBy = (lev.shortBy.length ? lev.shortBy : milp.shortBy).map(([id, t]) => { const b = rem.find((x) => x.id === id); return `${b.cls} ${b.alloy} ${GP.md(b.due)} ${GP.fmt(t)}t`; });
    const replan = {
      t0: act.t0, freezeUntil: MO.freezeUntil, notes: act.notes || [], actualT: GP.sum(act.rows, (r) => r[4]),
      planToDateT: GP.sum(R.rows.filter((r) => r[0] <= act.t0), (r) => r[4]),
      removed: before.filter((x) => !after.includes(x)), added: after.filter((x) => !before.includes(x)),
      over, shortBy, late: milp.late, baseMC: R.milp && R.milp.K, options: O, optimal: !!(milp.optimal1 && milp.optimal2 && milp.phase2Exact),
    };
    // 계획 대비 실적(대시보드): 라인×일, 부서 누계
    replan.vsPlan = [];
    for (const d of GP.dateRange(H.D0, act.t0)) for (const l of P.lines) replan.vsPlan.push([d, l, GP.round(planDay[`${l}|${d}`] || 0, 1), GP.round(actDay[`${l}|${d}`] || 0, 1)]);
    replan.byDept = GP.DEPTS_ALL.map((c) => [c, GP.round(GP.sum(R.rows.filter((r) => r[0] <= act.t0 && r[3] === c), (r) => r[4]), 1), GP.round(GP.sum(act.rows.filter((r) => r[3] === c), (r) => r[4]), 1)]);
    log && log(`재계획${replan.optimal ? '(최적 증명)' : '(최적 미증명 — 시간 제한)'}: M/C(남은 기간) ${milp.K}회, 지연 ${GP.fmt(milp.late)}톤·일, 결품 ${GP.fmt(milp.short)}t, 전환 변경 −${replan.removed.length}/+${replan.added.length}`);
    return Object.assign({}, R, { rows, cal, dest: dest.rows, destBad: dest.bad, slack: lev.slack, milp: Object.assign({}, milp, { base: R.milp }), replan });
  };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
