// 브라우저: 저장된 결과 열기 → 간단 입력(설비정지·불량)으로 재계획 → 결과·엑셀
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const S = process.env.GP_OUT;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8767/');
  await p.click('details.load-result summary');
  await p.setInputFiles('#result-file', S + '/up/result.json');
  await p.waitForSelector('#sec-replan:not([hidden])');
  await p.fill('#rp-t0', '2026-10-20');
  const set = async (sel, v) => { await p.fill(sel, v); await p.dispatchEvent(sel, 'change'); };
  await set('[data-rp="0"][data-k="from"]', '2026-10-14'); await set('[data-rp="0"][data-k="to"]', '2026-10-15');
  await p.click('#rp-add'); await p.selectOption('[data-rp="1"][data-k="type"]', 'reject');
  await p.selectOption('[data-rp="1"][data-k="line"]', '1CGL');
  await set('[data-rp="1"][data-k="from"]', '2026-10-18'); await set('[data-rp="1"][data-k="tons"]', '300');
  await p.click('#rp-add');
  await set('[data-rp="2"][data-k="from"]', '2026-10-22'); await set('[data-rp="2"][data-k="to"]', '2026-10-22'); await set('[data-rp="2"][data-k="minutes"]', '720');
  const t0 = Date.now(); await p.click('#rp-run');
  await p.waitForSelector('#replan-box:not([hidden]), #sec-error:not([hidden])', { timeout: 30 * 60000 });
  console.log('sec', (Date.now() - t0) / 1000);
  if (await p.isVisible('#sec-error')) { console.log('ERR', await p.textContent('#error-msg')); process.exit(1); }
  console.log((await p.textContent('#replan-box')).replace(/\s+/g, ' '));
  console.log((await p.textContent('#kpis')).replace(/\s+/g, ' '));
  await p.screenshot({ path: S + '/ui_replan.png', fullPage: false });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dl-xlsx')]); await dl.saveAs(S + '/replan.xlsx');
  const [dj] = await Promise.all([p.waitForEvent('download'), p.click('#dl-json')]); await dj.saveAs(S + '/up/replan_result.json');
  console.log('errors', errs); await b.close();
})();
