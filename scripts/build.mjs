// 단일 HTML 가이드 → 설치형 웹앱(PWA) 빌드
//   node scripts/build.mjs [원본.html]
// 원본을 지정하지 않으면 source/ 폴더의 .html 파일(하나만 둘 것)을 쓴다.
// 결과물은 dist/ 에 생기며, 이 폴더를 그대로 웹서버(HTTPS)에 올리면 된다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeIcons } from './icons.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const hash = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
const fail = msg => { console.error('빌드 실패: ' + msg); process.exit(1); };

// ── 1. 원본 찾기 ──
let src = process.argv[2];
if (!src) {
  const dir = path.join(ROOT, 'source');
  const htmls = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.html')).map(f => path.join(dir, f));
  if (!htmls.length) fail('source/ 폴더에 .html 파일이 없습니다.');
  // GitHub에서 받은 파일은 수정 시각이 모두 같아 '최신'을 고를 수 없으므로 하나만 허용
  if (htmls.length > 1) fail('source/ 폴더에 .html 파일이 여러 개입니다. 배포할 파일 하나만 남기세요:\n  ' + htmls.map(f => path.basename(f)).join('\n  '));
  src = htmls[0];
}
let html = fs.readFileSync(src, 'utf8');
console.log('원본:', path.relative(ROOT, src) || src, `(${(html.length / 1048576).toFixed(1)} MB)`);

// ── 2. 내장 이미지(base64)를 개별 파일로 분리 ──
const ASSET_RE = /(<script type="application\/json" id="assets">)([\s\S]*?)(<\/script>)/;
const m = html.match(ASSET_RE);
if (!m) fail('원본에서 <script id="assets"> 블록을 찾지 못했습니다.');
const assets = JSON.parse(m[2]);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'img'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });

const files = new Map(); // dist 상대경로 → Buffer (서비스워커 사전 캐시 목록 겸용)
const map = {};
let imgBytes = 0;
for (const [key, dataUrl] of Object.entries(assets)) {
  const mm = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/s.exec(dataUrl);
  if (!mm) fail(`이미지 "${key}" 형식을 알 수 없습니다.`);
  const ext = mm[1] === 'svg+xml' ? 'svg' : mm[1] === 'jpeg' ? 'jpg' : mm[1];
  const buf = Buffer.from(mm[2], 'base64');
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  const rel = `img/${safe}.${hash(buf)}.${ext}`; // 내용 해시 → 바뀐 이미지만 새로 받음
  files.set(rel, buf);
  map[key] = rel;
  imgBytes += buf.length;
}
// asset(key)가 data URL 대신 파일 경로를 돌려주도록 매핑만 남긴다
html = html.replace(ASSET_RE, (_, a, __, c) => a + JSON.stringify(map) + c);
console.log(`이미지 ${Object.keys(map).length}장 분리 (${(imgBytes / 1048576).toFixed(1)} MB)`);

// ── 3. 아이콘 / 매니페스트 / PWA 스크립트 ──
for (const [rel, buf] of Object.entries(makeIcons())) files.set(rel, buf);

const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'DU30 · DUH 현장 작업 가이드'])[1].trim();
const manifest = {
  id: './',
  name: title,
  short_name: 'DU30·DUH',
  description: 'DU30 · DUH 설치와 CV 복원 현장 작업 가이드 (오프라인 사용 가능)',
  lang: 'ko',
  dir: 'ltr',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#ECEFEC',
  theme_color: '#16212B',
  categories: ['productivity', 'utilities'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
};
files.set('manifest.webmanifest', Buffer.from(JSON.stringify(manifest, null, 2)));
files.set('pwa.js', fs.readFileSync(path.join(ROOT, 'pwa', 'pwa.js')));
files.set('pwa.css', fs.readFileSync(path.join(ROOT, 'pwa', 'pwa.css')));

// ── 4. HTML에 PWA 연결 ──
const HEAD = `
<meta name="description" content="${manifest.description}">
<meta name="theme-color" content="#ECEFEC" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D1317" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="DU30·DUH">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="stylesheet" href="pwa.css">`;
const INSTALL_BTN = `<button class="pwa-install" id="pwa-install" type="button" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>앱으로 설치</button>
    `;
const inject = (re, fn, what) => {
  if (!re.test(html)) fail(`HTML에서 ${what} 위치를 찾지 못했습니다.`);
  html = html.replace(re, fn);
};
inject(/<\/title>/, t => t + HEAD, '<title>');
inject(/<div class="side-foot">/, t => INSTALL_BTN + t, '사이드바 하단(side-foot)');
inject(/<\/body>/, t => '<script src="pwa.js" defer></script>\n' + t, '</body>');
files.set('index.html', Buffer.from(html));

// ── 5. 서비스워커: 모든 파일을 사전 캐시, 버전 = 전체 내용 해시 ──
const precache = ['./', ...[...files.keys()].sort()];
const version = hash(Buffer.concat([...files.keys()].sort().flatMap(k => [Buffer.from(k), files.get(k)])));
const sw = fs.readFileSync(path.join(ROOT, 'pwa', 'sw.template.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(precache.map(p => (p === './' ? p : './' + p)), null, 2));
files.set('sw.js', Buffer.from(sw));

// GitHub Pages가 파일을 가공하지 않도록
files.set('.nojekyll', Buffer.alloc(0));

// ── 6. 쓰기 ──
let total = 0;
for (const [rel, buf] of files) {
  fs.writeFileSync(path.join(DIST, rel), buf);
  total += buf.length;
}
console.log(`index.html ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB (원본 ${(fs.statSync(src).size / 1048576).toFixed(1)} MB)`);
console.log(`dist/ 파일 ${files.size}개, 총 ${(total / 1048576).toFixed(1)} MB, 버전 ${version}`);
