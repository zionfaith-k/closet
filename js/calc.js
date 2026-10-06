// 핏 판정·보온도·질감·추천 계산. 화면과 저장에 의존하지 않는 순수 함수만 둔다.

export const CAT_LABEL = { top: '상의', bottom: '하의', outer: '아우터', inner: '이너', shoes: '신발' };
export const CATS = Object.keys(CAT_LABEL);

const TOP_M = [['length', '총장'], ['shoulder', '어깨너비'], ['chest', '가슴단면'], ['sleeve', '소매길이'], ['hem', '밑단단면']];
export const MEASURES = {
  top: TOP_M, outer: TOP_M, inner: TOP_M,
  bottom: [['length', '총장'], ['waist', '허리단면'], ['hip', '엉덩이단면'], ['thigh', '허벅지단면'], ['rise', '밑위'], ['hem', '밑단단면']],
  shoes: [],
};

export const num = (v) => typeof v === 'number' && !Number.isNaN(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r1 = (v) => Math.round(v * 10) / 10;
const fitGroup = (cat) => (cat === 'inner' ? 'top' : cat);

// 경계가 일부만 채워져 있어도, 값의 양옆 경계가 확정돼 있으면 단계를 정한다. 못 정하면 null.
export function classify(v, bounds) {
  const n = bounds.length;
  for (let k = 0; k <= n; k++) {
    const lower = k === 0 || (num(bounds[k - 1]) && v >= bounds[k - 1]);
    const upper = k === n || (num(bounds[k]) && v < bounds[k]);
    if (lower && upper) return k;
  }
  return null;
}

// 내가 라벨을 붙인 옷이 이웃한 두 단계에 모두 있으면, 그 사이를 경계로 쓴다.
export function personalBounds(defaults, labeled) {
  const bounds = [...defaults];
  const src = defaults.map(() => 'default');
  for (let i = 0; i < defaults.length; i++) {
    const lo = labeled.filter((x) => x.idx === i).map((x) => x.v);
    const hi = labeled.filter((x) => x.idx === i + 1).map((x) => x.v);
    if (lo.length && hi.length) {
      bounds[i] = r1((Math.max(...lo) + Math.min(...hi)) / 2);
      src[i] = 'mine';
    }
  }
  for (let i = 1; i < bounds.length; i++) if (num(bounds[i]) && num(bounds[i - 1]) && bounds[i] < bounds[i - 1]) bounds[i] = bounds[i - 1];
  return { bounds, src, ready: bounds.every(num) };
}

export function isShort(it, S) {
  const m = it.m || {};
  if (it.cat === 'bottom') return num(m.length) && m.length < S.fit.shortPants;
  if (it.cat === 'top' || it.cat === 'inner') return num(m.sleeve) && m.sleeve < S.fit.shortSleeve;
  return false;
}

// 축별로 판정에 쓰는 값과 기준을 돌려준다. 값이 없으면 null.
function axisMetric(it, S, axis) {
  const m = it.m || {};
  const b = S.body;
  const g = fitGroup(it.cat);
  if (g === 'shoes') return null;
  if (axis === 'main') {
    if (g === 'bottom') {
      if (!num(m.hem)) return null;
      return { v: m.hem, name: '밑단단면', unit: 'cm', stages: S.fit.bottomWidth.stages, bounds: S.fit.bottomWidth.bounds };
    }
    if (!num(m.chest)) return null;
    const cfg = S.fit[g];
    if (num(b.chest)) return { v: r1(m.chest * 2 - b.chest), name: '가슴 여유 (가슴단면×2 − 내 가슴둘레)', unit: 'cm', stages: cfg.stages, bounds: cfg.easeBounds };
    return { v: m.chest, name: '가슴단면', unit: 'cm', stages: cfg.stages, bounds: cfg.absBounds };
  }
  if (axis === 'shape') {
    if (g !== 'bottom' || !num(m.thigh) || !num(m.hem)) return null;
    return { v: r1(m.thigh - m.hem), name: '허벅지단면 − 밑단단면', unit: 'cm', stages: S.fit.bottomShape.stages, bounds: S.fit.bottomShape.bounds };
  }
  if (axis === 'length') {
    const L = S.fit.length;
    if (!num(m.length)) return null;
    if (g === 'bottom') {
      if (isShort(it, S)) return null;
      if (num(m.rise) && num(b.inseam)) return { v: r1(m.length - m.rise - b.inseam), name: '안쪽 기장 − 내 다리 안쪽 길이', unit: 'cm', stages: L.stages, bounds: L.bottomDiff };
      return { v: m.length, name: '총장', unit: 'cm', stages: L.stages, bounds: L.bottomAbs };
    }
    const outer = g === 'outer';
    if (num(b.height)) return { v: Math.round((m.length / b.height) * 1000) / 1000, name: '총장 ÷ 키', unit: '', stages: L.stages, bounds: outer ? L.outerRatio : L.topRatio };
    return { v: m.length, name: '총장', unit: 'cm', stages: L.stages, bounds: outer ? L.outerAbs : L.topAbs };
  }
  return null;
}

// pool = 비교 기준이 되는 내 옷들(자기 자신 제외).
export function fitAxis(it, S, pool, axis) {
  const met = axisMetric(it, S, axis);
  if (!met) return null;
  const g = fitGroup(it.cat);
  const peers = pool.filter((p) => fitGroup(p.cat) === g && p.id !== it.id);
  const labeled = [];
  const points = [];
  for (const p of peers) {
    const pm = axisMetric(p, S, axis);
    if (!pm) continue;
    const user = p.fitLabel && num(p.fitLabel[axis]) ? p.fitLabel[axis] : null;
    if (user !== null) labeled.push({ v: pm.v, idx: user });
    points.push({ id: p.id, name: p.name, v: pm.v, user });
  }
  const { bounds, src, ready } = personalBounds(met.bounds, labeled);
  const auto = classify(met.v, bounds); // 양옆 경계가 비어 있으면 null (자동 판정하지 않음)
  const user = it.fitLabel && num(it.fitLabel[axis]) ? it.fitLabel[axis] : null;
  const idx = user !== null ? user : auto;
  points.sort((a, b) => a.v - b.v);
  return { axis, ...met, bounds, src, ready, auto, user, idx, label: idx !== null ? met.stages[idx] || '' : '', points };
}

export function fitOf(it, S, pool) {
  return { main: fitAxis(it, S, pool, 'main'), shape: fitAxis(it, S, pool, 'shape'), length: fitAxis(it, S, pool, 'length'), reach: reachOf(it, S) };
}

// 총장이 몸 어디까지 오는지 (비율로 어림한 추정)
export function reachOf(it, S) {
  const m = it.m || {};
  const b = S.body;
  if (!num(m.length)) return null;
  if (it.cat === 'bottom') {
    if (isShort(it, S) || !num(m.rise) || !num(b.inseam)) return null;
    const d = m.length - m.rise - b.inseam;
    if (d < -12) return '발목 위로 꽤 올라옴';
    if (d < -4) return '발목이 드러남';
    if (d < 2) return '발목에서 신발 등에 닿음';
    if (d < 6) return '신발 위에서 살짝 접힘';
    return '바닥에 끌릴 수 있음';
  }
  if (it.cat === 'shoes' || !num(b.height)) return null;
  const h = (0.85 * b.height - m.length) / b.height; // 밑단 높이 ÷ 키
  if (h > 0.6) return '허리선 위';
  if (h > 0.53) return '골반 근처';
  if (h > 0.47) return '엉덩이를 절반쯤 덮음';
  if (h > 0.4) return '엉덩이를 다 덮음';
  if (h > 0.3) return '허벅지 중간';
  return '무릎 근처 또는 그 아래';
}

// 내 몸 대비 여유분
export function easeOf(it, S) {
  const m = it.m || {};
  const b = S.body;
  const out = {};
  if (num(m.chest) && num(b.chest)) out.chest = r1(m.chest * 2 - b.chest);
  if (num(m.shoulder) && num(b.shoulder)) out.shoulder = r1(m.shoulder - b.shoulder);
  if (num(m.waist) && num(b.waist)) out.waist = r1(m.waist * 2 - b.waist);
  if (num(m.hip) && num(b.hip)) out.hip = r1(m.hip * 2 - b.hip);
  if (num(m.thigh) && num(b.thigh)) out.thigh = r1(m.thigh * 2 - b.thigh);
  return out;
}

function matParts(it) {
  const mats = (it.materials || []).filter((x) => x.name && x.pct > 0);
  const tot = mats.reduce((s, x) => s + x.pct, 0);
  return { mats, tot };
}

export function warmthOf(it, S) {
  if (it.cat === 'shoes') return null;
  const { mats, tot } = matParts(it);
  const base = tot
    ? mats.reduce((s, x) => s + ((S.materials.find((mm) => mm.name === x.name) || {}).warmth ?? S.unknownMaterialWarmth) * x.pct, 0) / tot
    : S.unknownMaterialWarmth;
  const thick = S.thickness[it.thickness] ?? 1;
  const wv = S.weaves.find((w) => w.name === it.weave);
  const weave = wv ? wv.warmth : 1;
  const fill = it.cat === 'outer' ? (S.fill[it.fill] ?? 0) : 0;
  const short = isShort(it, S) ? S.fit.shortCoef : 1;
  return { score: r1((base * thick * weave + fill) * short), base: r1(base), thick, weave, fill, short, known: tot > 0 };
}

export function textureOf(it, S) {
  if (Array.isArray(it.texOverride) && it.texOverride.length === 4) return it.texOverride;
  const wv = S.weaves.find((w) => w.name === it.weave);
  const t = wv ? [...wv.tex] : [2.5, 1.5, 2.5, 2.5];
  const { mats, tot } = matParts(it);
  if (tot) {
    for (const x of mats) {
      const mm = S.materials.find((q) => q.name === x.name);
      if (mm) mm.d.forEach((d, i) => { t[i] += (d * x.pct) / tot; });
    }
  }
  const th = S.thickness[it.thickness] ?? 1;
  t[3] += th < 1 ? -1 : th > 1 ? 1 : 0;
  return t.map((v) => r1(clamp(v, 1, 5)));
}

export function textureText(t) {
  const s = t[0] <= 2 ? '매끈하고' : t[0] <= 3.5 ? '은은한 결이 있고' : '거칠고 결이 뚜렷하며';
  const g = t[1] <= 1.7 ? '무광에' : t[1] <= 3 ? '은은한 광이 돌고' : '윤기가 있고';
  const d = t[2] <= 2 ? '빳빳하게 형태가 잡히는' : t[2] <= 3.3 ? '적당히 떨어지는' : '흐르듯 떨어지는';
  const k = t[3] <= 2 ? '얇은' : t[3] <= 3.5 ? '중간 두께의' : '묵직한';
  return `${s} ${g} ${d} ${k} 원단`;
}

export function textureWord(t) {
  const s = t[0] <= 2 ? '매끈한' : t[0] <= 3.5 ? '결 있는' : '거친';
  return t[1] > 3 ? `윤기 나는 ${s}` : t[3] > 3.5 ? `묵직하고 ${s}` : s;
}

// 실측이 비슷한 내 옷
export function similarByMeasure(target, pool, n = 3) {
  const keys = (MEASURES[target.cat] || []).map((x) => x[0]);
  const g = fitGroup(target.cat);
  const res = [];
  for (const p of pool) {
    if (p.id === target.id || fitGroup(p.cat) !== g) continue;
    const diffs = {};
    let ss = 0, c = 0;
    for (const k of keys) {
      const a = (target.m || {})[k], b = (p.m || {})[k];
      if (num(a) && num(b)) { diffs[k] = r1(a - b); ss += (a - b) ** 2; c++; }
    }
    if (c >= 2) res.push({ item: p, dist: Math.sqrt(ss / c), diffs });
  }
  return res.sort((a, b) => a.dist - b.dist).slice(0, n);
}

export function similarByTexture(target, pool, S, n = 3) {
  const t = textureOf(target, S);
  return pool
    .filter((p) => p.id !== target.id && p.cat !== 'shoes' && p.weave)
    .map((p) => { const q = textureOf(p, S); return { item: p, tex: q, dist: Math.sqrt(q.reduce((s, v, i) => s + (v - t[i]) ** 2, 0)) }; })
    .sort((a, b) => a.dist - b.dist).slice(0, n);
}

// ---------- 색 ----------
export function hexToHsl(hex) {
  const h = (hex || '#888888').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return { h: hue, s, l };
}
export function guessFamily(hex) {
  const { s, l } = hexToHsl(hex);
  if (s < 0.1 || l < 0.08 || l > 0.95) return '무채색';
  return s < 0.4 ? '뉴트럴' : '유채색';
}
const bucket = (hex) => Math.round(hexToHsl(hex).h / 30) % 12;

export function colorScore(items, S) {
  const notes = [];
  let score = 0;
  const chroma = new Set(items.filter((i) => i.colorFamily === '유채색').map((i) => bucket(i.color)));
  if (chroma.size > S.color.maxChromatic) score -= S.color.clashPenalty * (chroma.size - S.color.maxChromatic);
  const tinted = items.filter((i) => i.colorFamily !== '무채색' && i.cat !== 'inner');
  let tone = false;
  for (let i = 0; i < tinted.length; i++) for (let j = i + 1; j < tinted.length; j++) {
    if (bucket(tinted[i].color) === bucket(tinted[j].color) && Math.abs(hexToHsl(tinted[i].color).l - hexToHsl(tinted[j].color).l) >= 0.15) tone = true;
  }
  if (tone) { score += S.color.toneOnToneBonus; notes.push('톤온톤'); }
  return { score, notes };
}

// ---------- 추천 ----------
export function bandFor(temp, S) {
  return S.bands.find((b) => temp >= b.min) || S.bands[S.bands.length - 1];
}

// 체감 기록으로 목표를 옮긴다. 추웠다가 많으면 +, 더웠다가 많으면 −.
export function feelOffset(looks, S) {
  const R = S.recommend;
  const rated = looks.filter((l) => l.feel).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, R.feelWindow);
  const cold = rated.filter((l) => l.feel === 'cold').length, hot = rated.filter((l) => l.feel === 'hot').length;
  return { offset: clamp((cold - hot) * R.feelStep, -R.feelMax, R.feelMax), cold, hot, n: rated.length };
}

