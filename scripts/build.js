/* Сборка Burrow3D в один самодостаточный HTML-файл.
   ---------------------------------------------------------------------------
   `node scripts/build.js` → `dist/burrow3d.html`

   Идея: исходники не меняются. Сборщик берёт `index.html` и подставляет в него
   `maps.js`, `biomes.js` и three.js. Единственный источник правды остаётся
   `index.html` — «четвёртого» файла приложения не появляется.

   three.js вкладывается как `data:`-URL в importmap. Это проверено на `file://`:
   модуль с data:-URL грузится и без сети, и без сервера. Альтернатива — склейка
   модулей в один (срезать `export`, заменить `import` на деструктуризацию)
   дала бы файл на 500 КБ меньше, но требует правки исходников three.js, а они
   чужие и меняются с каждой версией.

   Правило сборщика: каждая подстановка обязана состояться ровно один раз,
   иначе сборка падает. Молчаливый промах означал бы тихо нерабочий артефакт.
   ------------------------------------------------------------------------- */

'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(__dirname, 'vendor');
const DIST = path.join(ROOT, 'dist');
const OUT_FILE = path.join(DIST, 'burrow3d.html');

const THREE_VERSION = '0.169.0';
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;
/* Ровно эти три файла и нужны: импорты движка перечислены в шапке index.html. */
const VENDOR_FILES = {
  'three.module.js': `${CDN}/build/three.module.js`,
  'OrbitControls.js': `${CDN}/examples/jsm/controls/OrbitControls.js`,
  'BufferGeometryUtils.js': `${CDN}/examples/jsm/utils/BufferGeometryUtils.js`,
};

/* ── подстановки ─────────────────────────────────────────────────────────── */

/* Заменить ровно один фрагмент. Ноль или два совпадения — ошибка сборки:
   в первом случае артефакт получился не тот, во втором мы правим не то место. */
function replaceOnce(src, re, to, what) {
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`«${what}»: ожидалось 1 совпадение, найдено ${n}. Файл изменился — правь сборщик.`);
  return src.replace(re, to);
}

/* Встроенный скрипт не должен содержать последовательность `</script` — иначе
   парсер HTML закроет тег раньше времени. Внутри строк, регулярных выражений
   и комментариев `\/` читается как `/`, так что подстановка безопасна. */
const inlineSafe = src => src.replace(/<\/script/gi, '<\\/script');

const dataUrl = name =>
  'data:text/javascript;base64,' +
  fs.readFileSync(path.join(VENDOR, name)).toString('base64');

/* ── вендор ──────────────────────────────────────────────────────────────── */

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('слишком много перенаправлений: ' + url));
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, dest, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + ' → HTTP ' + res.statusCode)); }
      const tmp = dest + '.tmp';
      const f = fs.createWriteStream(tmp);
      res.pipe(f).on('finish', () => f.close(() => { fs.renameSync(tmp, dest); resolve(); }));
    }).on('error', reject);
  });
}

async function ensureVendor() {
  fs.mkdirSync(VENDOR, { recursive: true });
  for (const [name, url] of Object.entries(VENDOR_FILES)) {
    const dest = path.join(VENDOR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
      console.log(`  есть   ${name} (${(fs.statSync(dest).size / 1024).toFixed(0)} КБ)`);
      continue;
    }
    process.stdout.write(`  качаю ${name} … `);
    await download(url, dest);
    console.log((fs.statSync(dest).size / 1024).toFixed(0) + ' КБ');
  }
}

/* ── сборка ──────────────────────────────────────────────────────────────── */

function build() {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  let out = read('index.html');

  /* 1. Карты и наборы оформления — обычные скрипты, вставляем их содержимое.
        Порядок важен: движок читает window.DEMO_MAPS и window.BIOMES при старте. */
  out = replaceOnce(out, /<script src="maps\.js"><\/script>/,
    `<script>\n${inlineSafe(read('maps.js'))}\n</script>`, 'подстановка maps.js');
  out = replaceOnce(out, /<script src="biomes\.js"><\/script>/,
    `<script>\n${inlineSafe(read('biomes.js'))}\n</script>`, 'подстановка biomes.js');

  /* 2. importmap: three и оба аддона как data:-URL. Аддоны адресуются точно
        теми путями, которыми их импортирует движок, — префиксное сопоставление
        не годится, к data:-URL нельзя относительно достроить путь. */
  const imports = {
    'three': dataUrl('three.module.js'),
    'three/addons/controls/OrbitControls.js': dataUrl('OrbitControls.js'),
    'three/addons/utils/BufferGeometryUtils.js': dataUrl('BufferGeometryUtils.js'),
  };
  out = replaceOnce(out, /<script type="importmap">[\s\S]*?<\/script>/,
    `<script type="importmap">${JSON.stringify({ imports })}</script>`, 'подстановка importmap');

  /* 3. Сторож загрузки three.js с CDN в автономном файле бесполезен: сети нет,
        и «не загрузилось с CDN» обманчиво. Сам `__MAP_READY = false` нужен —
        на нём ждут автотесты. */
  out = replaceOnce(out, /setTimeout\(function \(\) \{[\s\S]*?\}, 9000\);\n?/,
    '', 'удаление сторожа CDN');

  /* 4. Сборка в шапке: сообщение про исходники должно быть верным и там,
        где их нет. */
  out = replaceOnce(out, /'maps\.js не загрузился'/,
    `'maps.js не загрузился или не вложен сборкой'`, 'текст ошибки карт');
  out = replaceOnce(out, /'biomes\.js не загрузился'/,
    `'biomes.js не загрузился или не вложен сборкой'`, 'текст ошибки наборов');

  if (/https?:\/\/(cdn\.jsdelivr\.net|unpkg\.com)/.test(out)) {
    throw new Error('в артефакте осталась ссылка на CDN — автономность нарушена');
  }

  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(OUT_FILE, out, 'utf8');
  return out;
}

(async () => {
  console.log('three.js ' + THREE_VERSION + ':');
  await ensureVendor();
  const out = build();
  const mb = (Buffer.byteLength(out, 'utf8') / 1048576).toFixed(2);
  console.log('готово: dist/burrow3d.html (' + mb + ' МБ) — открывается двойным кликом, сеть не нужна');
})().catch(e => { console.error('сборка не удалась: ' + e.message); process.exit(1); });