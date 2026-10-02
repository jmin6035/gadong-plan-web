"""MES 자동 다운로드(사내 PC) → mes/ 폴더 → 자동 실행기(python -m cglplan auto).
받은 기존 MES 코드(Edge 자동화)의 로그인·쿼리 화면·엑셀 Export 방식을 그대로 쓰고, 도금 가동계획에 필요한 것만 받는다.
  ① 생산 쿼리(코일 1줄: 라인·도금종류·중량·시각)   → mes/q_prod.json
  ② 휴지 쿼리(생산번호 1줄: 휴지 시작·종료·사유)    → mes/q_brk.json
  ③ 생산실적 조회 화면(도금: 부서·계약·두께·폭)      → mes/screen_prod.json
결과 표는 화면에서 직접 읽어 .json 으로 저장한다(엑셀 파일을 거치지 않으므로 회사 문서보안(DRM)이 걸리지 않음).
화면 표를 못 읽으면 기존 방식(엑셀 Export, .xlsx)으로 받는다.
실행:  py mes_download.py                 (어제까지 최근 14일)
       py mes_download.py --from 20260701 (처음 한 번: 과거 실적 채우기)
       py mes_download.py --no-auto       (내려받기만)
로그인 정보는 auto_config.json 의 "mes": {"id": "...", "pw": "...", "url": "(선택) 접속 주소"} 또는 환경변수 MES_ID / MES_PW 에서 읽는다(코드에 적지 않음)."""
import argparse
import datetime
import glob
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
MES_URL = 'https://intra-mes.poscosteeleon.com:8443/SCOM/main.do'


def q_prod(d0, d1):
    return ("select distinct a.prd_no as prd_no, a.pdt_no as pdt_no, TO_CHAR(to_date(a.prd_dt, 'YYYYMMDD'), 'YYYY-MM-DD') as prd_dt, a.line_cls as line_cls, "
            "TO_CHAR(a.wrk_sta_tm, 'YYYY-MM-DD HH24:MI:SS') as wrk_sta_tm, TO_CHAR(a.wrk_end_tm, 'YYYY-MM-DD HH24:MI:SS') as wrk_end_tm, "
            "a.wrk_time as tot_wrk_time, a.pau_time as tot_pau_time, a.opr_time as tot_opr_time, a.cot_cls as cot_cls, a.pdt_net_wgt as pdt_net_wgt, a.viw_grd as viw_grd "
            f"from sops.pf_cg_prod_rslt a where a.prd_dt between '{d0}' and '{d1}' and a.line_cls in ('A', 'B') order by line_cls, wrk_sta_tm")


def q_brk(d0, d1):
    nm = lambda c: f"(select cd_nm from scom.scom_code_detail where master_cd in ('CLR_NOPR_PAU_CD', 'CMN_NOPR_PLN_PAU_CD') and cd_val = {c})"
    cols = ["b.prd_no as prd_no", "(select max(a.line_cls) from sops.pf_cg_prod_rslt a where a.prd_no = b.prd_no) as line_cls"]
    for i in (1, 2, 3):
        cols += [f"TO_CHAR(b.pau_sta_tm_{i}, 'YYYY-MM-DD HH24:MI:SS') as pau_sta_tm_{i}", f"TO_CHAR(b.pau_end_tm_{i}, 'YYYY-MM-DD HH24:MI:SS') as pau_end_tm_{i}",
                 f"(CAST(b.pau_end_tm_{i} AS DATE) - CAST(b.pau_sta_tm_{i} AS DATE)) * 24 * 60 as pau_time_{i}"]
    for i in (1, 2, 3):
        cols += [f"b.pau_rsn_cd_{i} as pau_rsn_cd_{i}", f"{nm(f'b.pau_rsn_cd_{i}')} as pau_rsn_cd_{i}_nm"]
    cols += ["b.pau_cls as pau_cls", "b.pau_dtl_cls as pau_dtl_cls", f"{nm('b.pau_dtl_cls')} as pau_dtl_cls_nm"]
    return (f"select {', '.join(cols)} from sops.pf_cg_brk b where b.prd_no in (select a.prd_no from sops.pf_cg_prod_rslt a "
            f"where a.prd_dt between '{d0}' and '{d1}' and a.line_cls in ('A', 'B')) order by 2, 3")


# ---- 분석용 추가 자료(컬러·출하·재고) — mes/extra/ 에 저장. 도금 자동 계획은 읽지 않고, 암호화해 Claude 분석용으로만 게시 ----
CCL = "CASE a.line_cls WHEN 'X' THEN '1CCL' WHEN 'Y' THEN '2CCL' WHEN 'Z' THEN '3CCL' WHEN 'W' THEN '4CCL' ELSE a.line_cls END"


def q_color(d0, d1):
    """컬러 코일별 생산실적(사용자 MES 스크립트 query_color_detail + 라인·소재번호)"""
    return ("select TO_CHAR(TO_DATE(a.prd_dt, 'YYYYMMDD'), 'YYYY-MM-DD') as prd_dt, " + CCL + " as line, a.pdt_no, a.con_no, a.con_seq, "
            "a.raw_no, a.raw_par_no, a.raw_pur_year, a.pdt_nm, a.ord_usg_cd, a.pdt_wgt, a.pdt_len, a.raw_tre_wgt, a.sur_finish_cd, a.bak_finish_cd, "
            "a.wrk_sta_tm, a.wrk_end_tm, a.wrk_time, "
            "(select sum(pau_time) from sops.pf_cc_brk where pdt_mom_no = a.pdt_no) as pau_time, b.isd_raw_scrap_wgt, b.osd_pdt_scrap_wgt, "
            "a.pdt_wdt, a.raw_wdt, a.real_msr_thk, a.real_msr_wdt, a.line_speed, a.viw_grd, a.pdt_grd, a.re_tre_yn, a.ent_yn, "
            "SMKT.ESF_GET_DEPART_NM(c.depart_cd) as dept, SMKT.ESF_GET_EMP_NM(d.chr_man_id) as chr_man "
            "from sops.pf_cc_ccl_rslt a, sops.pf_cc_coil_use b, smkt.os_gc_ord_com c, (select con_no, con_seq, max(chr_man_id) as chr_man_id from smkt.os_gc_ord_dtl group by con_no, con_seq) d "
            "where a.pdt_no = b.pdt_no(+) and a.pnt_cnt = b.pnt_cnt(+) and a.con_no = b.con_no(+) and a.con_seq = b.con_seq(+) and a.raw_no = b.raw_no(+) and a.raw_par_no = b.raw_par_no(+) "
            f"and a.con_no = c.con_no(+) and a.con_no = d.con_no(+) and a.con_seq = d.con_seq(+) and a.prd_dt between '{d0}' and '{d1}' order by 2, 16")


