import { TEX_AXES, PATTERNS } from './defaults.js';
import * as C from './calc.js';
import { store } from './store.js';
import { tileSVG } from './tiles.js';
import { makeSamples } from './samples.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
const daysAgo = (s) => Math.round((Date.parse(today()) - Date.parse(s)) / 864e5);
const agoText = (s) => { const n = daysAgo(s); return n <= 0 ? '오늘' : n === 1 ? '어제' : n < 60 ? `${n}일 전` : `${Math.round(n / 30)}달 전`; };
const eun = (w) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? '은' : '는'); // 받침에 따라 은/는
const nv = (v) => (v === '' || v == null ? null : Number(v));
const go = (h) => { location.hash = h; };
const S = () => store.S;
const items = () => store.list('items');
const owned = () => items().filter((i) => i.status !== 'gone');       // 처분하지 않은 옷
const wearable = () => items().filter((i) => !i.status || i.status === 'active'); // 지금 입는 옷
const looks = () => store.list('looks');

const ui = { occasion: null, recPage: 0, closetCat: 'all', closetSort: 'new', closetStatus: 'active', pos: undefined, next: null, lookFilter: 'all', weather: null, weatherErr: null, manual: null, open: new Set(['body']), loadingWeather: false };

const FEEL = { hot: '더웠다', ok: '적당했다', cold: '추웠다' };
const WMO = (c) => c == null ? '' : c === 0 ? '맑음' : c <= 2 ? '구름 조금' : c === 3 ? '흐림' : c <= 48 ? '안개' : c <= 57 ? '이슬비' : c <= 67 ? '비' : c <= 77 ? '눈' : c <= 82 ? '소나기' : c <= 86 ? '눈' : '뇌우';
const AXIS_TITLE = { main: { bottom: '통' }, shape: '형태', length: '기장' };
const axisTitle = (axis, cat) => (axis === 'main' ? (cat === 'bottom' ? '통' : '품') : AXIS_TITLE[axis]);

// ---------- 공통 조각 ----------
function patternOf(it) { const w = S().weaves.find((x) => x.name === it.weave); return w ? w.pattern : 'plain'; }
function thumb(it, cls = '') {
  if (!it) return `<div class="thumb ${cls} gone"></div>`;
  return it.photo
    ? `<div class="thumb ${cls}"><img data-photo="${esc(it.photo)}_t" alt="${esc(it.name)}" loading="lazy"></div>`
    : `<div class="thumb ${cls}">${tileSVG(patternOf(it), it.color)}</div>`;
}
function hydrate() {
  for (const img of $$('img[data-photo]', app)) {
    const key = img.dataset.photo;
    store.photoURL(key).then((url) => { if (url) img.src = url; else img.closest('.thumb,.photo')?.classList.add('missing'); });
  }
}
function fitBadges(it) {
  const f = C.fitOf(it, S(), owned());
  return [f.main, f.shape, f.length].filter((a) => a && a.label).map((a) => `<span class="badge">${esc(a.label)}</span>`).join('');
}
function texBars(t, t2) {
  return `<div class="texbars">${TEX_AXES.map((a, i) => `
    <div class="texrow"><span class="texname">${a.name}</span><span class="texend">${a.lo}</span>
      <div class="bar"><i style="width:${((t[i] - 1) / 4) * 100}%"></i>${t2 ? `<b style="left:${((t2[i] - 1) / 4) * 100}%"></b>` : ''}</div>
      <span class="texend">${a.hi}</span><span class="texval">${t[i]}</span></div>`).join('')}</div>`;
}
const empty = (title, body, btn = '') => `<div class="empty"><h3>${title}</h3><p>${body}</p>${btn}</div>`;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); }
function setHeader(title, back) {
  $('#title').textContent = title;
  const b = $('#back'); b.hidden = !back; b.onclick = () => (typeof back === 'string' ? go(back) : history.back());
}
function renderStatus() {
  const el = $('#sync');
  const m = { local: ['이 기기에만 저장', ''], syncing: ['맞추는 중', 'busy'], synced: ['저장됨', 'ok'], error: ['저장 오류', 'err'] }[store.status];
  el.textContent = m[0]; el.className = 'sync ' + m[1]; el.title = store.statusText || '';
}

