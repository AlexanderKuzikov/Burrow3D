/* Сборка Burrow3D в один самодостаточный HTML-файл.
   ---------------------------------------------------------------------------
   `node scripts/build.js` → `dist/burrow3d.html`

   Идея: исходники не меняются. Сборщик берёт `index.html` и подставляет в него
   `maps.js`, `biomes.js`, three.js и пропсы. Единственный источник правды остаётся
   `index.html` — «четвёртого» файла приложения не появляется.

   three.js вкладывается как `data:`-URL в importmap. Это проверено на `file://`:
   модуль с data:-URL грузится и без сети, и без сервера. Альтернатива — склейка
   модулей в один (срезать `export`, заменить `import` на деструктуризацию)
   дала бы файл на 500 КБ меньше, но требует правки исходников three.js, а они
   чужие и меняются с каждой версией.

   Пропсы вкладываются так же: `props/` на `file://` прочитать нельзя (fetch
   заблокирован), а артефакт должен открываться двойным кликом. Манифест едет
   строкой и разбирается тем же кодом, что и скачанный, — второго пути разбора
   манифеста не появляется.

   Правило сборщика: каждая подстановка обязана состояться ровно один раз,
   иначе сборка падает. Молчаливый промах означал бы тихо нерабочий артефакт.
   ------------------------------------------------------------------------- */

'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(__dirname, 'vendor');
const PROPS = path.join(ROOT, 'props');
const DIST = path.join(ROOT, 'dist');
const OUT_FILE = path.join(DIST, 'burrow3d.html');

const THREE_VERSION = '0.169.0';
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;
/* Ровно эти файлы и нужны: импорты движка перечислены в шапке index.html. */
const VENDOR_FILES = {
  'three.module.js': `${CDN}/build/three.module.js`,
  'OrbitControls.js': `${CDN}/examples/jsm/controls/OrbitControls.js`,
  'BufferGeometryUtils.js': `${CDN}/examples/jsm/utils/BufferGeometryUtils.js`,
  'GLTFLoader.js': `${CDN}/examples/jsm/loaders/GLTFLoader.js`,
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

/* Единственное место, где правим чужой исходник: см. ниже в подстановке importmap. */
function gltfLoaderUrl() {
  const src = fs.readFileSync(path.join(VENDOR, 'GLTFLoader.js'), 'utf8');
  const from = `from '../utils/BufferGeometryUtils.js'`;
  const to = `from 'three/addons/utils/BufferGeometryUtils.js'`;
  const n = src.split(from).length - 1;
  if (n !== 1) {
    throw new Error(`GLTFLoader.js: ожидался 1 относительный импорт BufferGeometryUtils, ` +
                    `найден ${n} — three обновился, правь сборщик`);
  }
  return 'data:text/javascript;base64,' + Buffer.from(src.split(from).join(to), 'utf8').toString('base64');
}

/* Пропсы для артефакта: манифест строкой (разбирает тот же код, что и скачанный)
   и файлы как `data:`-URL. Прописать их имёнем нельзя — на `file://` GLTFLoader
   до файла не дотянется, и набор «Лес-Поле» вышел бы пустым ровно в том файле,
   который отдают заказчику. */
function propsBlob() {
  const manifest = path.join(PROPS, 'manifest.json');
  if (!fs.existsSync(manifest)) {
    throw new Error('props/manifest.json нет — выполни `npm run props`, иначе артефакт получится без пропсов');
  }
  let m;
  try { m = JSON.parse(fs.readFileSync(manifest, 'utf8')); }
  catch (e) { throw new Error('props/manifest.json не читается как JSON: ' + e.message); }
  const files = {};
  let missing = 0;
  for (const entry of m.models || []) {
    const f = path.join(PROPS, entry.file);
    if (!fs.existsSync(f)) { console.error(`warn  пропса нет на диске: ${entry.file}`); missing++; continue; }
    files[entry.file] = 'data:model/gltf-binary;base64,' + fs.readFileSync(f).toString('base64');
  }
  if (missing) throw new Error(`пропсов на диске не хватает: файлов ${missing} — выполни npm run props`);
  return { manifest: fs.readFileSync(manifest, 'utf8'), files };
}

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

  /* 2. Пропсы. Классический скрипт перед модулем: window.BURROW_PROPS обязан
        существовать до первого обращения, а module отложен. */
  const props = propsBlob();
  const np = Object.keys(props.files).length;
  out = replaceOnce(out, /<script type="module">/,
    `<script>window.BURROW_PROPS = ${inlineSafe(JSON.stringify(props))};</script>\n<script type="module">`,
    'вставка пропсов');
  console.log(`  пропсы внутри: ${np} файлов, ${(Object.values(props.files)
    .reduce((s, u) => s + u.length, 0) / 1048576).toFixed(2)} МБ`);

  /* 3. importmap: three и оба аддона как data:-URL. Аддоны адресуются точно
        теми путями, которыми их импортирует движок, — префиксное сопоставление
        не годится, к data:-URL нельзя относительно достроить путь. */
  const imports = {
    'three': dataUrl('three.module.js'),
    'three/addons/controls/OrbitControls.js': dataUrl('OrbitControls.js'),
    'three/addons/utils/BufferGeometryUtils.js': dataUrl('BufferGeometryUtils.js'),
    /* GLTFLoader тянет относительный импорт ../utils/BufferGeometryUtils.js, и к
       его data:-URL относительно ничего не достроить — такой импорт упадёт.
       Перевешиваем его на тот же точный путь, что и у движка: ровно один импорт,
       иначе сборка падает, а не оставляет тихо нерабочий артефакт. */
    'three/addons/loaders/GLTFLoader.js': gltfLoaderUrl(),
  };
  out = replaceOnce(out, /<script type="importmap">[\s\S]*?<\/script>/,
    `<script type="importmap">${JSON.stringify({ imports })}</script>`, 'подстановка importmap');

  /* 4. Сторож загрузки three.js с CDN в автономном файле бесполезен: сети нет,
        и «не загрузилось с CDN» обманчиво. Сам `__MAP_READY = false` нужен —
        на нём ждут автотесты. */
  out = replaceOnce(out, /setTimeout\(function \(\) \{[\s\S]*?\}, 9000\);\n?/,
    '', 'удаление сторожа CDN');

  /* 5. Сборка в шапке: сообщение про исходники должно быть верным и там,
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