def q_color_brk(d0, d1):
    """컬러 휴지 상세(열 구성을 몰라 전체 열) — 그 기간 생산 코일에 걸린 휴지"""
    return (f"select b.* from sops.pf_cc_brk b where b.pdt_mom_no in (select a.pdt_no from sops.pf_cc_ccl_rslt a where a.prd_dt between '{d0}' and '{d1}')")


def q_ship(d0, d1):
    """제품 출하 코일별(도금·컬러, 판매·자가재·기타 출고) — 판매 대비 생산 분석용"""
    return ("select TO_CHAR(TO_DATE(a.out_dt, 'YYYYMMDD'), 'YYYY-MM-DD') as out_dt, a.plt_cls, a.out_rsn_cd, a.pdt_no, a.con_no, "
            "SMKT.ESF_GET_DEPART_NM(e.depart_cd) as dept, d.pdt_net_wgt as wgt "
            "from sshp.pf_pdt_out a, sshp.pf_pdt_mast d, smkt.os_gc_ord_com e "
            f"where a.out_dt between '{d0}' and '{d1}' and a.out_rsn_cd in ('1300', '1351', '1352', '1360', '1361', '1362') "
            "and a.pdt_no = d.pdt_no and a.pdt_par_no = d.pdt_par_no and a.con_no = e.con_no(+) order by 1, 2")


def q_stock_trend(d0, d1):
    """일별 재고 추이(소재 사내·사외, 도금·컬러 제품) — 사용자 MES 스크립트 3·4·5번 합본"""
    return ("select TO_CHAR(TO_DATE(wrk_dt, 'YYYYMMDD'), 'YYYY-MM-DD') as wrk_dt, kind, sum(w1) as w1, sum(w2) as w2, sum(w3) as w3 from ("
            "select wrk_dt, '소재_' || cls as kind, NVL(in_cpy_wgt, 0) + NVL(gagong_wgt, 0) as w1, NVL(pier_wgt, 0) + NVL(cheolsong_wgt, 0) + NVL(samil_wgt, 0) + NVL(etc_wgt, 0) + NVL(sinyang_wgt, 0) + NVL(sangsin_wgt, 0) as w2, 0 as w3 "
            f"from smkt.os_gc_compr_prompt_rpt_7 where wrk_dt between '{d0}' and '{d1}' and ((cls = 'G' and cls_1 in ('1', '2', '3')) or (cls = 'C' and cls_1 not in ('4'))) "
            "union all select wrk_dt, '도금제품', NVL(wrh_wgt, 0), NVL(pyeongchi_wgt, 0), NVL(etc_wgt, 0) + NVL(cc_prs_wgt, 0) "
            f"from smkt.os_gc_compr_prompt_rpt_8 where wrk_dt between '{d0}' and '{d1}' and cls in ('1', '2', '3', '4') "
            "union all select wrk_dt, '컬러제품', NVL(wrk_wgt_1, 0) + NVL(wrk_wgt_2, 0), NVL(prs_wgt_1_a, 0) + NVL(prs_wgt_1_b, 0) + NVL(prs_wgt_1_c, 0) + NVL(prs_wgt_2, 0) + NVL(pyeongchi_wgt, 0) + NVL(shipping_yard_wgt, 0), "
            "NVL(sp_wgt, 0) + NVL(etc_wgt, 0) + NVL(sangsin_wgt, 0) + NVL(pier_wgt, 0) + NVL(sinyang_wgt, 0) + NVL(sinyang_b_wgt, 0) "
            f"from smkt.os_gc_compr_prompt_rpt_9 where wrk_dt between '{d0}' and '{d1}') group by wrk_dt, kind order by 1, 2")


