/* 공유 저장(Supabase 표) — 여러 사람이 같은 결정 기록·조달 판단을 보게 함.
   설정: Supabase 에 표 2개(decisions, procure_state)를 만들고(docs/공유저장소_설정.sql) 공개용 키(anon/publishable)를 아래 KEY 에 넣으면 켜짐.
   키가 없으면 이 브라우저(localStorage)에만 저장. 공개용 키는 원래 웹에 넣는 키(비밀 키·service_role 키는 절대 넣지 말 것) */
(function () {
  'use strict';
  const URL0 = 'https://gatcqxrzaonjsixajrwd.supabase.co';
  const KEY = '';                                    // ← Supabase Project Settings → API Keys → Publishable key (sb_publishable_...)
  const key = () => { let k = KEY; try { k = k || localStorage.getItem('cgl-share-key') || ''; } catch (e) { /* 무시 */ } return k; };
  const H = () => ({ apikey: key(), Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json' });
  async function req(method, path, body, prefer) {
    const r = await fetch(URL0 + '/rest/v1/' + path, { method, headers: Object.assign(H(), prefer ? { Prefer: prefer } : {}), body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`공유 저장소 ${method} ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r.status === 204 ? null : r.json();
  }
  const local = (t) => { try { return JSON.parse(localStorage.getItem('cgl-share-' + t) || '[]'); } catch (e) { return []; } };
  const saveLocal = (t, v) => { try { localStorage.setItem('cgl-share-' + t, JSON.stringify(v)); } catch (e) { /* 무시 */ } };
  window.SHARE = {
    on: () => !!key(),
    setKey: (k) => { try { localStorage.setItem('cgl-share-key', String(k || '').trim()); } catch (e) { /* 무시 */ } },
    async list(table, q = 'select=*&order=at.desc&limit=500') { return this.on() ? req('GET', `${table}?${q}`) : local(table).slice().sort((a, b) => (a.at < b.at ? 1 : -1)); },
    async add(table, row) {
      row = Object.assign({ at: new Date().toISOString() }, row);
      if (this.on()) return (await req('POST', table, row, 'return=representation'))[0];
      const L = local(table); row.id = Date.now(); L.push(row); saveLocal(table, L); return row;
    },
    async update(table, id, patch) {
      if (this.on()) return req('PATCH', `${table}?id=eq.${encodeURIComponent(id)}`, patch, 'return=representation');
      const L = local(table); const x = L.find((r) => String(r.id) === String(id)); if (x) Object.assign(x, patch); saveLocal(table, L); return x;
    },
    async put(table, row) {                          // id 로 덮어쓰기(upsert)
      row = Object.assign({ at: new Date().toISOString() }, row);
      if (this.on()) return req('POST', `${table}?on_conflict=id`, row, 'resolution=merge-duplicates,return=representation');
      const L = local(table).filter((r) => r.id !== row.id); L.push(row); saveLocal(table, L); return row;
    },
    async get(table, id) { const r = this.on() ? await req('GET', `${table}?id=eq.${encodeURIComponent(id)}&select=*`) : local(table).filter((x) => x.id === id); return r && r[0]; },
  };
})();
