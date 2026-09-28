const { GP, loadInputs } = require('./load');
const REF = process.env.GP_REF;
(async () => {
  const P = GP.clone(GP.DEFAULT_PARAMS);
  const t0 = Date.now();
  const wbs = await loadInputs();
  const { items, checks } = GP.parseInputs(wbs, P);
  console.log('parse sec', (Date.now() - t0) / 1000);
  for (const c of checks) console.log(c.level.toUpperCase(), c.msg);
  const ref = require(REF + '/items.json');
  const key = (i) => `${i.cls}|${i.alloy}|${i.month}|${i.window || ''}|${i.due}`;
  const agg = (arr) => { const m = {}; for (const i of arr) m[key(i)] = (m[key(i)] || 0) + i.tons; return m; };
  const a = agg(items), b = agg(ref.map((i) => Object.assign({}, i, { month: +i.month })));
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  let bad = 0;
  for (const k of ks) if (Math.abs((a[k] || 0) - (b[k] || 0)) > 1e-6) { bad++; console.log('DIFF', k, a[k], b[k]); }
  console.log('items js', items.length, 'py', ref.length, 'agg keys', ks.size, 'diff', bad);
  const { buckets, sept } = GP.buildBuckets(items, P);
  const rb = require(REF + '/buckets.json');
  let bb = 0;
  buckets.forEach((x, i) => { const y = rb[i]; if (!y || y.class_ !== x.cls || y.alloy !== x.alloy || y.due !== x.due || Math.abs(y.orig - x.orig) > 1e-6) { bb++; console.log('BDIFF', i, x, y); } });
  console.log('buckets js', buckets.length, 'py', rb.length, 'diff', bb, 'sept', GP.sum(sept, (s) => s.tons));
})();
