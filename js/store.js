// 저장: 기기 안(localStorage·IndexedDB)에 항상 두고, 접근 키가 있으면 비공개 저장소와 맞춘다.
import { DEFAULT_SETTINGS } from './defaults.js';

const LS_DB = 'closet.db.v1', LS_CONN = 'closet.conn.v1', LS_UP = 'closet.pendingUp.v1', LS_DEL = 'closet.pendingDel.v1';
const KINDS = ['items', 'looks', 'candidates'];
export const DEFAULT_CONN = { owner: 'zionfaith-k', repo: 'closet-data', token: '' };

const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
function mergeDeep(base, over) {
  if (!isObj(over)) return base;
  for (const k of Object.keys(over)) {
    if (isObj(over[k]) && isObj(base[k])) mergeDeep(base[k], over[k]);
    else if (over[k] !== undefined) base[k] = over[k];
  }
  return base;
}
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 공간 없음 */ } };

const b64encode = (str) => { const bytes = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const blobToB64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });

// ---------- IndexedDB (사진) ----------
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise((res, rej) => {
    const rq = indexedDB.open('closet-photos', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('photos');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return idbP;
}
async function idbOp(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction('photos', mode); const rq = fn(tx.objectStore('photos')); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
}

function mergeLists(a, b) {
  const map = new Map();
  for (const r of [...(a || []), ...(b || [])]) {
    const cur = map.get(r.id);
    if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) map.set(r.id, r);
  }
  return [...map.values()].sort((x, y) => (x.id < y.id ? -1 : 1));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const store = {
  db: { items: [], looks: [], candidates: [], settings: clone(DEFAULT_SETTINGS) },
  conn: { ...DEFAULT_CONN },
  status: 'local', // local | syncing | synced | error
  statusText: '',
  onChange: () => {},
  onStatus: () => {},
  _timer: null, _busy: false, _again: false, _urls: new Map(),

  init() {
    const saved = lsGet(LS_DB, null);
    if (saved) {
      for (const k of KINDS) this.db[k] = saved[k] || [];
      this.db.settings = mergeDeep(clone(DEFAULT_SETTINGS), saved.settings || {});
    }
    this.conn = { ...DEFAULT_CONN, ...lsGet(LS_CONN, {}) };
    if (this.connected) this.sync();
  },
  get connected() { return !!(this.conn.token && this.conn.owner && this.conn.repo); },
  get S() { return this.db.settings; },
  list(kind) { return this.db[kind].filter((r) => !r.deleted); },
  get(kind, id) { return this.db[kind].find((r) => r.id === id && !r.deleted); },
  newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  persist() { lsSet(LS_DB, this.db); this.onChange(); this.schedule(); },
  upsert(kind, rec) {
    rec.updatedAt = Date.now();
    if (!rec.id) rec.id = this.newId();
    const i = this.db[kind].findIndex((r) => r.id === rec.id);
    if (i >= 0) this.db[kind][i] = rec; else this.db[kind].push(rec);
    this.persist();
    return rec;
  },
  remove(kind, id) {
    const i = this.db[kind].findIndex((r) => r.id === id);
    if (i >= 0) { this.db[kind][i] = { id, deleted: true, updatedAt: Date.now() }; this.persist(); }
  },
  saveSettings() { this.db.settings.updatedAt = Date.now(); this.persist(); },
  resetSettings() { const body = this.db.settings.body; this.db.settings = clone(DEFAULT_SETTINGS); this.db.settings.body = body; this.saveSettings(); },
  setConn(c) { this.conn = { ...this.conn, ...c }; lsSet(LS_CONN, this.conn); },

  exportAll() { return JSON.stringify(this.db, null, 2); },
  importAll(text) {
    const d = JSON.parse(text);
    for (const k of KINDS) this.db[k] = mergeLists(this.db[k], (d[k] || []).map((r) => ({ ...r })));
    if (d.settings) { this.db.settings = mergeDeep(clone(DEFAULT_SETTINGS), d.settings); this.db.settings.updatedAt = Date.now(); }
    this.persist();
  },

  // ---------- 사진 ----------
  async putPhoto(key, blob) {
    await idbOp('readwrite', (s) => s.put(blob, key));
    lsSet(LS_UP, [...new Set([...lsGet(LS_UP, []), key])]);
    this.schedule();
  },
  async photoURL(key) {
    if (this._urls.has(key)) return this._urls.get(key);
    let blob = await idbOp('readonly', (s) => s.get(key)).catch(() => null);
    if (!blob && this.connected) {
      const r = await this.gh(`contents/photos/${key}.jpg`, { headers: { Accept: 'application/vnd.github.raw+json' } }).catch(() => null);
      if (r && r.ok) { blob = await r.blob(); idbOp('readwrite', (s) => s.put(blob, key)).catch(() => {}); }
    }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this._urls.set(key, url);
    return url;
  },
  async dropPhoto(key) {
    await idbOp('readwrite', (s) => s.delete(key)).catch(() => {});
    this._urls.delete(key);
    lsSet(LS_UP, lsGet(LS_UP, []).filter((k) => k !== key));
    lsSet(LS_DEL, [...new Set([...lsGet(LS_DEL, []), key])]);
    this.schedule();
  },

  // ---------- GitHub ----------
  gh(path, opt = {}) {
    const { owner, repo, token } = this.conn;
    return fetch(`https://api.github.com/repos/${owner}/${repo}${path ? '/' + path : ''}`, {
      cache: 'no-store', ...opt,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.headers || {}) },
    });
  },
  async readJson(name) {
    const r = await this.gh(`contents/data/${name}.json`);
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new Error(`읽기 실패 (${r.status})`);
    const j = await r.json();
    let content = j.content;
    if (!content) { const b = await this.gh(`git/blobs/${j.sha}`); content = (await b.json()).content; }
    return { data: JSON.parse(b64decode(content)), sha: j.sha };
  },
  async writeJson(name, data, sha) {
    const body = { message: `update ${name}`, content: b64encode(JSON.stringify(data, null, 1)) };
    if (sha) body.sha = sha;
    const r = await this.gh(`contents/data/${name}.json`, { method: 'PUT', body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) return false; // 다른 기기가 먼저 고침 → 다시 읽어 합친다
    if (!r.ok) throw new Error(`쓰기 실패 (${r.status})`);
    return true;
  },
  async test() {
    const r = await this.gh('');
    if (r.status === 401) throw new Error('접근 키가 올바르지 않습니다.');
    if (r.status === 404) throw new Error('저장소를 찾을 수 없습니다. 이름과 키의 권한을 확인하세요.');
    if (!r.ok) throw new Error(`연결 실패 (${r.status})`);
    const j = await r.json();
    if (j.permissions && !j.permissions.push) throw new Error('이 키에는 쓰기 권한이 없습니다.');
    return j;
  },

  setStatus(s, t = '') { this.status = s; this.statusText = t; this.onStatus(); },
  schedule() {
    if (!this.connected) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.sync(), 1500);
  },
  async sync() {
    if (!this.connected) { this.setStatus('local'); return; }
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    this.setStatus('syncing');
    let changed = false;
    try {
      for (const kind of [...KINDS, 'settings']) {
        for (let attempt = 0; attempt < 4; attempt++) {
          const { data: remote, sha } = await this.readJson(kind);
          let merged;
          if (kind === 'settings') {
            const local = this.db.settings;
            merged = remote && (remote.updatedAt || 0) > (local.updatedAt || 0) ? mergeDeep(clone(DEFAULT_SETTINGS), remote) : local;
          } else merged = mergeLists(this.db[kind], remote);
          if (!same(merged, this.db[kind])) { this.db[kind] = merged; changed = true; }
          if (same(merged, remote)) break;
          if (kind === 'settings' && !(merged.updatedAt > 0)) break; // 손대지 않은 기본 설정은 올리지 않는다
          if (await this.writeJson(kind, merged, sha)) break;
          if (attempt === 3) throw new Error('다른 기기와 계속 겹칩니다. 잠시 뒤 다시 시도하세요.');
        }
      }
      for (const key of lsGet(LS_UP, [])) {
        const blob = await idbOp('readonly', (s) => s.get(key));
        if (blob) {
          const r = await this.gh(`contents/photos/${key}.jpg`, { method: 'PUT', body: JSON.stringify({ message: `photo ${key}`, content: await blobToB64(blob) }) });
          if (!r.ok && r.status !== 422) throw new Error(`사진 올리기 실패 (${r.status})`);
        }
        lsSet(LS_UP, lsGet(LS_UP, []).filter((k) => k !== key));
      }
      for (const key of lsGet(LS_DEL, [])) {
        const r = await this.gh(`contents/photos/${key}.jpg`);
        if (r.ok) { const j = await r.json(); await this.gh(`contents/photos/${key}.jpg`, { method: 'DELETE', body: JSON.stringify({ message: `remove ${key}`, sha: j.sha }) }); }
        lsSet(LS_DEL, lsGet(LS_DEL, []).filter((k) => k !== key));
      }
      if (changed) { lsSet(LS_DB, this.db); this.onChange(true); }
      this.setStatus('synced', new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      this.setStatus('error', e.message || String(e));
    } finally {
      this._busy = false;
      if (this._again) { this._again = false; this.schedule(); }
    }
  },
};