// ---------- 사진 처리 ----------
async function exifDate(file) {
  try {
    const buf = new DataView(await file.slice(0, 262144).arrayBuffer());
    if (buf.getUint16(0) !== 0xffd8) return null;
    let o = 2;
    while (o + 4 < buf.byteLength) {
      const mk = buf.getUint16(o), len = buf.getUint16(o + 2);
      if ((mk & 0xff00) !== 0xff00) break;
      if (mk === 0xffe1 && buf.getUint32(o + 4) === 0x45786966) {
        const t = o + 10, le = buf.getUint16(t) === 0x4949;
        const u16 = (p) => buf.getUint16(p, le), u32 = (p) => buf.getUint32(p, le);
        const find = (start, tag) => { const n = u16(start); for (let i = 0; i < n; i++) { const e = start + 2 + i * 12; if (u16(e) === tag) return e; } return -1; };
        const str = (e) => { const cnt = u32(e + 4), off = cnt > 4 ? t + u32(e + 8) : e + 8; let s = ''; for (let i = 0; i < cnt - 1; i++) s += String.fromCharCode(buf.getUint8(off + i)); return s; };
        const ifd0 = t + u32(t + 4);
        let ds = null;
        const ex = find(ifd0, 0x8769);
        if (ex >= 0) { const d = find(t + u32(ex + 8), 0x9003); if (d >= 0) ds = str(d); }
        if (!ds) { const d = find(ifd0, 0x0132); if (d >= 0) ds = str(d); }
        const m = ds && ds.match(/^(\d{4}):(\d{2}):(\d{2})/);
        return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
      }
      o += 2 + len;
    }
  } catch { /* 날짜를 못 읽으면 파일 날짜를 쓴다 */ }
  return null;
}
async function processImage(file) {
  const date = (await exifDate(file)) || ymd(new Date(file.lastModified || Date.now()));
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('이 사진 형식은 열 수 없습니다.')); im.src = URL.createObjectURL(file); });
  }
  const scale = (max, q) => new Promise((res) => {
    const k = Math.min(1, max / Math.max(src.width, src.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    cv.toBlob(res, 'image/jpeg', q);
  });
  return { full: await scale(1600, 0.82), thumb: await scale(480, 0.8), date };
}
async function savePhoto(prefix, file) {
  const p = await processImage(file);
  const key = `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await store.putPhoto(key, p.full); await store.putPhoto(key + '_t', p.thumb);
  return { key, date: p.date };
}
const dropPhoto = (key) => { store.dropPhoto(key); store.dropPhoto(key + '_t'); };

// ---------- 날씨 ----------
function geo() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('위치 사용 불가'));
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }), rej, { timeout: 8000, maximumAge: 600000 });
  });
}
async function getPos() {
  if (ui.pos === undefined) { try { ui.pos = await geo(); } catch { ui.pos = null; /* 권한이 없으면 기본 지역 */ } }
  return ui.pos;
}
const placeOf = (pos) => pos || { lat: S().weather.region.lat, lon: S().weather.region.lon };
// 날짜별 기준 온도(체감 최저·최고의 중간). 앞으로 n일 또는 지난 1년.
async function fetchDaily(kind) {
  const p = placeOf(await getPos());
  const q = { latitude: p.lat.toFixed(3), longitude: p.lon.toFixed(3), daily: 'apparent_temperature_max,apparent_temperature_min', timezone: 'auto' };
  let base = 'https://api.open-meteo.com/v1/forecast';
  if (kind === 'next') q.forecast_days = Math.min(16, Math.max(1, S().season.horizonDays));
  else {
    const KEY = 'closet.wxyear.v1';
    try { const c = JSON.parse(localStorage.getItem(KEY)); if (c && Date.now() - c.at < 7 * 864e5 && Math.abs(c.lat - p.lat) < 0.5) return c.days; } catch { /* 새로 받는다 */ }
    base = 'https://archive-api.open-meteo.com/v1/archive';
    q.start_date = ymd(new Date(Date.now() - 370 * 864e5)); q.end_date = ymd(new Date(Date.now() - 6 * 864e5));
    const u = new URL(base); u.search = new URLSearchParams(q);
    const r = await fetch(u); if (!r.ok) throw new Error('지난 날씨를 불러오지 못했습니다.');
    const d = (await r.json()).daily;
    const days = d.time.map((t, i) => ({ date: t, base: (d.apparent_temperature_max[i] + d.apparent_temperature_min[i]) / 2 })).filter((x) => !Number.isNaN(x.base));
    try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), lat: p.lat, days })); } catch { /* 저장 공간 없음 */ }
    return days;
  }
  const u = new URL(base); u.search = new URLSearchParams(q);
  const r = await fetch(u); if (!r.ok) throw new Error('예보를 불러오지 못했습니다.');
  const d = (await r.json()).daily;
  return d.time.map((t, i) => ({ date: t, base: (d.apparent_temperature_max[i] + d.apparent_temperature_min[i]) / 2 })).filter((x) => !Number.isNaN(x.base));
}
async function loadNext() {
  if (ui.next && Date.now() - ui.next.at < 3 * 3600e3) return ui.next.days;
  const days = await fetchDaily('next'); ui.next = { at: Date.now(), days }; return days;
}
async function fetchWeather(lat, lon, date) {
  const W = S().weather, t = today(), d = date || t;
  const archive = daysAgo(d) > 80;
  const u = new URL(archive ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast');
  const q = { latitude: lat.toFixed(3), longitude: lon.toFixed(3), start_date: d, end_date: d, timezone: 'auto',
    hourly: archive ? 'temperature_2m,apparent_temperature,precipitation,weather_code' : 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code' };
  if (d === t) q.current = 'temperature_2m,apparent_temperature,weather_code';
  u.search = new URLSearchParams(q);
  const r = await fetch(u);
  if (!r.ok) throw new Error('날씨를 불러오지 못했습니다.');
  const j = await r.json(), H = j.hourly;
  const idx = H.time.map((x, i) => [Number(x.slice(11, 13)), i]).filter(([h]) => h >= W.startHour && h <= W.endHour).map((x) => x[1]);
  const pick = (arr) => idx.map((i) => (arr || [])[i]).filter((v) => typeof v === 'number');
  const ap = pick(H.apparent_temperature);
  if (!ap.length) throw new Error('그 날짜의 날씨 기록이 없습니다.');
  const pp = pick(H.precipitation_probability), pr = pick(H.precipitation), codes = pick(H.weather_code);
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    date: d, tmin: r1(Math.min(...ap)), tmax: r1(Math.max(...ap)),
    rain: pp.length ? Math.max(...pp) : pr.reduce((s, v) => s + v, 0) >= 1 ? 100 : 0,
    code: j.current ? j.current.weather_code : codes.length ? Math.max(...codes) : null,
    now: j.current ? j.current.temperature_2m : null, feelsNow: j.current ? j.current.apparent_temperature : null,
  };
}
async function loadTodayWeather(force) {
  if (ui.loadingWeather) return;
  if (!force && ui.weather && Date.now() - ui.weather.at < 30 * 60e3 && ui.weather.date === today()) return;
  ui.loadingWeather = true; ui.weatherErr = null;
  try {
    const pos = await getPos();
    const R = S().weather.region;
    const w = await fetchWeather(pos ? pos.lat : R.lat, pos ? pos.lon : R.lon, null);
    ui.weather = { ...w, place: pos ? '현재 위치' : `${R.name} (기본 지역)`, at: Date.now() };
  } catch (e) { ui.weatherErr = e.message; }
  ui.loadingWeather = false;
  if (currentRoute() === 'today') render();
}
async function weatherForDate(date) {
  const R = S().weather.region;
  let p = { lat: R.lat, lon: R.lon };
  if (date === today()) p = placeOf(await getPos());
  const w = await fetchWeather(p.lat, p.lon, date);
  return { tmin: w.tmin, tmax: w.tmax, rain: w.rain, code: w.code };
}

// ---------- 오늘 ----------
function viewToday() {
  setHeader('오늘', false);
  loadTodayWeather();
  const dow = new Date().getDay();
  if (!ui.occasion) ui.occasion = dow === 0 || dow === 6 ? '주말' : S().occasions[0];
  const w = ui.manual || ui.weather;
  let weatherCard;
  if (w) {
    weatherCard = `<section class="card weather">
      <div class="w-top"><div><div class="w-place">${ui.manual ? '직접 넣은 기온' : esc(w.place)}${!ui.manual && w.code != null ? ' · ' + WMO(w.code) : ''}</div>
        <div class="w-temp">${w.tmin}° <span>~</span> ${w.tmax}°</div>
        <div class="muted">${S().weather.startHour}시~${S().weather.endHour}시 체감온도${!ui.manual && w.now != null ? ` · 지금 ${w.now}°` : ''}${!ui.manual ? ` · 강수확률 ${w.rain}%` : ''}</div></div></div>
    </section>`;
  } else {
    weatherCard = `<section class="card weather"><div class="muted">${ui.weatherErr ? esc(ui.weatherErr) + ' 아래에서 기온을 직접 넣을 수 있습니다.' : '날씨를 불러오는 중…'}</div></section>`;
  }
  const manual = `<details class="fold"><summary>기온 직접 넣기</summary><div class="row2">
      <label>최저 체감<input id="mmin" type="number" inputmode="decimal" value="${ui.manual ? ui.manual.tmin : ''}"></label>
      <label>최고 체감<input id="mmax" type="number" inputmode="decimal" value="${ui.manual ? ui.manual.tmax : ''}"></label></div>
      <div class="btnrow"><button class="btn sm" id="mset">이 기온으로 추천</button><button class="btn sm ghost" id="mclr">실제 날씨로</button></div></details>`;
  const occ = `<div class="chips">${S().occasions.map((o) => `<button class="chip ${ui.occasion === o ? 'on' : ''}" data-occ="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;

  let recHtml = '';
  if (!items().length) {
    recHtml = empty('옷장이 비어 있어요', '옷을 등록하면 날씨에 맞는 조합을 골라 드립니다.', `<div class="btnrow center"><a class="btn" href="#/e/items/new">옷 등록하기</a><button class="btn ghost" id="sample">예시 데이터로 둘러보기</button></div>`);
  } else if (w) {
    const rec = C.recommend(wearable(), looks(), S(), { tmin: w.tmin, tmax: w.tmax, rain: w.rain || 0, occasion: ui.occasion, today: today() });
    const I = rec.info, n = S().recommend.count;
    const pages = Math.max(1, Math.ceil(rec.combos.length / n));
    const page = ui.recPage % pages;
    const list = rec.combos.slice(page * n, page * n + n);
    recHtml = `<section class="card basis">
        <div class="basis-row"><span>기준 온도</span><b>${I.base}°</b></div>
        <div class="basis-row"><span>이 구간의 옷차림</span><b>${esc(I.band.label)}</b></div>
        <div class="basis-row"><span>보온 합계 목표</span><b>${I.lo} ~ ${I.hi}</b></div>
        ${I.offset ? `<div class="muted small">내 체감 기록(추웠다 ${I.feel.cold} · 더웠다 ${I.feel.hot})으로 목표를 ${I.offset > 0 ? '+' : ''}${I.offset} 옮겼습니다.</div>` : ''}
        ${I.swing ? `<div class="muted small">일교차가 ${S().weather.diurnal}도 이상이라 벗을 수 있는 겉옷을 넣었습니다.</div>` : ''}
        ${I.rainy ? `<div class="muted small">강수확률이 높아 비에 약한 옷을 뺐습니다.</div>` : ''}
      </section>`
      + (list.length ? list.map((c, i) => `<section class="card rec">
          <div class="rec-items">${c.items.map((it) => `<a class="rec-item" href="#/d/items/${it.id}">${thumb(it)}<span>${esc(it.name)}</span></a>`).join('')}</div>
          <div class="rec-meta"><span>보온 합계 <b>${c.total}</b>${c.dist ? ` <em>(목표와 ${c.dist} 차이)</em>` : ''}</span>${c.notes.map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div>
          <button class="btn full" data-wear="${page * n + i}">오늘 이거 입음</button></section>`).join('')
        + (pages > 1 ? `<button class="btn ghost full" id="more">다른 조합 보기 (${page + 1}/${pages})</button>` : '')
        : empty('맞는 조합을 찾지 못했어요', esc(rec.reason || '옷을 더 등록하거나 상황을 바꿔 보세요.')));
    ui._combos = rec.combos;
  }
  let seasonHtml = '';
  if (owned().length && ui.next) {
    const p = C.seasonPlan(items(), looks(), S(), ui.next.days.map((d) => d.base), null, today());
    const n = p.takeOut.length + p.putAway.length;
    if (n >= 3) seasonHtml = `<a class="card nudge" href="#/season"><b>옷장을 바꿀 때예요</b><span>앞으로 ${ui.next.days.length}일 기온 기준 · 꺼낼 옷 ${p.takeOut.length}벌 · 넣을 옷 ${p.putAway.length}벌</span></a>`;
  } else if (owned().length && !ui.nextTried) { ui.nextTried = true; loadNext().then(() => { if (currentRoute() === 'today') render(); }).catch(() => {}); }
  app.innerHTML = `<p class="dateline">${fmtDate(today())}</p>${weatherCard}${manual}${seasonHtml}${occ}${recHtml}`;

  $$('[data-occ]').forEach((b) => (b.onclick = () => { ui.occasion = b.dataset.occ; ui.recPage = 0; render(); }));
  $('#mset').onclick = () => { const a = nv($('#mmin').value), b = nv($('#mmax').value); if (a == null || b == null) return toast('최저와 최고를 모두 넣어 주세요.'); ui.manual = { tmin: Math.min(a, b), tmax: Math.max(a, b), rain: 0 }; ui.recPage = 0; render(); };
  $('#mclr').onclick = () => { ui.manual = null; render(); };
  if ($('#more')) $('#more').onclick = () => { ui.recPage++; render(); window.scrollTo(0, 0); };
  if ($('#sample')) $('#sample').onclick = addSamples;
  $$('[data-wear]').forEach((b) => (b.onclick = () => {
    const c = ui._combos[Number(b.dataset.wear)];
    const l = store.upsert('looks', { date: today(), itemIds: c.items.map((x) => x.id), photos: [], weather: { tmin: w.tmin, tmax: w.tmax, rain: w.rain || 0, code: w.code ?? null }, occasion: ui.occasion, feel: null, liked: false, memo: '' });
    toast('오늘의 룩으로 기록했어요.'); go(`#/look/${l.id}`);
  }));
}
function addSamples() {
  const s = makeSamples(today());
  s.items.forEach((x) => store.upsert('items', x)); s.looks.forEach((x) => store.upsert('looks', x));
  toast('예시 데이터를 넣었어요. 설정에서 한 번에 지울 수 있습니다.'); render();
}

// ---------- 옷장 ----------
function viewCloset() {
  setHeader('옷장', false);
  const all = ui.closetStatus === 'all' ? items() : items().filter((i) => (i.status || 'active') === ui.closetStatus);
  const last = new Map();
  for (const l of looks()) for (const id of l.itemIds) if (!last.has(id) || last.get(id) < l.date) last.set(id, l.date);
  let list = ui.closetCat === 'all' ? all : all.filter((i) => i.cat === ui.closetCat);
  if (ui.closetSort === 'new') list = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (ui.closetSort === 'old') list = [...list].sort((a, b) => (last.get(a.id) || '') < (last.get(b.id) || '') ? -1 : 1);
  if (ui.closetSort === 'warm') list = [...list].sort((a, b) => ((C.warmthOf(b, S()) || {}).score || 0) - ((C.warmthOf(a, S()) || {}).score || 0));
  const chips = [['all', '전체'], ...C.CATS.map((c) => [c, C.CAT_LABEL[c]])].map(([k, t]) => `<button class="chip ${ui.closetCat === k ? 'on' : ''}" data-cat="${k}">${t}<i>${k === 'all' ? all.length : all.filter((x) => x.cat === k).length}</i></button>`).join('');
  const cards = list.map((it) => {
    const w = C.warmthOf(it, S());
    const lw = last.get(it.id);
    return `<a class="pin" href="#/d/items/${it.id}">${thumb(it, it.photo ? 'tall' : '')}
      <div class="pin-body"><div class="pin-name">${esc(it.name)}</div>
      <div class="pin-sub">${it.status === 'stored' ? '<span class="badge line">보관 중</span>' : it.status === 'gone' ? `<span class="badge line">${esc(it.goneHow || '처분')}</span>` : ''}${fitBadges(it)}${w ? `<span class="badge soft">보온 ${w.score}</span>` : ''}</div>
      <div class="pin-foot">${lw ? agoText(lw) + ' 입음' : '아직 안 입음'}</div></div></a>`;
  }).join('');
  app.innerHTML = `<div class="chips scroll">${chips}</div>
    <div class="toolbar"><a class="btn sm ghost" href="#/season">계절 정리</a><span class="grow"></span>
      <select id="cstatus"><option value="active">입는 중</option><option value="stored">보관 중</option><option value="gone">처분함</option><option value="all">전체</option></select>
      <select id="sort"><option value="new">최근 등록 순</option><option value="old">오래 안 입은 순</option><option value="warm">보온 높은 순</option></select></div>
    ${list.length ? `<div class="masonry">${cards}</div>` : empty('등록된 옷이 없어요', '쇼핑몰 상세페이지의 실측표와 소재를 보고 직접 넣어 주세요.', items().length ? '' : '<div class="btnrow center"><button class="btn ghost" id="sample">예시 데이터로 둘러보기</button></div>')}
    <a class="fab" href="#/e/items/new" aria-label="옷 등록">＋</a>`;
  $('#cstatus').value = ui.closetStatus;
  $('#cstatus').onchange = (e) => { ui.closetStatus = e.target.value; render(); };
  $('#sort').value = ui.closetSort;
  $('#sort').onchange = (e) => { ui.closetSort = e.target.value; render(); };
  $$('[data-cat]').forEach((b) => (b.onclick = () => { ui.closetCat = b.dataset.cat; render(); }));
  if ($('#sample')) $('#sample').onclick = addSamples;
}

// ---------- 옷·후보 상세 ----------
function axisChart(fa, selfName) {
  const vals = [fa.v, ...fa.points.map((p) => p.v), ...fa.bounds.filter(C.num)];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const padv = (hi - lo || 2) * 0.15; lo -= padv; hi += padv;
  const pos = (v) => ((v - lo) / (hi - lo)) * 100;
  const ticks = fa.bounds.map((b, i) => (C.num(b) ? `<i class="tick ${fa.src[i] === 'mine' ? 'mine' : ''}" style="left:${pos(b)}%"><span>${b}</span></i>` : '')).join('');
  const dots = fa.points.map((p) => `<i class="dot ${p.user !== null ? 'lab' : ''}" style="left:${pos(p.v)}%" title="${esc(p.name)} ${p.v}"></i>`).join('');
  const below = [...fa.points].reverse().find((p) => p.v <= fa.v), above = fa.points.find((p) => p.v > fa.v);
  const near = (p, t) => p ? `<li><span>${t}</span><a href="#/d/items/${p.id}">${esc(p.name)}</a><b>${p.v}${fa.unit}</b>${p.user !== null ? `<em>${esc(fa.stages[p.user])}</em>` : ''}</li>` : '';
  return `<div class="axis"><div class="track">${ticks}${dots}<i class="me" style="left:${pos(fa.v)}%"><span>${esc(selfName)}</span></i></div></div>
    ${fa.points.length ? `<ul class="near">${near(below, '바로 아래')}${near(above, '바로 위')}</ul>` : '<p class="muted small">비교할 내 옷이 아직 없습니다.</p>'}`;
}
function fitBlock(it, fa) {
  if (!fa) return '';
  const srcText = fa.auto !== null || fa.user !== null
    ? (fa.user !== null ? '이 옷에 직접 표시한 핏입니다.' : fa.src.includes('mine') ? '내 옷에 표시한 핏 사이를 경계로 썼습니다.' : '기준 설정에 넣은 경계값을 썼습니다.')
    : '이 값 주변의 경계가 아직 비어 있어 자동 판정은 하지 않습니다. 옷에 핏을 직접 표시하거나 기준 설정에서 경계값을 넣으면 판정됩니다.';
  const head = fa.label ? `<b class="fitlabel">${esc(fa.label)}</b>${fa.user !== null ? '<span class="badge soft">내가 표시</span>' : '<span class="badge soft">자동 판정</span>'}` : '<b class="fitlabel none">미판정</b>';
  return `<div class="fitblock"><div class="fithead"><span class="fitaxis">${axisTitle(fa.axis, it.cat)}</span>${head}</div>
    <div class="muted small">${esc(fa.name)} = <b>${fa.v}${fa.unit}</b></div>${axisChart(fa, '이 옷')}<p class="muted small">${srcText}</p></div>`;
}
function viewDetail(kind, id) {
  const it = store.get(kind, id);
  if (!it) { app.innerHTML = empty('찾을 수 없어요', '지워졌거나 아직 이 기기에 내려받지 못한 항목입니다.'); return; }
  const cand = kind === 'candidates';
  setHeader(cand ? '구매 후보' : C.CAT_LABEL[it.cat], cand ? '#/compare' : '#/closet');
  const pool = owned();
  const f = C.fitOf(it, S(), pool);
  const st = it.status || 'active';
  const hasFeel = it.feel && Object.keys(it.feel).length > 0;
  const fc = C.fitCheck(it, items(), S());
  const VCLS = { ok: 'ok', small: 'bad', big: 'bad', maybeSmall: 'warn', maybeBig: 'warn' };
  const good = fc.filter((r) => r.verdict === 'ok').map((r) => r.name), off = fc.filter((r) => r.verdict !== 'ok');
  const fcHtml = fc.length ? `<section class="card"><h3>${hasFeel ? '다른 옷 기록과 견주면' : '나에게 맞을까'}</h3>
      <p class="lead">${[good.length ? `${good.join('·')}${eun(good[good.length - 1])} 맞았던 범위 안` : '', ...off.map((r) => `${r.name}${eun(r.name)} ${r.verdict.toLowerCase().includes('small') ? '작을' : '클'} 가능성`)].filter(Boolean).join(', ')}</p>
      ${fc.map((r) => `<div class="fcrow ${VCLS[r.verdict]}"><span>${r.name}</span><b>${r.raw}cm</b><em>${r.text}${r.stretch ? ' · 신축성 반영' : ''}</em>
        <small>${r.range.n ? `맞았던 옷 ${r.range.n}벌 ${r.range.min}~${r.range.max}cm` : ''}${r.range.smallMax !== null ? ` · 작았던 옷 ${r.range.smallMax}cm 이하` : ''}${r.range.bigMin !== null ? ` · 컸던 옷 ${r.range.bigMin}cm 이상` : ''}</small></div>`).join('')}
      <p class="muted small">옷마다 표시한 「입어 보니」 기록에서 나온 범위입니다. 확률이 아니라 실제로 맞았던 옷과의 비교입니다.</p></section>` : '';
  const feelHtml = hasFeel ? `<section class="card"><h3>입어 보니</h3><div class="feelline">${(C.FEEL_PARTS[it.cat] || []).filter(([k]) => it.feel[k]).map(([k, n]) => `<span class="${it.feel[k] === 'ok' ? 'ok' : 'bad'}">${n} <b>${C.FEEL_LABEL[it.feel[k]]}</b></span>`).join('')}</div>
      ${C.bodyShift(it, S()).map((s) => `<p class="alert">표시한 뒤 ${s.name}가 ${s.delta > 0 ? '+' : ''}${s.delta}cm 바뀌었어요. 지금은 ${s.delta < 0 ? '클' : '작을'} 수 있습니다.</p>`).join('')}</section>` : '';
  const bh = C.brandHistory(it, items());
  const brandHtml = bh.length ? `<section class="card"><h3>${esc(it.brand)}의 다른 옷</h3>${bh.map((b) => `<a class="simrow" href="#/d/items/${b.item.id}">${thumb(b.item)}<div><b>${esc(b.item.name)}${b.item.size ? ' · ' + esc(b.item.size) : ''}</b><div class="diffs"><span>${esc(b.summary)}</span></div></div></a>`).join('')}</section>` : '';
  const dups = C.duplicates(it, pool, S());
  const dupHtml = dups.length ? `<section class="card dup"><h3>비슷한 옷이 이미 있어요</h3>${dups.map((d) => `<a class="simrow" href="#/d/items/${d.item.id}">${thumb(d.item)}<div><b>${esc(d.item.name)}</b><div class="diffs"><span>색이 가깝고 ${d.dist !== null ? `실측 차이 평균 ${d.dist}cm` : '조직이 같음'}</span></div></div></a>`).join('')}</section>` : '';
  const statusHtml = cand ? '' : `<section class="card"><h3>지금 이 옷은</h3><div class="chips">${[['active', '입는 중'], ['stored', '계절 보관'], ['gone', '처분함']].map(([k, t]) => `<button class="chip ${st === k ? 'on' : ''}" data-status="${k}">${t}</button>`).join('')}</div>
      ${st === 'gone' ? `<div class="chips">${['판매', '기부', '버림'].map((h) => `<button class="chip ${it.goneHow === h ? 'on' : ''}" data-gone="${h}">${h}</button>`).join('')}</div><p class="muted small">처분한 옷도 기록은 남아 핏 판정의 근거로 계속 쓰입니다.</p>` : ''}
      ${st === 'stored' ? '<p class="muted small">보관 중인 옷은 추천에 나오지 않습니다.</p>' : ''}${it.statusAt ? `<p class="muted small">${fmtDate(it.statusAt)}에 바꿈</p>` : ''}</section>`;
  const w = C.warmthOf(it, S());
  const ease = C.easeOf(it, S());
  const easeName = { chest: '가슴', shoulder: '어깨', waist: '허리', hip: '엉덩이', thigh: '허벅지' };
  const mrows = (C.MEASURES[it.cat] || []).filter(([k]) => C.num((it.m || {})[k])).map(([k, n]) => `<tr><th>${n}</th><td>${it.m[k]} cm</td><td class="muted">${ease[k] != null ? `내 몸보다 ${ease[k] > 0 ? '+' : ''}${ease[k]}` : ''}</td></tr>`).join('');
  const mats = (it.materials || []).filter((x) => x.name).map((x) => `${esc(x.name)} ${x.pct}%`).join(' · ');
  const hero = it.photo ? `<div class="photo hero"><img data-photo="${esc(it.photo)}" alt=""></div>` : `<div class="hero-tile">${tileSVG(patternOf(it), it.color)}</div>`;

  let tex = '';
  if (it.cat !== 'shoes' || it.weave) {
    const t = C.textureOf(it, S());
    const sim = C.similarByTexture(it, pool, S());
    tex = `<section class="card"><h3>질감</h3><p class="lead">${C.textureText(t)}</p>${texBars(t)}
      ${sim.length ? `<h4>질감이 비슷한 내 옷</h4><div class="minis">${sim.map((s) => `<a class="mini" href="#/d/items/${s.item.id}">${thumb(s.item)}<span>${esc(s.item.name)}</span></a>`).join('')}</div>` : ''}</section>`;
  }
  const simM = C.similarByMeasure(it, pool);
  const names = Object.fromEntries((C.MEASURES[it.cat] || []));
  const simHtml = simM.length ? `<section class="card"><h3>실측이 비슷한 내 옷</h3>${simM.map((s) => `<a class="simrow" href="#/d/items/${s.item.id}">${thumb(s.item)}<div><b>${esc(s.item.name)}</b>
      <div class="diffs">${Object.entries(s.diffs).map(([k, d]) => `<span class="${Math.abs(d) < 1 ? 'eq' : ''}">${names[k]} ${d > 0 ? '+' : ''}${d}</span>`).join('')}</div></div></a>`).join('')}
      <p class="muted small">숫자는 이 옷이 그 옷보다 얼마나 큰지(cm)입니다.</p></section>` : '';

  let history = '';
  if (!cand) {
    const st = C.wearStats(it.id, looks(), pool);
    history = `<section class="card"><h3>입은 기록</h3>
      <div class="stats"><div><b>${st.count}</b><span>번 입음</span></div><div><b>${st.last ? agoText(st.last) : '—'}</b><span>마지막</span></div>
      <div><b>${st.tempRange ? `${st.tempRange[0]}°~${st.tempRange[1]}°` : '—'}</b><span>입은 날 체감</span></div></div>
      ${st.count ? `<p class="muted small">더웠다 ${st.feels.hot} · 적당했다 ${st.feels.ok} · 추웠다 ${st.feels.cold}</p>` : '<p class="muted small">아직 룩에 기록되지 않았어요.</p>'}
      ${st.partners.length ? `<h4>자주 함께 입은 옷</h4><div class="minis">${st.partners.map((p) => `<a class="mini" href="#/d/items/${p.item.id}">${thumb(p.item)}<span>${esc(p.item.name)} · ${p.n}번</span></a>`).join('')}</div>` : ''}
      ${st.looks.length ? `<h4>이 옷이 들어간 룩</h4><div class="minis">${st.looks.map((l) => `<a class="mini" href="#/look/${l.id}">${lookThumb(l)}<span>${fmtDate(l.date)}</span></a>`).join('')}</div>` : ''}</section>`;
  }
  app.innerHTML = `${hero}
    <section class="card"><h2>${esc(it.name)}</h2>
      <p class="muted">${[it.brand, it.size, it.occasion, it.price ? Number(it.price).toLocaleString() + '원' : ''].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="swatchline"><i class="swatch" style="background:${esc(it.color)}"></i>${esc(it.colorFamily || '')}${mats ? ' · ' + mats : ''}</div>
      <p class="muted">${[it.weave, it.thickness, it.cat === 'outer' && it.fill && it.fill !== '없음' ? '충전재 ' + it.fill : ''].filter(Boolean).map(esc).join(' · ')}</p>
      ${it.url ? `<p><a class="link" href="${esc(it.url)}" target="_blank" rel="noopener">상품 페이지 열기</a></p>` : ''}
      ${it.memo ? `<p>${esc(it.memo)}</p>` : ''}</section>
    ${f.main || f.shape || f.length ? `<section class="card"><h3>핏</h3>${fitBlock(it, f.main)}${fitBlock(it, f.shape)}${fitBlock(it, f.length)}
      ${f.reach ? `<p class="reach">내 몸에서는 <b>${f.reach}</b> <span class="muted small">(키 비율로 어림한 값)</span></p>` : ''}</section>` : ''}
    ${cand ? dupHtml : ''}${feelHtml}${fcHtml}${brandHtml}
    ${mrows ? `<section class="card"><h3>실측</h3><table class="mtable">${mrows}</table></section>` : ''}
    ${simHtml}
    ${w ? `<section class="card"><h3>보온</h3><div class="warm"><b>${w.score}</b><span>점</span></div>
      <p class="muted small">소재 ${w.base}${w.known ? '' : '(소재 미입력)'} × 두께 ${w.thick} × 조직 ${w.weave}${w.fill ? ` + 충전재 ${w.fill}` : ''}${w.short !== 1 ? ` × 반팔·반바지 ${w.short}` : ''}</p></section>` : ''}
    ${tex}${history}${statusHtml}
    ${cand ? `<button class="btn full" id="buy">샀어요 · 옷장으로 옮기기</button>` : ''}
    <div class="btnrow"><a class="btn ghost" href="#/e/${kind}/${it.id}">고치기</a><button class="btn ghost danger" id="del">지우기</button></div>`;
  $('#del').onclick = () => { if (!confirm('지울까요?')) return; if (it.photo) dropPhoto(it.photo); store.remove(kind, id); go(cand ? '#/compare' : '#/closet'); };
  $$('[data-status]').forEach((b) => (b.onclick = () => { it.status = b.dataset.status; it.statusAt = today(); if (it.status !== 'gone') delete it.goneHow; store.upsert(kind, it); render(); }));
  $$('[data-gone]').forEach((b) => (b.onclick = () => { it.goneHow = b.dataset.gone; store.upsert(kind, it); render(); }));
  if ($('#buy')) $('#buy').onclick = () => {
    const moved = { ...it, id: store.newId(), createdAt: Date.now(), bought: today() };
    delete moved.url; delete moved.price;
    store.upsert('items', moved); store.remove('candidates', id); toast('옷장으로 옮겼어요.'); go(`#/d/items/${moved.id}`);
  };
}

// ---------- 옷·후보 등록 ----------
function viewEdit(kind, id) {
  const cand = kind === 'candidates';
  const isNew = id === 'new';
  const base = isNew ? { id: store.newId(), cat: ui.closetCat !== 'all' && !cand ? ui.closetCat : 'top', name: '', brand: '', size: '', color: '#c9bfae', colorFamily: '뉴트럴', occasion: '둘 다', materials: [{ name: '', pct: 100 }], weave: '', thickness: '보통', fill: '없음', m: {}, fitLabel: {}, texOverride: null, photo: null, bought: '', memo: '', createdAt: Date.now() } : store.get(kind, id);
  if (!base) { app.innerHTML = empty('찾을 수 없어요', ''); return; }
  const it = JSON.parse(JSON.stringify(base));
  let famTouched = !isNew;
  let newPhoto = null, feelTouched = false;
  setHeader(isNew ? (cand ? '구매 후보 넣기' : '옷 등록') : '고치기', true);
  const cats = cand ? ['top', 'bottom', 'outer'] : C.CATS;

  const draw = () => {
    const F = S().fit;
    const g = it.cat === 'inner' ? 'top' : it.cat;
    const mainStages = it.cat === 'bottom' ? F.bottomWidth.stages : (F[g] || {}).stages;
    const sel = (axis, stages) => `<select data-fit="${axis}"><option value="">표시 안 함</option>${stages.map((s, i) => `<option value="${i}" ${it.fitLabel[axis] === i ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`;
    const groups = [...new Set(S().weaves.map((w) => w.group))];
    app.innerHTML = `<form id="f" class="form" autocomplete="off">
      <section class="card"><h3>기본</h3>
        <label>분류<select name="cat">${cats.map((c) => `<option value="${c}" ${it.cat === c ? 'selected' : ''}>${C.CAT_LABEL[c]}</option>`).join('')}</select></label>
        <label>이름<input name="name" required value="${esc(it.name)}" placeholder="예: 생지 데님 와이드"></label>
        <div class="row2"><label>브랜드<input name="brand" value="${esc(it.brand)}"></label><label>사이즈<input name="size" value="${esc(it.size)}"></label></div>
        <div class="row2"><label>대표 색<input name="color" type="color" value="${esc(it.color)}"></label>
          <label>색 계열<select name="colorFamily">${['무채색', '뉴트럴', '유채색'].map((x) => `<option ${it.colorFamily === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
        <div class="row2"><label>상황<select name="occasion">${[...S().occasions, '둘 다'].map((x) => `<option ${it.occasion === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          ${cand ? `<label>가격<input name="price" type="number" inputmode="numeric" value="${esc(it.price ?? '')}"></label>` : `<label>구매일<input name="bought" type="date" value="${esc(it.bought)}"></label>`}</div>
        ${cand ? `<label>상품 주소<input name="url" type="url" value="${esc(it.url || '')}" placeholder="https://"></label>` : ''}
      </section>
      ${it.cat === 'shoes' ? '' : `<section class="card"><h3>실측 <span class="muted small">cm · 아는 것만</span></h3><div class="grid2">
        ${C.MEASURES[it.cat].map(([k, n]) => `<label>${n}<input data-m="${k}" type="number" step="0.1" inputmode="decimal" value="${it.m[k] ?? ''}"></label>`).join('')}</div></section>`}
      <section class="card"><h3>소재</h3><div id="mats">${it.materials.map((x, i) => `<div class="matrow"><input list="matlist" data-mat="${i}" value="${esc(x.name)}" placeholder="소재"><input data-pct="${i}" type="number" inputmode="numeric" value="${x.pct ?? ''}" placeholder="%"><button type="button" class="x" data-matdel="${i}" aria-label="지우기">×</button></div>`).join('')}</div>
        <datalist id="matlist">${S().materials.map((m) => `<option value="${esc(m.name)}">`).join('')}</datalist>
        <button type="button" class="btn sm ghost" id="matadd">소재 추가</button> <span class="muted small" id="matsum"></span>
        <label>조직(짜임)<select name="weave"><option value="">고르기</option>${groups.map((gr) => `<optgroup label="${esc(gr)}">${S().weaves.filter((w) => w.group === gr).map((w) => `<option ${it.weave === w.name ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <div class="row2"><label>두께<select name="thickness">${Object.keys(S().thickness).map((x) => `<option ${it.thickness === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        ${it.cat === 'outer' ? `<label>충전재<select name="fill">${Object.keys(S().fill).map((x) => `<option ${it.fill === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : '<span></span>'}</div>
      </section>
      ${it.cat === 'shoes' || cand ? '' : `<section class="card"><h3>입어 보니 <span class="muted small">부위별로 한 번만 표시 · 새 옷을 가늠하는 근거가 됩니다</span></h3>
        ${C.FEEL_PARTS[it.cat].map(([k, n]) => `<div class="feelpick"><span>${n}</span>${Object.entries(C.FEEL_LABEL).map(([v, t]) => `<button type="button" class="chip ${(it.feel || {})[k] === v ? 'on' : ''}" data-feelpart="${k}" data-feelval="${v}">${t}</button>`).join('')}</div>`).join('')}</section>`}
      ${it.cat === 'shoes' || cand ? '' : `<section class="card"><h3>내가 느끼는 핏 <span class="muted small">표시하면 새 옷을 가늠하는 기준점이 됩니다</span></h3>
        <label>${axisTitle('main', it.cat)}${sel('main', mainStages)}</label>
        ${it.cat === 'bottom' ? `<label>형태${sel('shape', F.bottomShape.stages)}</label>` : ''}
        <label>기장${sel('length', F.length.stages)}</label></section>`}
      <section class="card"><h3>사진 · 메모</h3>
        <label class="filebtn">${it.photo || newPhoto ? '사진 바꾸기' : '사진 고르기'}<input id="photo" type="file" accept="image/*" hidden></label><span class="muted small" id="photoname">${it.photo ? '사진 있음' : '없으면 질감 견본으로 표시됩니다'}</span>
        <label>메모<textarea name="memo" rows="2">${esc(it.memo)}</textarea></label></section>
      <div class="btnrow sticky"><button class="btn full" type="submit">저장</button></div></form>`;
    bind();
  };
  const read = () => {
    const f = $('#f');
    for (const el of $$('[name]', f)) it[el.name] = el.value;
    $$('[data-m]', f).forEach((el) => { const v = nv(el.value); if (v == null) delete it.m[el.dataset.m]; else it.m[el.dataset.m] = v; });
    $$('[data-mat]', f).forEach((el) => { it.materials[+el.dataset.mat].name = el.value.trim(); });
    $$('[data-pct]', f).forEach((el) => { it.materials[+el.dataset.pct].pct = nv(el.value) || 0; });
    $$('[data-fit]', f).forEach((el) => { if (el.value === '') delete it.fitLabel[el.dataset.fit]; else it.fitLabel[el.dataset.fit] = Number(el.value); });
    if (it.price !== undefined) it.price = nv(it.price);
  };
  const sum = () => { const s = it.materials.reduce((a, x) => a + (x.pct || 0), 0); $('#matsum').textContent = `합계 ${s}%${s !== 100 ? ' (100%가 아니어도 비율대로 계산합니다)' : ''}`; };
  const bind = () => {
    const f = $('#f');
    sum();
    f.elements.cat.onchange = () => { read(); it.m = {}; it.fitLabel = {}; it.feel = {}; draw(); };
    $$('[data-feelpart]', f).forEach((b) => (b.onclick = () => {
      read(); it.feel = it.feel || {};
      const k = b.dataset.feelpart;
      if (it.feel[k] === b.dataset.feelval) delete it.feel[k]; else it.feel[k] = b.dataset.feelval;
      feelTouched = true; const y = window.scrollY; draw(); window.scrollTo(0, y);
    }));
    f.elements.color.oninput = (e) => { if (!famTouched) f.elements.colorFamily.value = C.guessFamily(e.target.value); };
    f.elements.colorFamily.onchange = () => { famTouched = true; };
    $('#matadd').onclick = () => { read(); it.materials.push({ name: '', pct: 0 }); draw(); };
    $$('[data-matdel]', f).forEach((b) => (b.onclick = () => { read(); it.materials.splice(+b.dataset.matdel, 1); if (!it.materials.length) it.materials.push({ name: '', pct: 100 }); draw(); }));
    $$('[data-pct]', f).forEach((el) => (el.oninput = () => { read(); sum(); }));
    $('#photo').onchange = (e) => { newPhoto = e.target.files[0] || null; $('#photoname').textContent = newPhoto ? newPhoto.name : ''; };
    f.onsubmit = async (e) => {
      e.preventDefault(); read();
      it.materials = it.materials.filter((x) => x.name);
      if (feelTouched) it.feelBody = { ...S().body }; // 표시할 때의 몸 치수를 함께 적어 둔다
      if (isNew) {
        const dups = C.duplicates(it, owned(), S());
        if (dups.length && !confirm(`비슷한 옷이 이미 있습니다: ${dups.map((d) => d.item.name).join(', ')}\n그래도 저장할까요?`)) return;
      }
      try {
        if (newPhoto) { const old = it.photo; it.photo = (await savePhoto('i' + it.id, newPhoto)).key; if (old) dropPhoto(old); }
      } catch (err) { return toast(err.message); }
      store.upsert(kind, it); toast('저장했어요.'); location.replace(`#/d/${kind}/${it.id}`);
    };
  };
  draw();
}

// ---------- 구매 후보 ----------
function viewCompare() {
  setHeader('구매 후보 비교', false);
  const list = store.list('candidates').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  app.innerHTML = `<section class="card intro"><h3>사기 전에 가늠해 보기</h3><p class="muted">사려는 옷의 실측표와 소재를 넣으면, 내 옷장의 어느 옷과 비슷한 통·품인지와 질감이 가까운 옷을 보여 줍니다.</p>
      <a class="btn full" href="#/e/candidates/new">구매 후보 넣기</a></section>
    ${list.length ? `<div class="masonry">${list.map((it) => `<a class="pin" href="#/d/candidates/${it.id}">${thumb(it)}<div class="pin-body"><div class="pin-name">${esc(it.name)}</div>
      <div class="pin-sub"><span class="badge soft">${C.CAT_LABEL[it.cat]}</span>${fitBadges(it)}</div><div class="pin-foot">${it.price ? Number(it.price).toLocaleString() + '원' : ''}</div></div></a>`).join('')}</div>`
      : empty('아직 후보가 없어요', '눈여겨본 옷을 넣어 두면 나중에 다시 볼 수 있습니다.')}`;
}

// ---------- 룩 ----------
function lookThumb(l, cls = '') {
  if (l.photos && l.photos.length) return `<div class="thumb ${cls}"><img data-photo="${esc(l.photos[0])}_t" alt="" loading="lazy"></div>`;
  const its = l.itemIds.map((id) => store.get('items', id)).filter(Boolean).slice(0, 4);
  return `<div class="thumb collage n${its.length} ${cls}">${its.map((it) => (it.photo ? `<img data-photo="${esc(it.photo)}_t" alt="">` : tileSVG(patternOf(it), it.color))).join('')}</div>`;
}
function viewLooks() {
  setHeader('룩 기록', false);
  let list = looks().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.updatedAt || 0) - (a.updatedAt || 0)));
  const total = list.length;
  if (ui.lookFilter === 'liked') list = list.filter((l) => l.liked);
  const months = new Map();
  for (const l of list) { const k = l.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(l); }
  app.innerHTML = `<div class="chips"><button class="chip ${ui.lookFilter === 'all' ? 'on' : ''}" data-lf="all">전체<i>${total}</i></button><button class="chip ${ui.lookFilter === 'liked' ? 'on' : ''}" data-lf="liked">♥ 좋아요</button></div>
    ${list.length ? [...months.entries()].map(([k, ls]) => `<h3 class="month">${k.slice(0, 4)}년 ${Number(k.slice(5))}월</h3><div class="masonry">${ls.map((l) => `<a class="pin" href="#/look/${l.id}">${lookThumb(l, l.photos && l.photos.length ? 'tall' : '')}
        <div class="pin-body"><div class="pin-name">${fmtDate(l.date)} ${l.liked ? '<span class="heart">♥</span>' : ''}</div>
        <div class="pin-foot">${l.weather ? `${l.weather.tmin}°~${l.weather.tmax}°` : ''}${l.feel ? ' · ' + FEEL[l.feel] : ''}</div></div></a>`).join('')}</div>`).join('')
      : empty('기록된 룩이 없어요', '오늘 화면에서 추천을 고르거나, 사진으로 직접 기록해 보세요. 예전 사진도 올릴 수 있습니다.')}
    <a class="fab" href="#/le/new" aria-label="룩 기록">＋</a>`;
  $$('[data-lf]').forEach((b) => (b.onclick = () => { ui.lookFilter = b.dataset.lf; render(); }));
}
function viewLook(id) {
  const l = store.get('looks', id);
  if (!l) { app.innerHTML = empty('찾을 수 없어요', ''); return; }
  setHeader(fmtDate(l.date), '#/looks');
  const its = l.itemIds.map((x) => store.get('items', x));
  const live = its.filter(Boolean);
  const total = Math.round(live.reduce((s, it) => s + ((C.warmthOf(it, S()) || {}).score || 0), 0) * 10) / 10;
  const contrast = live.filter((it) => it.cat !== 'shoes' && it.weave).map((it) => `${C.textureWord(C.textureOf(it, S()))} ${esc(it.name)}`).join(' + ');
  app.innerHTML = `${(l.photos || []).length ? `<div class="gallery">${l.photos.map((p) => `<div class="photo"><img data-photo="${esc(p)}" alt=""></div>`).join('')}</div>` : ''}
    <section class="card"><div class="lookhead"><div><h2>${fmtDate(l.date)}</h2><p class="muted">${[l.occasion, l.weather ? `체감 ${l.weather.tmin}°~${l.weather.tmax}°` : '', l.weather && l.weather.code != null ? WMO(l.weather.code) : ''].filter(Boolean).map(esc).join(' · ')}</p></div>
      <button class="like ${l.liked ? 'on' : ''}" id="like" aria-label="좋아요">♥</button></div>
      <h4>오늘 어땠나요</h4><div class="chips">${Object.entries(FEEL).map(([k, t]) => `<button class="chip ${l.feel === k ? 'on' : ''}" data-feel="${k}">${t}</button>`).join('')}</div>
      ${l.memo ? `<p>${esc(l.memo)}</p>` : ''}</section>
    <section class="card"><h3>입은 옷 <span class="muted small">보온 합계 ${total}</span></h3>
      ${its.map((it) => it ? `<a class="simrow" href="#/d/items/${it.id}">${thumb(it)}<div><b>${esc(it.name)}</b><div class="pin-sub"><span class="badge soft">${C.CAT_LABEL[it.cat]}</span>${fitBadges(it)}</div></div></a>` : '<div class="simrow muted">지워진 옷</div>').join('')}
      ${contrast ? `<h4>질감 조합</h4><p class="lead">${contrast}</p>` : ''}</section>
    <div class="btnrow"><a class="btn" href="#/le/${l.id}">${(l.photos || []).length ? '고치기' : '사진 붙이기 · 고치기'}</a><button class="btn ghost danger" id="del">지우기</button></div>`;
  $('#like').onclick = () => { l.liked = !l.liked; store.upsert('looks', l); render(); };
  $$('[data-feel]').forEach((b) => (b.onclick = () => { l.feel = l.feel === b.dataset.feel ? null : b.dataset.feel; store.upsert('looks', l); render(); }));
  $('#del').onclick = () => { if (!confirm('이 룩을 지울까요?')) return; (l.photos || []).forEach(dropPhoto); store.remove('looks', id); go('#/looks'); };
}
function viewLookEdit(id) {
  const isNew = id === 'new';
  const base = isNew ? { id: store.newId(), date: today(), itemIds: [], photos: [], weather: null, occasion: ui.occasion || S().occasions[0], feel: null, liked: false, memo: '' } : store.get('looks', id);
  if (!base) { app.innerHTML = empty('찾을 수 없어요', ''); return; }
  const l = JSON.parse(JSON.stringify(base));
  const origDate = l.date;
  let dateTouched = !isNew, pickCat = 'top';
  const removed = [];
  setHeader(isNew ? '룩 기록' : '룩 고치기', true);
  const draw = () => {
    const pool = items().filter((i) => i.cat === pickCat && (i.status !== 'gone' || l.itemIds.includes(i.id)));
    app.innerHTML = `<form id="f" class="form">
      <section class="card"><h3>사진 <span class="muted small">최대 3장 · 없어도 됩니다</span></h3>
        <div class="minis">${l.photos.map((p, i) => `<div class="mini"><div class="thumb"><img data-photo="${esc(p)}_t" alt=""></div><button type="button" class="btn sm ghost" data-pdel="${i}">빼기</button></div>`).join('')}</div>
        ${l.photos.length < 3 ? `<label class="filebtn">사진 고르기<input id="photo" type="file" accept="image/*" multiple hidden></label>` : ''}</section>
      <section class="card"><div class="row2"><label>날짜<input id="date" type="date" value="${l.date}" max="${today()}"></label>
        <label>상황<select id="occ">${S().occasions.map((o) => `<option ${l.occasion === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label></div>
        <label>메모<textarea id="memo" rows="2">${esc(l.memo)}</textarea></label></section>
      <section class="card"><h3>입은 옷 <span class="muted small">${l.itemIds.length}개 고름</span></h3>
        <div class="chips scroll">${C.CATS.map((c) => `<button type="button" class="chip ${pickCat === c ? 'on' : ''}" data-pc="${c}">${C.CAT_LABEL[c]}</button>`).join('')}</div>
        ${pool.length ? `<div class="picker">${pool.map((it) => `<button type="button" class="pick ${l.itemIds.includes(it.id) ? 'on' : ''}" data-pick="${it.id}">${thumb(it)}<span>${esc(it.name)}</span></button>`).join('')}</div>` : '<p class="muted small">이 분류에 등록된 옷이 없습니다.</p>'}</section>
      <div class="btnrow sticky"><button class="btn full" type="submit">저장</button></div></form>`;
    hydrate();
    const keep = () => { l.date = $('#date').value || l.date; l.occasion = $('#occ').value; l.memo = $('#memo').value; };
    $('#date').onchange = () => { dateTouched = true; };
    $$('[data-pc]').forEach((b) => (b.onclick = () => { keep(); pickCat = b.dataset.pc; draw(); }));
    $$('[data-pick]').forEach((b) => (b.onclick = () => { const k = b.dataset.pick; l.itemIds = l.itemIds.includes(k) ? l.itemIds.filter((x) => x !== k) : [...l.itemIds, k]; keep(); draw(); }));
    $$('[data-pdel]').forEach((b) => (b.onclick = () => { keep(); removed.push(...l.photos.splice(+b.dataset.pdel, 1)); draw(); }));
    if ($('#photo')) $('#photo').onchange = async (e) => {
      keep();
      const files = [...e.target.files].slice(0, 3 - l.photos.length);
      try {
        for (const file of files) {
          const p = await savePhoto('l' + l.id, file);
          if (!l.photos.length && !dateTouched && p.date <= today()) l.date = p.date; // 첫 사진의 촬영일을 날짜로
          l.photos.push(p.key);
        }
      } catch (err) { toast(err.message); }
      draw();
    };
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); keep();
      if (!l.itemIds.length && !l.photos.length) return toast('옷이나 사진 중 하나는 넣어 주세요.');
      if (!l.weather || l.date !== origDate) {
        try { l.weather = await weatherForDate(l.date); } catch { l.weather = null; toast('그날 날씨는 불러오지 못했어요.'); }
      }
      removed.forEach(dropPhoto);
      store.upsert('looks', l); location.replace(`#/look/${l.id}`);
    };
  };
  draw();
}

// ---------- 계절 정리 ----------
async function viewSeason() {
  setHeader('계절 정리', '#/closet');
  app.innerHTML = '<p class="muted pagehint">앞으로의 기온과 지난 1년 날씨를 불러오는 중…</p>';
  let next, year = null;
  try { next = await loadNext(); } catch (e) { app.innerHTML = empty('예보를 불러오지 못했어요', esc(e.message)); return; }
  try { year = await fetchDaily('year'); } catch { /* 지난 날씨가 없으면 기회 일수 없이 판단 */ }
  if (currentRoute() !== 'season') return;
  const bases = next.map((d) => d.base);
  const p = C.seasonPlan(items(), looks(), S(), bases, year, today());
  const row = (x, acts) => `<div class="simrow">${thumb(x.item)}<div class="grow"><a href="#/d/items/${x.item.id}"><b>${esc(x.item.name)}</b></a>
      <div class="diffs">${(x.reasons || [x.range ? `입기 좋은 기온 ${x.range}` : '']).filter(Boolean).map((r) => `<span>${esc(r)}</span>`).join('')}</div>
      <div class="acts">${acts}</div></div></div>`;
  const VERD = { keep: ['유지 추천', '입을 기회가 적었어요.'], sell: ['처분 추천', '지금 몸에 맞지 않을 가능성이 있어요.'], check: ['처분 검토', '기회는 있었는데 거의 입지 않았어요.'] };
  app.innerHTML = `<section class="card"><div class="basis-row"><span>앞으로 ${next.length}일 기준 온도</span><b>${Math.round(Math.min(...bases))}° ~ ${Math.round(Math.max(...bases))}°</b></div>
      <p class="muted small">달력이 아니라 실제 예보로 판단합니다. 옷마다 「내 옷장의 다른 옷과 입었을 때 보온 목표에 들어오는 기온」을 계산해 견줍니다.</p></section>
    <section class="card"><h3>꺼낼 옷 <span class="muted small">${p.takeOut.length}벌</span></h3>
      ${p.takeOut.length ? p.takeOut.map((x) => row(x, `<button class="btn sm" data-act="active" data-id="${x.item.id}">꺼냈어요</button>`)).join('') + (p.takeOut.length > 1 ? '<button class="btn sm ghost full" data-all="active">모두 꺼냈어요</button>' : '') : '<p class="muted small">보관 중인 옷 가운데 지금 기온에 맞는 것이 없습니다.</p>'}</section>
    <section class="card"><h3>넣을 옷 <span class="muted small">${p.putAway.length}벌</span></h3>
      ${p.putAway.length ? p.putAway.map((x) => row(x, `<button class="btn sm" data-act="stored" data-id="${x.item.id}">보관했어요</button>`)).join('') + (p.putAway.length > 1 ? '<button class="btn sm ghost full" data-all="stored">모두 보관했어요</button>' : '') : '<p class="muted small">지금 입는 옷은 모두 앞으로의 기온에 맞습니다.</p>'}</section>
    <section class="card"><h3>처분 검토 <span class="muted small">${p.review.length}벌</span></h3>
      ${p.review.length ? p.review.map((x) => `<div class="verdict ${x.verdict}"><b>${VERD[x.verdict][0]}</b> ${VERD[x.verdict][1]}</div>` + row(x, `<button class="btn sm ghost" data-keep="${x.item.id}">유지</button><button class="btn sm ghost danger" data-act="gone" data-id="${x.item.id}">처분</button>`)).join('')
        : `<p class="muted small">보유한 지 ${S().season.reviewMonths}개월이 넘고 최근 1년에 ${S().season.reviewMaxWears}회 이하로 입은 옷이 없습니다.${year ? '' : ' (지난 날씨를 불러오지 못해 기회 일수는 빼고 봤습니다.)'}</p>`}</section>`;
  hydrate();
  const set = (id, status) => { const it = store.get('items', id); if (!it) return; it.status = status; it.statusAt = today(); store.upsert('items', it); };
  $$('[data-act]').forEach((b) => (b.onclick = () => { set(b.dataset.id, b.dataset.act); if (b.dataset.act === 'gone') return go(`#/d/items/${b.dataset.id}`); render(); }));
  $$('[data-all]').forEach((b) => (b.onclick = () => { (b.dataset.all === 'active' ? p.takeOut : p.putAway).forEach((x) => set(x.item.id, b.dataset.all)); render(); }));
  $$('[data-keep]').forEach((b) => (b.onclick = () => { const it = store.get('items', b.dataset.keep); it.reviewedAt = today(); store.upsert('items', it); toast(`${S().season.snoozeMonths}개월 동안 다시 묻지 않을게요.`); render(); }));
}

// ---------- 기준 설정 ----------
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }
function inp(path, type = 'num', attrs = '') {
  const v = getPath(S(), path);
  if (type === 'str') return `<input data-p="${path}" data-t="str" value="${esc(v)}" ${attrs}>`;
  if (type === 'list') return `<input data-p="${path}" data-t="list" value="${esc((v || []).join(', '))}" ${attrs}>`;
  return `<input data-p="${path}" data-t="num" type="number" step="any" inputmode="decimal" value="${v ?? ''}" ${attrs}>`;
}
function sec(key, title, body, note = '') {
  return `<details class="card sec" data-sec="${key}" ${ui.open.has(key) ? 'open' : ''}><summary>${title}</summary>${note ? `<p class="muted small">${note}</p>` : ''}${body}</details>`;
}
function boundsRow(label, stagesPath, boundsPath, unit) {
  const stages = getPath(S(), stagesPath), bounds = getPath(S(), boundsPath);
  let h = `<div class="brow"><div class="blabel">${label}</div><div class="bline">`;
  stages.forEach((s, i) => { h += `<span class="bstage">${esc(s)}</span>`; if (i < bounds.length) h += inp(`${boundsPath}.${i}`, 'num', `class="bnum" placeholder="${unit}" aria-label="${esc(s)}와 ${esc(stages[i + 1])}의 경계"`); });
  return h + '</div></div>';
}
function viewSettings() {
  setHeader('기준 설정', false);
  const s = S();
  const bodyF = [['height', '키'], ['shoulder', '어깨너비'], ['chest', '가슴둘레'], ['waist', '허리둘레'], ['hip', '엉덩이둘레'], ['thigh', '허벅지둘레'], ['inseam', '다리 안쪽 길이']];
  const stageInputs = (path) => getPath(s, path).map((_, i) => inp(`${path}.${i}`, 'str')).join('');
  const hasSample = [...store.list('items'), ...store.list('looks')].some((x) => x.sample);
  app.innerHTML = `<p class="muted pagehint">여기서 고친 값은 바로 판정과 추천에 반영됩니다.</p>
    ${sec('conn', '저장 연결', `<p class="muted small">${store.connected ? `비공개 저장소 <b>${esc(store.conn.owner)}/${esc(store.conn.repo)}</b>에 저장하고 있습니다.` : '지금은 이 기기에만 저장됩니다. 접근 키를 넣으면 비공개 저장소에 보관됩니다.'}</p><a class="btn ghost full" href="#/connect">연결 설정 열기</a>`)}
    ${sec('body', '내 몸', `<div class="grid2">${bodyF.map(([k, n]) => `<label>${n}${inp('body.' + k, 'num', 'placeholder="cm"')}</label>`).join('')}</div>
      ${(s.bodyLog || []).length ? `<h4>바꾼 기록</h4>${s.bodyLog.slice(-5).reverse().map((b) => `<p class="muted small">${b.date} · ${bodyF.filter(([k]) => b[k] != null).map(([k, n]) => `${n} ${b[k]}`).join(' · ')}</p>`).join('')}` : ''}`, '넣은 항목만큼 「내 몸보다 몇 cm 여유」가 표시됩니다.')}
    ${sec('fit', '핏 단계와 경계값', `
      <h4>단계 이름</h4>
      <label>상의·이너<div class="stagerow">${stageInputs('fit.top.stages')}</div></label>
      <label>아우터<div class="stagerow">${stageInputs('fit.outer.stages')}</div></label>
      <label>하의 통<div class="stagerow">${stageInputs('fit.bottomWidth.stages')}</div></label>
      <label>하의 형태 <span class="muted small">(밑단이 넓은 쪽부터)</span><div class="stagerow">${stageInputs('fit.bottomShape.stages')}</div></label>
      <label>기장<div class="stagerow">${stageInputs('fit.length.stages')}</div></label>
      <h4>경계값 <span class="muted small">단계 사이의 칸에 넣습니다</span></h4>
      ${boundsRow('하의 통 — 밑단단면', 'fit.bottomWidth.stages', 'fit.bottomWidth.bounds', 'cm')}
      ${boundsRow('하의 형태 — 허벅지단면 − 밑단단면', 'fit.bottomShape.stages', 'fit.bottomShape.bounds', 'cm')}
      ${boundsRow('상의 — 가슴 여유 (가슴단면×2 − 내 가슴둘레)', 'fit.top.stages', 'fit.top.easeBounds', 'cm')}
      ${boundsRow('상의 — 가슴단면 (가슴둘레를 안 넣었을 때)', 'fit.top.stages', 'fit.top.absBounds', 'cm')}
      ${boundsRow('아우터 — 가슴 여유', 'fit.outer.stages', 'fit.outer.easeBounds', 'cm')}
      ${boundsRow('아우터 — 가슴단면', 'fit.outer.stages', 'fit.outer.absBounds', 'cm')}
      ${boundsRow('상의 기장 — 총장 ÷ 키', 'fit.length.stages', 'fit.length.topRatio', '0.00')}
      ${boundsRow('상의 기장 — 총장 (키를 안 넣었을 때)', 'fit.length.stages', 'fit.length.topAbs', 'cm')}
      ${boundsRow('아우터 기장 — 총장 ÷ 키', 'fit.length.stages', 'fit.length.outerRatio', '0.00')}
      ${boundsRow('아우터 기장 — 총장', 'fit.length.stages', 'fit.length.outerAbs', 'cm')}
      ${boundsRow('하의 기장 — 안쪽 기장 − 내 다리 안쪽 길이', 'fit.length.stages', 'fit.length.bottomDiff', 'cm')}
      ${boundsRow('하의 기장 — 총장', 'fit.length.stages', 'fit.length.bottomAbs', 'cm')}
      <h4>반팔·반바지</h4><div class="grid3"><label>반팔 소매 기준${inp('fit.shortSleeve')}</label><label>반바지 총장 기준${inp('fit.shortPants')}</label><label>보온 계수${inp('fit.shortCoef')}</label></div>`,
      '경계값은 비워 두었습니다. 직접 넣거나, 옷에 핏을 표시해 이웃한 두 단계에 옷이 생기면 그 사이가 경계로 쓰입니다.')}
    ${sec('range', '나에게 맞는 범위', (() => {
      const R = C.comfortRanges(items(), s);
      const rows = [['top', '상의·이너'], ['outer', '아우터'], ['bottom', '하의']].flatMap(([g, gn]) => (C.FEEL_PARTS[g] || []).filter(([k]) => R[g] && R[g][k]).map(([k, n]) => { const r = R[g][k]; return `<tr><th>${gn} ${n}</th><td>${r.n ? `${r.min}~${r.max}cm <span class="muted small">(${r.n}벌)</span>` : '—'}</td><td class="muted">${[r.smallMax !== null ? `작음 ≤${r.smallMax}` : '', r.bigMin !== null ? `큼 ≥${r.bigMin}` : ''].filter(Boolean).join(' · ')}</td></tr>`; }));
      return (rows.length ? `<table class="mtable">${rows.join('')}</table>` : '<p class="muted small">아직 「입어 보니」를 표시한 옷이 없습니다. 옷을 고칠 때 부위별로 작음·맞음·큼을 표시하면 여기에 범위가 생깁니다.</p>')
        + `<h4>계산 방식</h4><div class="grid2"><label>신축성으로 보는 폴리우레탄 %${inp('fit.stretchPct')}</label><label>신축성 여유(cm)${inp('fit.stretchAllow')}</label>
          <label>범위 허용 오차(cm)${inp('fit.rangeTol')}</label><label>몸 변화 알림 기준(cm)${inp('fit.bodyChangeAlert')}</label></div>`;
    })(), '옷마다 표시한 「입어 보니」에서 자동으로 나옵니다. 처분한 옷의 기록도 포함합니다. 단면 기준이며, 표시한 뒤 몸 치수가 바뀌었으면 그만큼 옮겨서 계산합니다.')}
    ${sec('season', '계절 정리와 비슷한 옷 알림', `<div class="grid2">
      <label>예보를 보는 날 수${inp('season.horizonDays')}</label><label>보온 목표 허용 오차${inp('season.bandTol')}</label>
      <label>처분 검토: 보유 개월${inp('season.reviewMonths')}</label><label>처분 검토: 1년 착용 이하${inp('season.reviewMaxWears')}</label>
      <label>기회가 적었다고 보는 일수${inp('season.minChanceDays')}</label><label>유지 후 다시 묻는 개월${inp('season.snoozeMonths')}</label>
      <label>비슷한 옷: 색 차이 한도${inp('dup.colorDist')}</label><label>비슷한 옷: 실측 차이 한도(cm)${inp('dup.measureDist')}</label></div>`)}
    ${sec('weather', '날씨와 추천', `<div class="grid2">
      <label>활동 시작 시각${inp('weather.startHour')}</label><label>활동 끝 시각${inp('weather.endHour')}</label>
      <label>겉옷을 넣는 일교차${inp('weather.diurnal')}</label><label>비 대비 강수확률(%)${inp('weather.rainProb')}</label>
      <label>추천 개수${inp('recommend.count')}</label><label>최근 며칠 입은 조합 제외${inp('recommend.excludeDays')}</label>
      <label>이 기온 이상이면 아우터 없이${inp('recommend.noOuterAbove')}</label><label>이 기온 미만이면 이너 사용${inp('recommend.innerBelow')}</label>
      <label>이 기온 미만이면 솜·다운 사용${inp('recommend.fillBelow')}</label><label>이 기온 이상이면 반팔·반바지 사용${inp('recommend.shortAbove')}</label>
      <label>체감 1건당 목표 이동${inp('recommend.feelStep')}</label><label>좋아요 조합 가산${inp('recommend.likeBonus')}</label></div>
      <label>비 오는 날 빼는 조직 <span class="muted small">쉼표로 구분</span>${inp('weather.rainAvoidWeaves', 'list')}</label>
      <h4>기본 지역 <span class="muted small">위치 권한이 없을 때</span></h4><div class="grid3"><label>이름${inp('weather.region.name', 'str')}</label><label>위도${inp('weather.region.lat')}</label><label>경도${inp('weather.region.lon')}</label></div>
      <label>상황 태그 <span class="muted small">쉼표로 구분</span>${inp('occasions', 'list')}</label>`)}
    ${sec('bands', '기온 구간별 보온 목표', `<table class="edit"><tr><th>체감 ≥</th><th>옷차림</th><th>최소</th><th>최대</th><th></th></tr>
      ${s.bands.map((_, i) => `<tr><td>${inp(`bands.${i}.min`)}</td><td>${inp(`bands.${i}.label`, 'str')}</td><td>${inp(`bands.${i}.lo`)}</td><td>${inp(`bands.${i}.hi`)}</td><td><button class="x" data-del="bands.${i}">×</button></td></tr>`).join('')}</table>
      <button class="btn sm ghost" data-add="bands">구간 추가</button>`, '기온이 높은 구간부터 차례로 적습니다. 상의+하의+아우터+이너의 보온 점수 합계가 이 범위에 들어오는 조합을 고릅니다.')}
    ${sec('materials', '소재 점수', `<div class="tscroll"><table class="edit"><tr><th>소재</th><th>보온</th>${TEX_AXES.map((a) => `<th>${a.name}</th>`).join('')}<th></th></tr>
      ${s.materials.map((_, i) => `<tr><td>${inp(`materials.${i}.name`, 'str')}</td><td>${inp(`materials.${i}.warmth`)}</td>${[0, 1, 2, 3].map((k) => `<td>${inp(`materials.${i}.d.${k}`)}</td>`).join('')}<td><button class="x" data-del="materials.${i}">×</button></td></tr>`).join('')}</table></div>
      <button class="btn sm ghost" data-add="materials">소재 추가</button>`, '보온은 소재 기본점수, 나머지 넷은 이 소재가 100%일 때 조직의 질감에 더해지는 값입니다.')}
    ${sec('weaves', '조직(짜임)', `<div class="tscroll"><table class="edit"><tr><th>조직</th><th>묶음</th><th>보온</th><th>근거</th>${TEX_AXES.map((a) => `<th>${a.name}</th>`).join('')}<th>견본</th><th></th></tr>
      ${s.weaves.map((w, i) => `<tr><td>${inp(`weaves.${i}.name`, 'str')}</td><td>${inp(`weaves.${i}.group`, 'str')}</td><td>${inp(`weaves.${i}.warmth`)}</td><td class="ev">${esc(w.ev || '—')}</td>${[0, 1, 2, 3].map((k) => `<td>${inp(`weaves.${i}.tex.${k}`)}</td>`).join('')}
        <td><select data-p="weaves.${i}.pattern" data-t="str">${PATTERNS.map((p) => `<option ${w.pattern === p ? 'selected' : ''}>${p}</option>`).join('')}</select></td><td><button class="x" data-del="weaves.${i}">×</button></td></tr>`).join('')}</table></div>
      <button class="btn sm ghost" data-add="weaves">조직 추가</button>`, '보온은 같은 두께일 때의 상대 계수입니다. 「근거」는 자료 조사에서 확인한 근거의 강도(강·중·약)이고, 약은 측정값 없이 원리와 평가 글에만 기댄 값입니다. 질감 넷은 1~5점의 출발값입니다.')}
    ${sec('coef', '두께·충전재 계수', `<div class="grid3">${Object.keys(s.thickness).map((k) => `<label>${esc(k)}${inp('thickness.' + k)}</label>`).join('')}</div>
      <div class="grid3">${Object.keys(s.fill).map((k) => `<label>충전재 ${esc(k)}${inp('fill.' + k)}</label>`).join('')}</div>
      <h4>색 조합</h4><div class="grid3"><label>한 룩의 유채색 수${inp('color.maxChromatic')}</label><label>넘칠 때 감점${inp('color.clashPenalty')}</label><label>톤온톤 가산${inp('color.toneOnToneBonus')}</label></div>`)}
    ${sec('data', '데이터 관리', `<div class="btnrow wrap"><button class="btn sm ghost" id="exp">전체 내보내기</button><label class="btn sm ghost">불러오기<input id="imp" type="file" accept="application/json" hidden></label>
      ${hasSample ? '<button class="btn sm ghost" id="rmsample">예시 데이터 지우기</button>' : ''}<button class="btn sm ghost danger" id="reset">기준을 처음 값으로</button></div>`, '「기준을 처음 값으로」는 내 몸 치수를 뺀 모든 기준을 되돌립니다.')}`;

  $$('details.sec').forEach((d) => (d.ontoggle = () => { if (d.open) ui.open.add(d.dataset.sec); else ui.open.delete(d.dataset.sec); }));
  $$('[data-p]').forEach((el) => (el.onchange = () => {
    const t = el.dataset.t;
    const v = t === 'num' ? nv(el.value) : t === 'list' ? el.value.split(',').map((x) => x.trim()).filter(Boolean) : el.value;
    setPath(S(), el.dataset.p, v);
    if (el.dataset.p.startsWith('body.')) { const log = (S().bodyLog ||= []); const e = { date: today(), ...S().body }; if (log.length && log[log.length - 1].date === e.date) log[log.length - 1] = e; else log.push(e); }
    store.saveSettings(); toast('반영했어요.');
  }));
  const blank = { bands: { min: 0, label: '', lo: 0, hi: 0 }, materials: { name: '', warmth: 2.5, d: [0, 0, 0, 0] }, weaves: { name: '', group: '기타', warmth: 1, tex: [2.5, 1.5, 2.5, 2.5], pattern: 'plain' } };
  $$('[data-add]').forEach((b) => (b.onclick = () => { S()[b.dataset.add].push(JSON.parse(JSON.stringify(blank[b.dataset.add]))); store.saveSettings(); render(); }));
  $$('[data-del]').forEach((b) => (b.onclick = () => { const [k, i] = b.dataset.del.split('.'); S()[k].splice(+i, 1); store.saveSettings(); render(); }));
  $('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportAll()], { type: 'application/json' })); a.download = `closet-${today()}.json`; a.click(); };
  $('#imp').onchange = async (e) => { try { store.importAll(await e.target.files[0].text()); toast('불러왔어요.'); render(); } catch { toast('파일을 읽지 못했습니다.'); } };
  $('#reset').onclick = () => { if (confirm('내 몸 치수를 뺀 모든 기준을 처음 값으로 되돌릴까요?')) { store.resetSettings(); render(); } };
  if ($('#rmsample')) $('#rmsample').onclick = () => { for (const k of ['items', 'looks']) store.list(k).filter((x) => x.sample).forEach((x) => store.remove(k, x.id)); toast('예시 데이터를 지웠어요.'); render(); };
}

function viewConnect() {
  setHeader('연결 설정', '#/settings');
  const c = store.conn;
  app.innerHTML = `<section class="card"><h3>비공개 저장소에 보관하기</h3>
      <p class="muted">옷·룩·사진을 GitHub 비공개 저장소에 저장합니다. 접근 키는 이 기기의 브라우저에만 보관됩니다.</p>
      <label>계정<input id="owner" value="${esc(c.owner)}" autocapitalize="off"></label>
      <label>저장소<input id="repo" value="${esc(c.repo)}" autocapitalize="off"></label>
      <label>접근 키<input id="token" type="password" value="${esc(c.token)}" placeholder="github_pat_…" autocomplete="off"></label>
      <div class="btnrow"><button class="btn" id="save">연결하고 맞추기</button>${store.connected ? '<button class="btn ghost danger" id="off">연결 끊기</button>' : ''}</div>
      <p class="muted small" id="msg">${store.status === 'error' ? esc(store.statusText) : store.status === 'synced' ? `마지막으로 맞춘 시각 ${esc(store.statusText)}` : ''}</p></section>
    <section class="card"><h3>접근 키 만드는 법</h3><ol class="steps">
      <li>GitHub → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token</li>
      <li>Repository access에서 <b>Only select repositories</b>를 고르고 <b>${esc(c.repo)}</b> 하나만 선택</li>
      <li>Permissions → Repository permissions → <b>Contents</b>를 <b>Read and write</b>로</li>
      <li>만들어진 키를 위 칸에 붙여 넣기</li></ol>
      <p class="muted small">이 키로는 그 저장소 하나만 읽고 쓸 수 있습니다.</p></section>`;
  $('#save').onclick = async () => {
    store.setConn({ owner: $('#owner').value.trim(), repo: $('#repo').value.trim(), token: $('#token').value.trim() });
    const msg = $('#msg'); msg.textContent = '확인하는 중…';
    try { await store.test(); await store.sync(); if (store.status === 'error') throw new Error(store.statusText); toast('연결했어요.'); render(); }
    catch (e) { msg.textContent = e.message; }
  };
  if ($('#off')) $('#off').onclick = () => { store.setConn({ token: '' }); store.setStatus('local'); render(); };
}

// ---------- 라우팅 ----------
const TABS = { today: 'today', closet: 'closet', d: 'closet', e: 'closet', compare: 'compare', looks: 'looks', look: 'looks', le: 'looks', settings: 'settings', connect: 'settings', season: 'closet' };
function parts() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); }
function currentRoute() { return parts()[0] || 'today'; }
function render() {
  const [r = 'today', a, b] = parts();
  const tab = r === 'd' || r === 'e' ? (a === 'candidates' ? 'compare' : 'closet') : TABS[r] || 'today';
  $$('#nav a').forEach((n) => n.classList.toggle('on', n.dataset.tab === tab));
  const views = { today: viewToday, closet: viewCloset, compare: viewCompare, looks: viewLooks, settings: viewSettings, connect: viewConnect, season: viewSeason,
    d: () => viewDetail(a, b), e: () => viewEdit(a, b), look: () => viewLook(a), le: () => viewLookEdit(a) };
  (views[r] || viewToday)();
  hydrate();
}

store.onStatus = renderStatus;
store.onChange = (fromSync) => { if (fromSync && !['e', 'le'].includes(currentRoute())) render(); };
store.init();
renderStatus();
$('#sync').onclick = () => (store.connected ? store.sync() : go('#/connect'));
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
render();
