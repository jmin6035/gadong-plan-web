// 브라우저에서 페이지 열고 파일 업로드 → 입력 확인까지. 스크린샷 저장
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const S = process.env.GP_OUT;
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await p.goto('http://localhost:8765/');
    await p.setInputFiles('#files', [S + '/up/sales.xlsx', S + '/up/sail.xlsx']);
    await p.waitForSelector('#sec-check:not([hidden])', { timeout: 60000 });
    console.log(name, 'summary:', (await p.textContent('#check-summary')).trim());
    console.log(name, 'run enabled:', !(await p.isDisabled('#run')), 'errors:', errs);
    await p.screenshot({ path: `${S}/ui_${name}.png`, fullPage: true });
    await p.close();
  }
  await b.close();
})();
