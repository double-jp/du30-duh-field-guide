// 앱 아이콘 생성기 — 외부 라이브러리 없이 PNG/SVG를 직접 만든다.
// 디자인: 가이드 본문의 브랜드 마크(어두운 사각형 + "DU")를 그대로 따르고,
// 아래 강조선은 DU30 파랑 / DUH 청록으로 나눠 칠한다.
import zlib from 'node:zlib';

const INK = [0x16, 0x21, 0x2b];
const PAPER = [0xec, 0xef, 0xec];
const DU30 = [0x1d, 0x5f, 0xb0];
const DUH = [0x0c, 0x77, 0x66];

// 100×100 설계 좌표계에서의 도형 판정
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

function letterD(x, y) {
  const outer = inRect(x, y, 18, 30, 33, 70) || (x >= 33 && inEllipse(x, y, 33, 50, 15, 20));
  const inner = inRect(x, y, 27, 39, 33, 61) || (x >= 33 && inEllipse(x, y, 33, 50, 6, 11));
  return outer && !inner;
}
function letterU(x, y) {
  const outer = inRect(x, y, 54, 30, 82, 56) || (y >= 56 && inEllipse(x, y, 68, 56, 14, 14));
  const inner = inRect(x, y, 63, 29, 73, 56) || (y >= 56 && inEllipse(x, y, 68, 56, 5, 5));
  return outer && !inner;
}
function inRoundRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 100 - r);
  const cy = Math.min(Math.max(y, r), 100 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= 0 && x <= 100 && y >= 0 && y <= 100;
}

// 한 점의 색 (RGBA). maskable이면 배경을 꽉 채우고 글자를 안전영역 안으로 줄인다.
function sample(x, y, { maskable }) {
  if (!maskable && !inRoundRect(x, y, 22)) return [0, 0, 0, 0];
  const k = maskable ? 0.78 : 1;
  const gx = 50 + (x - 50) / k, gy = 52 + (y - 50) / k; // 글자 묶음을 살짝 위로
  if (letterD(gx, gy) || letterU(gx, gy)) return [...PAPER, 255];
  if (inRect(gx, gy, 18, 76, 48, 80)) return [...DU30, 255];
  if (inRect(gx, gy, 54, 76, 82, 80)) return [...DUH, 255];
  return [...INK, 255];
}

function render(size, opts) {
  const SS = 4; // 4×4 슈퍼샘플링 안티앨리어싱
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
        const x = ((i + (si + 0.5) / SS) / size) * 100;
        const y = ((j + (sj + 0.5) / SS) / size) * 100;
        const c = sample(x, y, opts);
        r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
      }
      const o = (j * size + i) * 4;
      if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; }
      px[o + 3] = a / (SS * SS);
    }
  }
  return encodePNG(size, size, px);
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
export const SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="${hex(INK)}"/>
<g transform="translate(0 2)">
<path fill="${hex(PAPER)}" fill-rule="evenodd" d="M18 30H33A15 20 0 0 1 33 70H18ZM27 39V61H33A6 11 0 0 0 33 39Z"/>
<path fill="${hex(PAPER)}" d="M54 30H63V56A5 5 0 0 0 73 56V30H82V56A14 14 0 0 1 54 56Z"/>
<rect x="18" y="76" width="30" height="4" fill="${hex(DU30)}"/>
<rect x="54" y="76" width="28" height="4" fill="${hex(DUH)}"/>
</g>
</svg>
`;

export function makeIcons() {
  return {
    'icons/icon-192.png': render(192, { maskable: false }),
    'icons/icon-512.png': render(512, { maskable: false }),
    'icons/icon-maskable-512.png': render(512, { maskable: true }),
    'icons/apple-touch-icon.png': render(180, { maskable: true }), // iOS는 자체적으로 모서리를 깎는다
    'icons/favicon.svg': Buffer.from(SVG_ICON),
  };
}
