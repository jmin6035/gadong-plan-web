// Node에서 엔진 로드 + 입력 엑셀 읽기
const path = require('path');
const ExcelJS = require('exceljs');
for (const f of ['params', 'util', 'sail_default', 'parse', 'model', 'replan']) require(path.join(__dirname, '..', 'engine', f + '.js'));
const GP = globalThis.GP;
const DATA = process.env.GP_DATA || path.join(__dirname, '..', 'data')  // 입력 엑셀(저장소에 없음);
async function loadInputs(files = ['ctx_가동_판매자가재.xlsx', 'ctx_배선일정분석.xlsx']) {
  const wbs = [];
  for (const f of files) { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(DATA, f)); wbs.push(wb); }
  return wbs;
}
module.exports = { GP, loadInputs, ExcelJS };
