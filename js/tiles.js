// 조직별 무늬를 옷 색으로 칠한 질감 견본 타일 (SVG)
let uid = 0;

function shade(hex, amt) {
  const h = (hex || '#b8b0a4').replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const t = amt < 0 ? 0 : 255, a = Math.abs(amt);
  return '#' + c.map((v) => Math.round(v + (t - v) * a).toString(16).padStart(2, '0')).join('');
}

const SPECK = [[1, 1], [5, 2], [3, 5], [7, 6], [0, 7], [6, 0], [2, 3], [4, 7]];

export function tileSVG(pattern, color = '#b8b0a4') {
  const id = 'tp' + uid++;
  const dk = shade(color, -0.22), dk2 = shade(color, -0.42), lt = shade(color, 0.22);
  const pat = (w, h, body, pid = id) => `<pattern id="${pid}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${body}</pattern>`;
  const sheen = (pid, strength) => `<linearGradient id="${pid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity="${strength}"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>`;
  const dots = (size, r, n = 8) => SPECK.slice(0, n).map(([x, y], i) => `<circle cx="${(x * size) / 8 + r}" cy="${(y * size) / 8 + r}" r="${r}" fill="${i % 2 ? dk2 : lt}" opacity="${i % 2 ? 0.3 : 0.4}"/>`).join('');
  let defs = '', fills = [id];
  switch (pattern) {
    case 'oxford': defs = pat(4, 4, `<rect width="2" height="2" fill="${dk}" opacity=".32"/><rect x="2" y="2" width="2" height="2" fill="${lt}" opacity=".4"/>`); break;
    case 'twill': defs = pat(4, 4, `<path d="M-1 1l2-2M0 4l4-4M3 5l2-2" stroke="${dk}" stroke-width=".9" opacity=".45"/>`); break;
    case 'denim': defs = pat(3, 3, `<path d="M-1 1l2-2M0 3l3-3M2 4l2-2" stroke="${lt}" stroke-width=".9" opacity=".6"/>`); break;
    case 'cord': defs = pat(6, 6, `<rect width="3.6" height="6" fill="${lt}" opacity=".3"/><rect x="3.6" width="2.4" height="6" fill="${dk2}" opacity=".38"/>`); break;
    case 'linen': defs = pat(12, 12, `<path d="M0 2h7M3 6h9M1 10h6" stroke="${dk}" stroke-width=".6" opacity=".38"/><path d="M2 0v8M7 3v9M10 0v5" stroke="${lt}" stroke-width=".6" opacity=".5"/>`); break;
    case 'tweed': defs = pat(8, 8, SPECK.map(([x, y], i) => `<rect x="${x}" y="${y}" width="1.3" height="1.3" fill="${i % 2 ? dk2 : lt}" opacity=".6"/>`).join('') + `<path d="M0 8l8-8" stroke="${dk}" stroke-width=".5" opacity=".3"/>`); break;
    case 'satin': defs = sheen(id, 0.55); break;
    case 'taffeta': defs = sheen(id, 0.32) + pat(2, 2, `<path d="M0 0h2" stroke="${dk}" stroke-width=".3" opacity=".3"/>`, id + 'b'); fills = [id + 'b', id]; break;
    case 'jersey': defs = pat(1.5, 3, `<path d="M0 0v3" stroke="${dk}" stroke-width=".4" opacity=".28"/>`); break;
    case 'waffle': defs = pat(6, 6, `<rect x=".9" y=".9" width="4.2" height="4.2" rx=".7" fill="${dk}" opacity=".32"/><path d="M0 0h6M0 0v6" stroke="${lt}" stroke-width=".8" opacity=".5"/>`); break;
    case 'rib': defs = pat(4, 4, `<rect width="1.6" height="4" fill="${dk}" opacity=".36"/><rect x="1.6" width=".6" height="4" fill="${lt}" opacity=".4"/>`); break;
    case 'fineknit': defs = pat(3, 3, `<path d="M0 0l1.5 2.2L3 0" fill="none" stroke="${dk}" stroke-width=".5" opacity=".42"/>`); break;
    case 'chunky': defs = pat(8, 8, `<path d="M0 0l4 6L8 0" fill="none" stroke="${dk2}" stroke-width="1.6" stroke-linecap="round" opacity=".42"/><path d="M0 1.6l4 6L8 1.6" fill="none" stroke="${lt}" stroke-width=".7" opacity=".5"/>`); break;
    case 'sweat': defs = pat(6, 6, dots(6, 0.35, 6)); break;
    case 'fleece': defs = pat(10, 10, dots(10, 1.5)); break;
    case 'leather': defs = sheen(id, 0.4) + pat(7, 7, dots(7, 0.3, 5), id + 'b'); fills = [id + 'b', id]; break;
    case 'suede': defs = pat(5, 5, dots(5, 0.32)); break;
    case 'mesh': defs = pat(5, 5, `<circle cx="2.5" cy="2.5" r="1.3" fill="${dk2}" opacity=".55"/>`); break;
    default: defs = pat(2, 2, `<path d="M0 0h2M0 0v2" stroke="${dk}" stroke-width=".3" opacity=".25"/>`);
  }
  return `<svg class="tile" viewBox="0 0 60 60" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>${defs}</defs><rect width="60" height="60" fill="${color}"/>${fills.map((f) => `<rect width="60" height="60" fill="url(#${f})"/>`).join('')}</svg>`;
}
