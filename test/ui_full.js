// 브라우저 전체 실행: 업로드 → 계산 → 결과 화면 → 엑셀·JSON 다운로드. 모바일 뷰포트
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const S = process.env.GP_OUT;
(async () => {
  const b = await chromium.launch();
  const vp = process.env.VP === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const p = await b.newPage({ viewport: vp, acceptDownloads: true });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/');
  await p.setInputFiles('#files', [S + '/up/sales.xlsx', S + '/up/sail.xlsx']);
  await p.waitForSelector('#sec-check:not([hidden])', { timeout: 60000 });
  const t0 = Date.now();
  await p.click('#run');
  await p.waitForTimeout(20000);
  await p.screenshot({ path: `${S}/ui_progress.png`, fullPage: false });
  console.log('progress:', await p.textContent('#stage'), '|', await p.textContent('#solver'));
  await p.waitForSelector('#sec-result:not([hidden]), #sec-error:not([hidden])', { timeout: 40 * 60000 });
  console.log('finished in', (Date.now() - t0) / 1000, 's');
  if (await p.isVisible('#sec-error')) { console.log('ERROR', await p.textContent('#error-msg')); process.exit(1); }
  console.log('kpis:', (await p.textContent('#kpis')).replace(/\s+/g, ' '));
  console.log('log:', (await p.textContent('#log')).replace(/\s+/g, ' '));
  await p.screenshot({ path: `${S}/ui_result.png`, fullPage: true });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dl-xlsx')]);
  await dl.saveAs(`${S}/browser_plan.xlsx`); console.log('xlsx', dl.suggestedFilename());
  const [dj] = await Promise.all([p.waitForEvent('download'), p.click('#dl-json')]);
  await dj.saveAs(`${S}/browser_result.json`); console.log('json', dj.suggestedFilename());
  console.log('pageerrors', errs);
  await b.close();
})();