def creds():
    cfg = {}
    p = os.path.join(HERE, 'auto_config.json')
    if os.path.exists(p):
        cfg = json.loads(open(p, encoding='utf-8-sig').read(), strict=False).get('mes') or {}
    uid, pw = os.environ.get('MES_ID') or cfg.get('id'), os.environ.get('MES_PW') or cfg.get('pw')
    if not uid or not pw:
        sys.exit('MES 로그인 정보가 없습니다 — auto_config.json 에 "mes": {"id": "...", "pw": "..."} 를 넣거나 환경변수 MES_ID/MES_PW 를 설정하세요')
    return uid, pw, (os.environ.get('MES_URL') or cfg.get('url') or MES_URL).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='d0', help='시작일 YYYYMMDD (기본: 14일 전)')
    ap.add_argument('--to', dest='d1', help='종료일 YYYYMMDD (기본: 어제)')
    ap.add_argument('--days', type=int, default=14)
    ap.add_argument('--no-auto', action='store_true', help='내려받기만 하고 자동 실행기는 돌리지 않음')
    ap.add_argument('--out', default=os.path.join(HERE, 'mes'))
    ap.add_argument('--no-extra', action='store_true', help='컬러·출하·재고(분석용) 내려받기 생략')
    ap.add_argument('--stock-only', action='store_true', help='제품재고·소재재고만 받기(도금 실적은 건너뜀)')
    ap.add_argument('--probe', help='메뉴 검색어를 넣고 검색 결과 화면 구조를 기록(진단용, 예: 4025)')
    ap.add_argument('--stock-manual', action='store_true', help='제품재고: 화면 이동·조회는 사람이 하고, 표 읽기만 자동')
    a = ap.parse_args()
    today = datetime.date.today()
    d1 = a.d1 or (today - datetime.timedelta(days=1)).strftime('%Y%m%d')
    d0 = a.d0 or (today - datetime.timedelta(days=a.days)).strftime('%Y%m%d')
    fmt = lambda s: f'{s[:4]}-{s[4:6]}-{s[6:]}'
    os.makedirs(a.out, exist_ok=True)
    dl = os.path.join(HERE, '_mes_dl')
    shutil.rmtree(dl, ignore_errors=True)
    os.makedirs(dl)
    uid, pw, mes_url = creds()

    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    except ImportError:
        pass
    try:
        import selenium  # noqa: F401
    except ImportError:
        sys.exit('selenium 이 설치되지 않았습니다 — install.bat 을 다시 실행하세요')
    os.environ['WDM_SSL_VERIFY'] = '0'
    from selenium import webdriver
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.edge.options import Options
    from selenium.webdriver.edge.service import Service
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    opts = Options()
    opts.add_experimental_option('prefs', {'download.default_directory': dl, 'download.prompt_for_download': False, 'download.directory_upgrade': True})
    opts.add_experimental_option('excludeSwitches', ['enable-logging'])
    opts.add_argument('--log-level=3')
    try:
        from webdriver_manager.microsoft import EdgeChromiumDriverManager
        service = Service(EdgeChromiumDriverManager().install())
    except Exception as e:                       # 드라이버 자동 설치가 막히면 PC에 설치된 msedgedriver 사용
        print('Edge 드라이버 자동 설치 실패 — 기본 드라이버로 시도:', e)
        service = Service()
    service.creation_flags = 0x08000000
    driver = webdriver.Edge(service=service, options=opts)
    driver.maximize_window()
    ok_files, extra_files = [], []
    xdir = os.path.join(a.out, 'extra')                     # 분석용 추가 자료(도금 계획은 읽지 않음)
    os.makedirs(xdir, exist_ok=True)

    def wait_download(before, name, timeout=60):
        while timeout > 0:
            new = set(os.listdir(dl)) - before
            f = next((x for x in new if not x.endswith(('.crdownload', '.tmp'))), None)
            if f:
                time.sleep(1)
                dst = os.path.join(a.out, name)
                if os.path.exists(dst):
                    os.remove(dst)
                shutil.move(os.path.join(dl, f), dst)
                print(f'  ✅ {name}')
                ok_files.append(name)
                return True
            time.sleep(1)
            timeout -= 1
        print(f'  ❌ {name} 다운로드 시간 초과')
        return False

    def export(cell_xpath, name):
        before = set(os.listdir(dl))
        for attempt in range(3):
            try:
                cell = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.XPATH, cell_xpath)))
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", cell)
                ActionChains(driver).move_to_element(cell).click().perform()
                time.sleep(0.5)
                ActionChains(driver).context_click(cell).perform()
                time.sleep(2)
                for btn in driver.find_elements(By.XPATH, "//*[contains(text(), '엑셀 Export') or contains(text(), 'Excel') or contains(text(), '엑셀')]"):
                    if btn.is_displayed():
                        driver.execute_script('arguments[0].click();', btn)
                        ok = wait_download(before, name)
                        ActionChains(driver).send_keys(Keys.ESCAPE).perform()
                        return ok
                ActionChains(driver).send_keys(Keys.ESCAPE).perform()
                time.sleep(2)
            except Exception as e:
                print(f'  ⚠ Export 시도 {attempt + 1} 실패: {e}')
        print(f'  ❌ {name}: 엑셀 Export 버튼을 찾지 못함')
        return False

    FIND_JS = r'''
      var jq = window.$ || window.jQuery; if (!jq) return null;
      var g = arguments[0] ? jq('#' + arguments[0]) : null;
      if (!g || !g.length) { g = null; jq('.jqx-grid').each(function () { if (!g && jq(this).is(':visible')) g = jq(this); }); }
      if (!g || !g.length || typeof g.jqxGrid !== 'function') return null;'''
    COUNT_JS = FIND_JS + r'''
      var rows = g.jqxGrid('getrows') || []; return rows.length;'''
    CLEAR_JS = FIND_JS + r'''
      try { g.jqxGrid('clear'); } catch (e) {} return true;'''
    GRID_JS = FIND_JS + r'''
      var cols = g.jqxGrid('columns'); cols = cols.records || cols;
      var keep = [], head = [];
      for (var i = 0; i < cols.length; i++) { var c = cols[i]; if (!c.datafield || c.hidden) continue; keep.push(c.datafield); head.push(c.text || c.datafield); }
      var rows = g.jqxGrid('getrows') || [], out = [];
      for (var r = 0; r < rows.length; r++) { var a = []; for (var k = 0; k < keep.length; k++) { var v = rows[r][keep[k]]; a.push(v === undefined ? null : (v instanceof Date ? v.toISOString() : v)); } out.push(a); }
      return JSON.stringify({columns: head, rows: out});'''

    def wait_rows(grid_id, timeout=120):
        """조회 버튼을 누른 뒤 표 건수가 0보다 크고 두 번 연속 같아질 때까지 기다림. 끝내 0이면 0"""
        last, t = -1, 0
        while t < timeout:
            time.sleep(3)
            t += 3
            try:
                n = driver.execute_script(COUNT_JS, grid_id)
            except Exception:
                n = None
            if n and n == last:
                return n
            last = n
        return last or 0

    def read(grid_id):
        txt = driver.execute_script(GRID_JS, grid_id)
        return json.loads(txt) if txt else None

    def chunks(step=10):
        """조회 기간을 step일 단위로 나눔(쿼리 화면 10,000행 제한 회피)"""
        f, t = datetime.datetime.strptime(d0, '%Y%m%d').date(), datetime.datetime.strptime(d1, '%Y%m%d').date()
        while f <= t:
            e = min(f + datetime.timedelta(days=step - 1), t)
            yield f.strftime('%Y%m%d'), e.strftime('%Y%m%d')
            f = e + datetime.timedelta(days=1)

    def save(o, name, out=None):
        out = out or a.out
        try:
            if not o or not o['rows']:
                print(f'  ⚠ {name}: 표가 비어 있음')
                return False
            for ext in ('.json', '.xlsx'):                 # 같은 이름의 이전 파일(형식이 다른 것 포함) 정리
                old = os.path.join(out, name + ext)
                if os.path.exists(old):
                    os.remove(old)
            json.dump(o, open(os.path.join(out, name + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
            print(f"  ✅ {name}.json ({len(o['rows'])}행, 화면에서 직접 읽음)")
            (ok_files if out == a.out else extra_files).append(name)
            return True
        except Exception as e:
            print(f'  ⚠ {name}: 저장 실패 ({e})')
            return False

    def run_chunks(name, grid_id, run_one, step, out=None):
        """기간을 나눠 조회한 결과를 하나로 합쳐 저장. 표 직접 읽기가 안 되면 None"""
        merged = None
        for c0, c1 in chunks(step):
            try:
                driver.execute_script(CLEAR_JS, grid_id)
            except Exception:
                pass
            run_one(c0, c1)
            n = wait_rows(grid_id)
            o = read(grid_id) if n else None
            if n and o is None:
                print('  ⚠ 화면 표 직접 읽기 실패 — 엑셀 Export 로 시도')
                return None
            k = len(o['rows']) if o else 0
            print(f'    {c0}~{c1}: {k}행' + ('  ⚠ 10,000행 — 잘렸을 수 있음(기간을 더 나눠야 함)' if k >= 10000 else ''))
            if o:
                if merged is None:
                    merged = o
                elif o['columns'] == merged['columns']:
                    merged['rows'] += o['rows']
                else:
                    print('  ⚠ 기간별 열 구성이 달라 이 구간은 제외')
        if merged:                                       # 구간 경계에 걸친 생산번호의 휴지 등 완전히 같은 행은 하나만
            seen, uniq = set(), []
            for r in merged['rows']:
                k = json.dumps(r, ensure_ascii=False)
                if k not in seen:
                    seen.add(k)
                    uniq.append(r)
            if len(uniq) < len(merged['rows']):
                print(f"    중복 {len(merged['rows']) - len(uniq)}행 제외")
            merged['rows'] = uniq
        save(merged, name, out)
        return True

    def menu_panel(diag=None):
        """좌측 메뉴 패널을 연 상태로 만들고 검색창을 돌려줌. collapseButton 은 열기/닫기 토글이라
        검색창이 이미 보이면 누르지 않고, 안 보일 때만 눌러 열림을 확인(최대 2번)"""
        driver.switch_to.default_content()
        for k in range(3):
            els = driver.find_elements(By.ID, 'SEARCH_VAL')
            if els and els[0].is_displayed():
                if diag is not None:
                    diag.append(['menu_panel', f'검색창 보임(토글 {k}번)'])
                return els[0]
            if k == 2:
                break
            try:
                driver.execute_script('arguments[0].click();', driver.find_element(By.ID, 'collapseButton'))
            except Exception as e:
                if diag is not None:
                    diag.append(['collapse', type(e).__name__])
            for _ in range(5):
                time.sleep(1)
                els = driver.find_elements(By.ID, 'SEARCH_VAL')
                if els and els[0].is_displayed():
                    break
        raise RuntimeError('좌측 메뉴 검색창이 열리지 않음')

    def menu(name, exact=False):
        driver.switch_to.default_content()
        box = menu_panel()
        box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, name, Keys.ENTER)
        time.sleep(2)
        # 이름이 정확히 같은 메뉴 우선(예: '제품재고 현황' vs '통합 제품재고 현황'), 없으면 포함하는 메뉴
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.XPATH, f"//*[contains(normalize-space(text()), '{name}')]")))
        cand = (exact and [e for e in driver.find_elements(By.XPATH, f"//*[normalize-space(text())='{name}']") if e.is_displayed()]) or \
               [e for e in driver.find_elements(By.XPATH, f"//*[contains(normalize-space(text()), '{name}')]") if e.is_displayed()]
        if not cand:
            raise RuntimeError(f'메뉴 {name} 를 찾지 못함')
        if not exact:
            driver.execute_script('arguments[0].click();', cand[0])
            time.sleep(6)
            return
        # 정확 일치 모드: 후보를 차례로 눌러 화면(iframe)이 새로 열리는 것을 찾음
        cand.sort(key=lambda e: (0 if (e.text or '').strip() == name else 1, len((e.text or '').strip()) or 999))
        n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
        for e in cand[:6]:
            for how in ('js', 'mouse'):                     # JS 클릭으로 안 열리면 실제 마우스 클릭
                try:
                    if how == 'js':
                        driver.execute_script('arguments[0].click();', e)
                    else:
                        ActionChains(driver).move_to_element(e).click().perform()
                except Exception:
                    continue
                for _ in range(5):
                    time.sleep(1)
                    if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                        time.sleep(4)
                        return
        raise RuntimeError(f"메뉴 '{name}' 를 눌러도 화면이 열리지 않음(후보 {len(cand)}개: {[ (x.tag_name, (x.text or '')[:20]) for x in cand[:4]]})")

    OPEN_JS = r"""
      var name = arguments[0], oid = arguments[1], jq = window.$ || window.jQuery, out = {cand: [], log: []};
      try {
      var norm = function (v) { return String(v || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ''); };   // 띄어쓰기 무시 비교
      name = norm(name);
      var tree = jq ? jq('#tree-left') : null, inst = null;
      try { inst = tree && tree.jstree ? tree.jstree(true) : null; } catch (e) { out.log.push('jstree 없음 ' + e); }
      if (inst && inst.get_json) {
        var flat = inst.get_json('#', {flat: true}) || [];
        out.log.push('트리 노드 ' + flat.length + '개');
        flat.forEach(function (n) {
          var a = n.a_attr || {}, t = norm(n.text);
          if ((oid && String(a.obj_id || '').indexOf(oid) !== -1) || norm(a.mnu_nm) === name || norm(a.disp_mnu_nm) === name || t === name)
            out.cand.push({id: n.id, text: t, obj_id: a.obj_id || '', mnu_id: a.mnu_id || '', src: 'jstree'});
        });
      }
      document.querySelectorAll('#tree-left a.jstree-anchor').forEach(function (a) {
        var t = norm(a.textContent), o = a.getAttribute('obj_id') || '';
        if ((oid && o.indexOf(oid) !== -1) || norm(a.getAttribute('mnu_nm')) === name || norm(a.getAttribute('disp_mnu_nm')) === name || t === name) {
          var li = a.closest('li');
          if (!out.cand.some(function (c) { return c.id === (li && li.id); })) out.cand.push({id: li ? li.id : '', text: t, obj_id: o, mnu_id: a.getAttribute('mnu_id') || '', src: 'dom'});
        }
      });
      } catch (err) { out.log.push('JS 오류: ' + err); }
      return JSON.stringify(out);"""

    DOC_JS = r"""
      var norm = function (v) { return String(v || '').replace(/\s+/g, ''); }, name = norm(arguments[0]), out = [];
      var excl = (arguments[1] || []).map(norm), hit = function (t) { return t.indexOf(name) !== -1 && !excl.some(function (x) { return x && t.indexOf(x) !== -1; }); };
      document.querySelectorAll('[data-cgl-cand]').forEach(function (e) { e.removeAttribute('data-cgl-cand'); });
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var e = all[i], tg = e.tagName;
        if (e.id === 'SEARCH_VAL' || tg === 'SCRIPT' || tg === 'STYLE' || tg === 'OPTION' || tg === 'TITLE') continue;
        if (!hit(norm(e.textContent))) continue;
        var leaf = true;
        for (var j = 0; j < e.children.length; j++) if (hit(norm(e.children[j].textContent))) { leaf = false; break; }
        if (!leaf) continue;
        var vis = !!(e.offsetParent || e.getClientRects().length);
        e.setAttribute('data-cgl-cand', String(out.length));
        out.push({k: out.length, tag: tg, id: e.id, cls: String(e.className).slice(0, 60), vis: vis,
                  parent: (e.parentElement ? e.parentElement.outerHTML : '').slice(0, 500)});
      }
      return JSON.stringify(out);"""

    EXACT_JS = r"""
      var want = arguments[0], out = [];
      var clean = function (v) { return String(v || '').replace(/\s+/g, ' ').trim().replace(/^[^가-힣A-Za-z0-9\[]+/, '').trim(); };
      document.querySelectorAll('[data-cgl-step]').forEach(function (e) { e.removeAttribute('data-cgl-step'); });
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var e = all[i], tg = e.tagName;
        if (e.id === 'SEARCH_VAL' || tg === 'SCRIPT' || tg === 'STYLE' || tg === 'OPTION' || tg === 'TITLE' || tg === 'INPUT') continue;
        if (clean(e.textContent) !== want) continue;                      // 띄어쓰기까지 정확히 같은 글자만
        var leaf = true;
        for (var j = 0; j < e.children.length; j++) if (clean(e.children[j].textContent) === want) { leaf = false; break; }
        if (!leaf) continue;
        var vis = !!(e.offsetParent || e.getClientRects().length);
        e.setAttribute('data-cgl-step', String(out.length));
        out.push({k: out.length, tag: tg, id: e.id, cls: String(e.className).slice(0, 60), vis: vis, parent: (e.parentElement ? e.parentElement.outerHTML : '').slice(0, 400)});
      }
      return JSON.stringify(out);"""

    def open_by_path(path, diag, search=None):
        """좌측 메뉴를 사람이 누르듯 단계별로(예: 출하관리 → 제품재고 → 제품재고 현황). 글자는 띄어쓰기까지 정확히 일치.
        마지막 단계에서 화면(iframe)이 열리면 성공"""
        box = menu_panel(diag)
        if search:
            box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, search, Keys.ENTER)
            time.sleep(3)
        n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
        for depth, step in enumerate(path):
            last = depth == len(path) - 1
            got = []
            for _ in range(5):
                got = json.loads(driver.execute_script(EXACT_JS, step))
                if any(g['vis'] for g in got):
                    break
                time.sleep(1)
            diag.append([f'path {step}', json.dumps(got, ensure_ascii=False)[:1500]])
            vis = sorted([g for g in got if g['vis']], key=lambda g: g['k'])
            if not vis:
                raise RuntimeError(f"메뉴 단계 '{step}' 가 화면에 안 보임(같은 글자 {len(got)}개)")
            el = driver.find_element(By.CSS_SELECTOR, f'[data-cgl-step="{vis[0]["k"]}"]')
            if last:
                if click_until_frame(el, diag, f'path {step}', n0):
                    return
                raise RuntimeError(f"'{step}' 를 눌러도 화면이 안 열림")
            # 중간 단계: 펼치기(이미 펼쳐져 있으면 다음 단계 글자가 이미 보임 → 누르지 않음)
            nxt = json.loads(driver.execute_script(EXACT_JS, path[depth + 1]))
            if any(g['vis'] for g in nxt):
                diag.append([f'path {step}', '다음 단계가 이미 보여 누르지 않음'])
                continue
            try:
                driver.execute_script('arguments[0].click();', el)
            except Exception:
                ActionChains(driver).move_to_element(el).click().perform()
            time.sleep(2)

    def click_until_frame(el, diag, label, n0):
        """요소를 JS 클릭 → 안 열리면 마우스 클릭 → 더블클릭. 화면(iframe)이 늘면 True"""
        for how in ('js', 'mouse', 'dbl'):
            try:
                if how == 'js':
                    driver.execute_script('arguments[0].click();', el)
                elif how == 'mouse':
                    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
                    ActionChains(driver).move_to_element(el).click().perform()
                else:
                    ActionChains(driver).move_to_element(el).double_click().perform()
            except Exception as e:
                diag.append([f'{label} {how}', 'error ' + (str(e).splitlines()[0][:120] if str(e) else type(e).__name__)])
                continue
            for _ in range(6):
                time.sleep(1)
                if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                    diag.append([f'{label} {how}', '성공'])
                    time.sleep(4)
                    return True
            diag.append([f'{label} {how}', '화면 안 열림'])
        return False

    def open_menu(name, oid, diag):
        """좌측 메뉴(jsTree)에서 이름(mnu_nm) 또는 화면ID(obj_id)가 맞는 메뉴를 찾아 화면이 열릴 때까지 여러 방법으로 열기"""
        driver.switch_to.default_content()
        diag.append(['start', f"url={driver.current_url[:80]} iframes={len(driver.find_elements(By.TAG_NAME, 'iframe'))}"])
        box = menu_panel(diag)
        n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
        found = None
        # 사용자가 하는 방식 그대로: 검색창에 '제품재고현황' 입력 후 Enter → 안 되면 찾기 버튼·띄어쓰기·화면ID 순
        nospace = name.replace(' ', '')
        for query, how in (('4025', 'enter'), ('4025', 'find'), (nospace, 'enter'), (nospace, 'find'), (name, 'enter'), (name, 'find'), (oid, 'find')):
            try:
                box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, query)
            except Exception as e:                          # 입력이 막히면 JS로 값 넣기
                diag.append(['type', type(e).__name__])
                driver.execute_script("var b=document.getElementById('SEARCH_VAL'); b.value=arguments[0]; b.dispatchEvent(new Event('input')); b.dispatchEvent(new Event('change'));", query)
            if how == 'find':
                try:
                    driver.execute_script('arguments[0].click();', driver.find_element(By.ID, 'FIND_BTN'))
                except Exception as e:
                    diag.append(['find_btn', str(e)[:150]])
            else:
                box.send_keys(Keys.ENTER)
            time.sleep(3)
            try:
                info = json.loads(driver.execute_script(OPEN_JS, name, oid))
            except Exception as e:
                diag.append([f'search {query}/{how}', 'execute 오류 ' + (str(e).splitlines()[0][:200] if str(e) else type(e).__name__)])
                continue
            diag.append([f'search {query}/{how}', json.dumps(info, ensure_ascii=False)[:1500]])
            if info['cand']:
                found = info['cand']
                break
            # 트리 밖(검색 결과 목록 등)에 이름이 정확히 같은 요소 — 다른 메뉴들이 열리던 방식
            try:
                docs = json.loads(driver.execute_script(DOC_JS, name, ['통합']))
            except Exception as e:
                docs = []
                diag.append([f'doc {query}/{how}', 'error ' + str(e)[:150]])
            diag.append([f'doc {query}/{how}', json.dumps(docs, ensure_ascii=False)[:2500]])
            for d in sorted(docs, key=lambda d: (not d['vis'], d['k']))[:4]:
                try:
                    el = driver.find_element(By.CSS_SELECTOR, f'[data-cgl-cand="{d["k"]}"]')
                except Exception:
                    continue
                if click_until_frame(el, diag, f"doc {d['tag']}#{d['k']}", n0):
                    print(f"    메뉴 열림: 검색 결과 {d['tag']} '{name}'")
                    return
        if not found:
            raise RuntimeError(f"메뉴 '{name}'({oid}) 를 트리에서 찾지 못함")
        # 화면ID가 맞는 것 우선
        found.sort(key=lambda c: 0 if oid and oid in (c.get('obj_id') or '') else 1)
        print(f"    메뉴 후보: {[(c['text'], c['obj_id']) for c in found[:3]]}")
        for c in found[:3]:
            nid = c['id']
            steps = [
                ('jstree select', "var i=jQuery('#tree-left').jstree(true); if(i._open_to) i._open_to(arguments[0]); i.deselect_all(); i.select_node(arguments[0]); return 1;"),
                ('jquery click', "var a=jQuery('#tree-left li[id=\"'+arguments[0]+'\"] > a.jstree-anchor'); a[0].scrollIntoView({block:'center'}); a.trigger('click'); return a.length;"),
                ('dblclick', "var a=jQuery('#tree-left li[id=\"'+arguments[0]+'\"] > a.jstree-anchor'); a.trigger('dblclick'); return a.length;"),
            ]
            for label, js in steps:
                try:
                    r = driver.execute_script(js, nid)
                except Exception as e:
                    diag.append([f'open {nid} {label}', 'error ' + str(e)[:150]])
                    continue
                for _ in range(6):
                    time.sleep(1)
                    if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                        diag.append([f'open {nid} {label}', f'성공 (반환 {r})'])
                        time.sleep(4)
                        return
                diag.append([f'open {nid} {label}', f'화면 안 열림 (반환 {r})'])
            try:                                            # 마지막: 실제 마우스 클릭
                a_el = driver.find_element(By.CSS_SELECTOR, f'#tree-left li[id="{nid}"] > a.jstree-anchor')
                driver.execute_script("arguments[0].scrollIntoView({block:'center'});", a_el)
                ActionChains(driver).move_to_element(a_el).click().perform()
                for _ in range(6):
                    time.sleep(1)
                    if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                        diag.append([f'open {nid} mouse', '성공'])
                        time.sleep(4)
                        return
                diag.append([f'open {nid} mouse', '화면 안 열림'])
            except Exception as e:
                diag.append([f'open {nid} mouse', 'error ' + str(e)[:150]])
        raise RuntimeError(f"메뉴 '{name}' 후보 {len(found)}개를 눌러도 화면이 안 열림")

    def save_diag(diag):
        json.dump({'columns': ['step', 'value'], 'rows': diag}, open(os.path.join(xdir, 'snap_probe.json'), 'w', encoding='utf-8'), ensure_ascii=False)

    def open_by_id(query, keyword):
        """메뉴 검색창에 query 입력 → 결과 중 문서 순서상 첫 번째(keyword 포함) 메뉴를 눌러 화면이 열리는지 확인"""
        driver.switch_to.default_content()
        box = menu_panel()
        box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, query, Keys.ENTER)
        time.sleep(3)
        cand = []
        for _ in range(5):                                  # 결과 목록이 늦게 뜨는 경우 대비
            # 글자가 여러 태그로 쪼개져 있어도 찾도록, 그 글자를 품은 가장 안쪽 요소
            xp = (f"//*[(contains(normalize-space(.), '{keyword}') or contains(normalize-space(.), '{query}')) and "
                  f"not(*[contains(normalize-space(.), '{keyword}') or contains(normalize-space(.), '{query}')])]")
            cand = [e for e in driver.find_elements(By.XPATH, xp)
                    if e.is_displayed() and e.get_attribute('id') != 'SEARCH_VAL' and e.tag_name.lower() not in ('script', 'style', 'title', 'option')]
            if cand:
                break
            time.sleep(1)
        if not cand:
            raise RuntimeError(f"'{query}' 검색 결과를 찾지 못함")
        print(f"    검색 결과: {[(x.tag_name, (x.text or '').strip()[:25]) for x in cand[:4]]}")
        n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
        for e in cand[:4]:
            for how in ('js', 'mouse'):
                try:
                    if how == 'js':
                        driver.execute_script('arguments[0].click();', e)
                    else:
                        ActionChains(driver).move_to_element(e).click().perform()
                except Exception:
                    continue
                for _ in range(5):
                    time.sleep(1)
                    if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                        time.sleep(4)
                        return
        raise RuntimeError(f"'{query}' 검색 결과를 눌러도 화면이 열리지 않음")

    PROBE_JS = r"""
      var q = arguments[0], kw = arguments[1], out = [];
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var e = all[i], t = (e.textContent || '');
        if (t.indexOf(q) === -1 && t.indexOf(kw) === -1) continue;
        var leaf = true;
        for (var j = 0; j < e.children.length; j++) { var c = e.children[j].textContent || ''; if (c.indexOf(q) !== -1 || c.indexOf(kw) !== -1) { leaf = false; break; } }
        if (!leaf) continue;
        var r = e.getBoundingClientRect();
        out.push({tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 80), text: t.trim().slice(0, 60),
                  vis: !!(e.offsetParent || r.width), x: Math.round(r.left), y: Math.round(r.top),
                  onclick: (e.getAttribute('onclick') || (e.parentElement && e.parentElement.getAttribute('onclick')) || '').slice(0, 200),
                  html: (e.parentElement && e.parentElement.parentElement ? e.parentElement.parentElement.outerHTML : e.outerHTML).slice(0, 900)});
      }
      var sv = document.getElementById('SEARCH_VAL'), box = sv;
      for (var k = 0; k < 4 && box && box.parentElement; k++) box = box.parentElement;
      return JSON.stringify({items: out.slice(0, 40), searchArea: box ? box.outerHTML.slice(0, 6000) : null,
                             iframes: Array.prototype.map.call(document.querySelectorAll('iframe'), function (f) { return f.src || f.name || f.id; })});"""

    def probe(query, kw='제품재고'):
        """진단: 메뉴 검색 후 화면 구조·클릭 결과를 mes/extra/snap_probe.json 에 기록(자동 실행기가 암호화해 올림)"""
        rows = []
        driver.switch_to.default_content()
        try:
            driver.execute_script('arguments[0].click();', WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.XPATH, '//*[@id="collapseButton"]'))))
            time.sleep(1)
        except Exception as e:
            rows.append(['collapse', str(e)[:200]])
        box = WebDriverWait(driver, 10).until(EC.visibility_of_element_located((By.XPATH, '//*[@id="SEARCH_VAL"]')))
        box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, query)
        time.sleep(3)
        rows.append(['before_enter', driver.execute_script(PROBE_JS, query, kw)])
        box.send_keys(Keys.ENTER)
        time.sleep(4)
        info = driver.execute_script(PROBE_JS, query, kw)
        rows.append(['after_enter', info])
        try:
            driver.save_screenshot(os.path.join(xdir, 'probe.png'))
        except Exception:
            pass
        items = json.loads(info)['items']
        print(f'  검색 후 "{query}"/"{kw}" 포함 요소 {len(items)}개:')
        for it in items[:10]:
            print(f"    {it['tag']} id={it['id']} vis={it['vis']} ({it['x']},{it['y']}) {it['text'][:40]}")
        # 보이는 후보를 하나씩 눌러 화면이 열리는지 기록
        els = [e for e in driver.find_elements(By.XPATH, f"//*[contains(normalize-space(.), '{kw}') and not(*[contains(normalize-space(.), '{kw}')])]") if e.is_displayed()]
        for idx, e in enumerate(els[:4]):
            try:
                n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
                txt = (e.text or '').strip()[:40]
                ActionChains(driver).move_to_element(e).click().perform()
                time.sleep(6)
                fr = driver.find_elements(By.TAG_NAME, 'iframe')
                res = f"클릭 {idx + 1} [{txt}] → iframe {n0}→{len(fr)}"
                if len(fr) > n0:
                    driver.switch_to.frame(fr[-1])
                    res += ' | 화면 글자: ' + (driver.find_element(By.TAG_NAME, 'body').text or '')[:200].replace('\n', ' ')
                    driver.switch_to.default_content()
                print('   ', res)
                rows.append([f'click_{idx + 1}', res])
                if len(fr) > n0:
                    break
            except Exception as ex:
                rows.append([f'click_{idx + 1}', 'error ' + str(ex)[:200]])
                print(f'    클릭 {idx + 1} 오류: {str(ex)[:120]}')
                driver.switch_to.default_content()
        json.dump({'columns': ['step', 'value'], 'rows': rows}, open(os.path.join(xdir, 'snap_probe.json'), 'w', encoding='utf-8'), ensure_ascii=False)
        print('  진단 기록 저장: mes/extra/snap_probe.json, probe.png')

    def frame_with(xpath, visible=False):
        for fr in reversed(driver.find_elements(By.TAG_NAME, 'iframe')):
            try:
                driver.switch_to.default_content()
                driver.switch_to.frame(fr)
                cond = EC.visibility_of_element_located if visible else EC.presence_of_element_located
                return WebDriverWait(driver, 3).until(cond((By.XPATH, xpath)))
            except Exception:
                pass
        return None

    try:
        driver.get(mes_url)
        print('로그인…')
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.XPATH, '//*[@id="username"]'))).send_keys(uid)
        driver.find_element(By.XPATH, '//*[@id="password_input"]').send_keys(pw)
        driver.find_element(By.XPATH, '//*[@id="loginsubmit"]').click()
        time.sleep(8)
        if a.stock_manual:                                  # 사람이 화면을 열고 조회 → 엔터 → 표를 읽어 저장
            for plant, name in (('도금', 'snap_stock_g'), ('컬러', 'snap_stock_c')):
                input(f"\n[{plant}] 열린 Edge 창에서 '제품재고 현황'을 열고, 공장구분={plant}, 입고일자 2000-01-01 ~ 오늘로 조회한 뒤 여기서 Enter ")
                o = None
                for fr in [None] + list(reversed(driver.find_elements(By.TAG_NAME, 'iframe'))):
                    try:
                        driver.switch_to.default_content()
                        if fr is not None:
                            driver.switch_to.frame(fr)
                        o = read(None)
                        if o and o['rows']:
                            break
                    except Exception:
                        o = None
                driver.switch_to.default_content()
                k = len(o['rows']) if o else 0
                print(f"  {plant}: {k}행" + ('  ⚠ 10,000행 — 잘렸을 수 있음(입고일자를 나눠 두 번 조회 필요)' if k >= 10000 else ''))
                save(o, name, xdir)
            a.stock_only = a.no_extra = True
        if a.probe:                                         # 진단만 하고 나머지 내려받기는 건너뜀
            diag = []
            try:
                open_menu('제품재고 현황', 'SSHPC4025', diag)
                print('  ✅ 제품재고 현황 화면 열림')
            except Exception as e:
                print(f'  ⚠ {e}')
            save_diag(diag)
            for st_, v in diag:
                print('   ', st_, '|', str(v)[:160])
            a.stock_only = a.no_extra = True
        if not a.stock_only:
            # ①② 쿼리 화면
            print(f'쿼리 화면 — 기간 {d0} ~ {d1}')
            menu('쿼리')
            box = frame_with('//*[@id="QUERY_CONTTextArea"]')
            if box is None:
                raise RuntimeError('쿼리 입력창을 찾지 못함')
            def run_sql(sql):
                box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE)
                time.sleep(0.5)
                box.send_keys(sql)
                driver.execute_script('arguments[0].click();', driver.find_element(By.XPATH, '//*[@id="mnuCust1Btn"]/span'))
            # 생산은 10일씩(하루 최대 ~540코일 → 10일 ≤ 5,400행), 휴지는 행이 적어 15일씩
            for name, mk, step in [('q_prod.xlsx', q_prod, 10), ('q_brk.xlsx', q_brk, 15)]:
                print(f'▶ {name}')
                if run_chunks(name[:-5], 'gridQueryRslt', lambda c0, c1: run_sql(mk(c0, c1)), step) is None:
                    run_sql(mk(d0, d1))
                    time.sleep(15)
                    export('//*[@id="row0gridQueryRslt"]/div[1]', name)
            # ④ 분석용 추가 자료(컬러 생산·휴지, 출하, 재고 추이) — 실패해도 도금 자동 실행에는 영향 없음
            if not a.no_extra:
                for name, mk, step in [('color_prod', q_color, 7), ('color_brk', q_color_brk, 7), ('ship', q_ship, 7), ('stock_trend', q_stock_trend, 100)]:
                    print(f'▶ {name} (분석용)')
                    try:
                        if run_chunks(name, 'gridQueryRslt', lambda c0, c1: run_sql(mk(c0, c1)), step, xdir) is None:
                            print(f'  ⚠ {name}: 표 직접 읽기 실패 — 건너뜀')
                    except Exception as e:
                        print(f'  ⚠ {name}: 실패 — 건너뜀 ({str(e).splitlines()[0][:120]})')
            # ③ 생산실적 조회(도금) 화면
            print('▶ screen_prod.xlsx (생산실적 조회)')
            menu('생산실적 조회')
            if frame_with('//*[@id="dropdownlistContentS_PLT_CLS"]') is None:
                raise RuntimeError('생산실적 조회 화면을 찾지 못함')
            driver.execute_script("try { var jq = window.$ || window.jQuery; var dd = jq('#S_PLT_CLS'); var it = dd.jqxDropDownList('getItems'); "
                                  "for (var i = 0; i < it.length; i++) { if (it[i].label.indexOf('도금') !== -1) { dd.jqxDropDownList('selectIndex', it[i].index); break; } } } catch (e) {}")
            time.sleep(1)
            SET_DATE_JS = r'''
              var jq = window.$ || window.jQuery, s = arguments[1], out = [];
              ['S_PRD_DT_FR', 'S_PRD_DT_TO'].forEach(function (id, i) {
                var v = s[i], d = new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8));
                try { jq('#' + id).jqxDateTimeInput('setDate', d); out.push(jq('#' + id).jqxDateTimeInput('getText')); } catch (e) { out.push(null); }
              });
              return out;'''

            def run_screen(c0, c1):
                got = driver.execute_script(SET_DATE_JS, None, [c0, c1])
                if not got or None in got:                   # 날짜 위젯 함수가 없으면 키보드 입력
                    for xp, v in (('//*[@id="inputS_PRD_DT_FR"]', c0), ('//*[@id="inputS_PRD_DT_TO"]', c1)):
                        el = driver.find_element(By.XPATH, xp)
                        el.click()
                        el.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, fmt(v), Keys.TAB)
                    got = [driver.find_element(By.XPATH, '//*[@id="inputS_PRD_DT_FR"]').get_attribute('value'),
                           driver.find_element(By.XPATH, '//*[@id="inputS_PRD_DT_TO"]').get_attribute('value')]
                want = [fmt(c0), fmt(c1)]
                if [str(x or '').replace('/', '-').replace('.', '-')[:10] for x in got] != want:
                    print(f'    ⚠ 화면 날짜가 {got} 로 들어감(원한 값 {want})')
                driver.execute_script('arguments[0].click();', WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.XPATH, '//*[@id="mnuSearchBtn"]/span'))))
            if run_chunks('screen_prod', None, run_screen, 10) is None:
                export("//div[contains(@class, 'jqx-grid-cell')]", 'screen_prod.xlsx')
        # ⑤ 제품재고현황(도금·컬러, 현재 시점 스냅샷) — 입고일자를 구간으로 나눠 전부 읽음(표 행수 제한 대비)
        if not a.no_extra:
            STOCK_JS = r'''
              var jq = window.$ || window.jQuery, plant = arguments[0], d0 = arguments[1], d1 = arguments[2], out = {plant: null, dates: []};
              var mk = function (v) { return new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)); };
              jq('.jqx-dropdownlist, [role=combobox]').each(function () {
                if (out.plant) return; var dd = jq(this);
                try { var it = dd.jqxDropDownList('getItems') || [];
                  for (var i = 0; i < it.length; i++) if (String(it[i].label).indexOf(plant) !== -1) { dd.jqxDropDownList('selectIndex', it[i].index); out.plant = it[i].label; break; } } catch (e) {}
              });
              var ds = jq('.jqx-datetimeinput').filter(function () { return jq(this).is(':visible'); });
              ds.each(function (i) { if (i > 1) return; try { jq(this).jqxDateTimeInput('setDate', mk(i === 0 ? d0 : d1)); out.dates.push(jq(this).jqxDateTimeInput('getText')); } catch (e) { out.dates.push(null); } });
              return out;'''
            ranges = [('20000101', '20231231')]
            f = datetime.date(2024, 1, 1)
            while f <= today:
                e = min(f + datetime.timedelta(days=89), today)
                ranges.append((f.strftime('%Y%m%d'), e.strftime('%Y%m%d')))
                f = e + datetime.timedelta(days=1)
            stock_diag = []
            for plant, name in (('도금', 'snap_stock_g'), ('컬러', 'snap_stock_c')):
                print(f'▶ {name} (제품재고현황 {plant}, 분석용)')
                try:
                    diag = stock_diag
                    already = frame_with("//*[contains(normalize-space(text()), '입고일자')]") is not None   # 도금 때 연 화면이면 그대로 사용
                    driver.switch_to.default_content()
                    try:
                        if already:
                            raise StopIteration
                        # '제품재고현황'(붙여 씀)과 '제품재고 현황'(띄어 씀)은 다른 메뉴 — 출하관리 → 제품재고 → 제품재고 현황(띄어 씀)
                        try:
                            open_by_path(['출하관리', '제품재고', '제품재고 현황'], diag, search='제품재고 현황')
                        except Exception as e1:
                            diag.append(['path 검색후 실패', str(e1)[:200]])
                            open_by_path(['출하관리', '제품재고', '제품재고 현황'], diag)
                        print("    메뉴 열림: 출하관리 → 제품재고 → 제품재고 현황")
                    except StopIteration:
                        print('    이미 열린 제품재고 현황 화면 사용')
                    finally:
                        save_diag(diag)                             # 성공·실패 과정 기록(Claude 확인용)
                    if frame_with("//*[contains(normalize-space(text()), '입고일자')]") is None:
                        raise RuntimeError(f"화면을 찾지 못함(열린 iframe {len(driver.find_elements(By.TAG_NAME, 'iframe'))}개)")
                    merged = None
                    for r0, r1 in ranges:
                        try:
                            driver.execute_script(CLEAR_JS, None)
                        except Exception:
                            pass
                        got = driver.execute_script(STOCK_JS, plant, r0, r1)
                        if not got or not got.get('plant') or len(got.get('dates') or []) < 2 or None in got['dates']:
                            raise RuntimeError(f'공장구분·입고일자 칸을 찾지 못함 ({got})')
                        btn = driver.find_elements(By.XPATH, '//*[@id="mnuSearchBtn"]') or \
                              [e for e in driver.find_elements(By.XPATH, "//*[self::button or self::a or self::span or self::div][normalize-space(.)='조회']") if e.is_displayed()]
                        if not btn:
                            raise RuntimeError('조회 버튼을 찾지 못함')
                        driver.execute_script('arguments[0].click();', btn[0])
                        n = wait_rows(None, 120)
                        o = read(None) if n else None
                        k = len(o['rows']) if o else 0
                        print(f"    [{got['plant']}] {got['dates'][0]}~{got['dates'][1]}: {k}행" + ('  ⚠ 10,000행 — 잘렸을 수 있음' if k >= 10000 else ''))
                        if o:
                            if merged is None:
                                merged = o
                            elif o['columns'] == merged['columns']:
                                merged['rows'] += o['rows']
                    save(merged, name, xdir)
                except Exception as e:
                    print(f'  ⚠ 제품재고현황({plant}): 실패 — 건너뜀 ({str(e).splitlines()[0][:160]})')
        # ⑥ 컬러 소재 재고 목록(현재 시점 스냅샷, 분석용)
        if not a.no_extra:
            print('▶ snap_mat_stock_cc (소재재고List(CC), 분석용)')
            try:
                menu('소재재고List(CC)')
                if frame_with('//*[@id="mnuSearchBtn"]/span', visible=True) is None:
                    raise RuntimeError('화면을 찾지 못함')
                try:
                    driver.execute_script(CLEAR_JS, None)
                except Exception:
                    pass
                driver.execute_script('arguments[0].click();', WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.XPATH, '//*[@id="mnuSearchBtn"]/span'))))
                n = wait_rows(None, 180)
                save(read(None) if n else None, 'snap_mat_stock_cc', xdir)
            except Exception as e:
                print(f'  ⚠ 소재재고List(CC): 실패 — 건너뜀 ({str(e).splitlines()[0][:120]})')
    finally:
        driver.quit()
        shutil.rmtree(dl, ignore_errors=True)
    print('받은 파일:', ok_files, '/ 분석용:', extra_files)
    if len(ok_files) < 3 and not a.stock_only and not a.probe and not a.stock_manual:
        print('⚠ 일부 파일을 받지 못했습니다 — 자동 실행기는 받은 파일로만 돕니다(누적 저장소에 이전 자료가 있으면 그대로 유지)')
    if not a.no_auto and (ok_files or extra_files or a.probe):
        sys.exit(subprocess.call([sys.executable, '-m', 'cglplan', 'auto', '--config', os.path.join(HERE, 'auto_config.json')], cwd=HERE))


if __name__ == '__main__':
    main()