const comboKey = (ids) => [...ids].sort().join('|');

// ctx = { tmin, tmax, rain(강수확률), occasion, today:'YYYY-MM-DD' }
export function recommend(items, looks, S, ctx) {
  const R = S.recommend;
  const base = (ctx.tmin + ctx.tmax) / 2;
  const band = bandFor(base, S);
  const fo = feelOffset(looks, S);
  const lo = band.lo + fo.offset, hi = band.hi + fo.offset, mid = (lo + hi) / 2;
  const swing = ctx.tmax - ctx.tmin >= S.weather.diurnal;
  const rainy = ctx.rain >= S.weather.rainProb;
  const info = { base: r1(base), band, lo: r1(lo), hi: r1(hi), offset: fo.offset, feel: fo, swing, rainy };

  const ok = (i) => (!ctx.occasion || !i.occasion || i.occasion === '둘 다' || i.occasion === ctx.occasion)
    && !(rainy && S.weather.rainAvoidWeaves.includes(i.weave));
  const by = (c) => items.filter((i) => i.cat === c && ok(i));
  const tops = by('top'), bottoms = by('bottom'), shoes = by('shoes');
  const outerOk = by('outer').filter((o) => base < R.fillBelow || !o.fill || o.fill === '없음');
  const outers = base >= R.noOuterAbove && !swing ? [null] : swing ? outerOk : [null, ...outerOk];
  const inners = base < R.innerBelow ? [null, ...by('inner')] : [null];
  if (!tops.length || !bottoms.length) return { info, combos: [], reason: !tops.length ? '조건에 맞는 상의가 없습니다.' : '조건에 맞는 하의가 없습니다.' };
  const outerList = outers.length ? outers : [null];

  const w = new Map(items.map((i) => [i.id, (warmthOf(i, S) || { score: 0 }).score]));
  const since = new Date(Date.parse(ctx.today) - R.excludeDays * 864e5).toISOString().slice(0, 10);
  const recent = new Set(looks.filter((l) => l.date >= since).map((l) => comboKey(l.itemIds.filter((id) => { const it = items.find((x) => x.id === id); return it && it.cat !== 'shoes'; }))));
  const likedPairs = new Set();
  for (const l of looks.filter((x) => x.liked)) {
    for (let i = 0; i < l.itemIds.length; i++) for (let j = i + 1; j < l.itemIds.length; j++) likedPairs.add(comboKey([l.itemIds[i], l.itemIds[j]]));
  }

  const all = [];
  for (const t of tops) for (const b of bottoms) for (const o of outerList) for (const n of inners) {
    const set = [o, t, n, b].filter(Boolean);
    const ids = set.map((x) => x.id);
    if (recent.has(comboKey(ids))) continue;
    const total = r1(set.reduce((s, x) => s + w.get(x.id), 0));
    const dist = total < lo ? lo - total : total > hi ? total - hi : 0;
    const cs = colorScore(set, S);
    let pairs = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (likedPairs.has(comboKey([ids[i], ids[j]]))) pairs++;
    const notes = [...cs.notes];
    if (pairs) notes.push('좋아요 조합');
    if (swing && o) notes.push('일교차 대비 겉옷');
    const score = -dist * 2 - Math.abs(total - mid) * 0.2 + cs.score + pairs * R.likeBonus - (n ? 0.2 : 0);
    all.push({ items: set, total, dist: r1(dist), score, notes });
  }
  all.sort((a, b) => b.score - a.score);

  // 같은 옷만 반복되지 않게 고른다.
  const picked = [];
  const usedPair = new Set();
  const want = R.count * 5;
  while (picked.length < want) {
    const topCount = new Map();
    let added = 0;
    for (const c of all) {
      if (added >= R.count) break;
      const t = c.items.find((x) => x.cat === 'top').id, b = c.items.find((x) => x.cat === 'bottom').id;
      const pk = `${t}|${b}`;
      if (usedPair.has(pk) || (topCount.get(t) || 0) >= 2) continue;
      usedPair.add(pk); topCount.set(t, (topCount.get(t) || 0) + 1);
      picked.push(c); added++;
    }
    if (!added) break;
  }
  // 신발은 색이 가장 잘 맞는 것으로 붙인다.
  for (const c of picked) {
    if (!shoes.length) break;
    let best = null, bs = -1e9;
    for (const s of shoes) { const sc = colorScore([...c.items, s], S).score; if (sc > bs) { bs = sc; best = s; } }
    c.items = [...c.items, best];
  }
  return { info, combos: picked };
}

// ---------- 착용 이력 ----------
export function wearStats(itemId, looks, items) {
  const mine = looks.filter((l) => l.itemIds.includes(itemId)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const co = new Map();
  for (const l of mine) for (const id of l.itemIds) if (id !== itemId) co.set(id, (co.get(id) || 0) + 1);
  const partners = [...co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([id, n]) => ({ item: items.find((x) => x.id === id), n })).filter((x) => x.item);
  const temps = mine.filter((l) => l.weather && num(l.weather.tmin)).flatMap((l) => [l.weather.tmin, l.weather.tmax]);
  return {
    count: mine.length, last: mine[0] ? mine[0].date : null, looks: mine, partners,
    tempRange: temps.length ? [Math.min(...temps), Math.max(...temps)] : null,
    feels: { hot: mine.filter((l) => l.feel === 'hot').length, ok: mine.filter((l) => l.feel === 'ok').length, cold: mine.filter((l) => l.feel === 'cold').length },
  };
}
