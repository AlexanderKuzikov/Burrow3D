/* Проверка целостности данных Burrow3D. Без зависимостей: node scripts/check.js
---------------------------------------------------------------------------
   Проверяет то, что нельзя увидеть глазами, пока сцена не упадёт в браузере:

   1. maps.js    — у каждой демо-карты ровные строки, размеры совпадают, лимит 512
   2. biomes.js  — у каждого набора есть обязательные поля, корректные пары цветов,
                    границы тумана в порядке возрастания, обрыв в границах [0;1]
   3. biomes ↔ BUILDERS — каждый упомянутый объект существует, каждый ключ в colors{}
                    и glow{} совпадает с id части этого объекта, каждый layer известен
   4. dist/skins — ВЫГРУЖЕННЫЕ скины: у каждого набора есть файл, у каждого правила
                    builder известен, solid совпадает с BUILDERS и не встречается у
                    свободной клетки и дороги, плотности в 0.., размер сетки плотностей
                    равен ceil(w/cell) × ceil(h/cell), map.hash совпадает с картой,
                    а состав правил совпадает с biomes.js — иначе кожа устарела

   Именно эти четыре класса ошибок проскакивали при написании набора вручную.
   Пункт 4 требует `npm run export`: чек читает выгруженное, а не генерирует его.
   ------------------------------------------------------------------------- */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const errors = [];
const warnings = [];
const fail = m => errors.push(m);
const warn = m => warnings.push(m);

function loadGlobal(file, name) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: file });
  if (!ctx.window[name]) fail(`${file}: не экспортирует window.${name}`);
  return ctx.window[name];
}

/* ── BUILDERS вытаскиваем из движка: модуль не исполняем (там WebGL) ── */
function parseBuilders() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const from = html.indexOf('const BUILDERS = {');
  const to = html.indexOf('\n};', from);
  if (from < 0 || to < 0) { fail('index.html: не найден блок BUILDERS'); return {}; }
  const block = html.slice(from, to);
  const starts = [...block.matchAll(/^  (\w+): \{ solid: (true|false),$/gm)]
    .map(m => ({ name: m[1], solid: m[2] === 'true', at: m.index }));
  const out = {};
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].at : block.length;
    out[s.name] = {
      solid: s.solid,
      ids: [...block.slice(s.at, end).matchAll(/id: '(\w+)'/g)].map(m => m[1]),
    };
  });
  return out;
}

const HEX = /^0x[0-9a-fA-F]{1,8}$/;
const isHex = v => typeof v === 'number' || HEX.test(v);
const isHexPair = v => Array.isArray(v) && v.length === 2 && v.every(isHex);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

/* Хэш карты нужен чеку, чтобы сверить `map.hash`. Функция живёт в движке — там
   же `fbm` и экспортёр, — но сама чистая и маленькая, поэтому вытаскиваем её
   текстом, ровно как уже вытаскиваем BUILDERS. */
function parseMapHash() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const found = html.match(/function mapHash\(map\) \{[\s\S]*?\n\}/g) || [];
  if (found.length !== 1) {
    fail(`index.html: функция mapHash найдена ${found.length} раз — сверить map.hash нечем`);
    return () => '';
  }
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(found[0] + '\nglobalThis.__mapHash = mapHash;', ctx, { filename: 'index.html#mapHash' });
  return ctx.__mapHash;
}

/* ── 1. карты ── */
const DEMO = loadGlobal('maps.js', 'DEMO_MAPS') || [];
if (!Array.isArray(DEMO) || !DEMO.length) fail('maps.js: DEMO_MAPS пуст');
for (const m of DEMO) {
  if (!Array.isArray(m.grid) || !m.grid.length) { fail(`${m.name}: нет grid`); continue; }
  const h = m.grid.length, w = m.grid[0].length;
  if (m.width !== w || m.height !== h) fail(`${m.name}: width/height ${m.width}×${m.height} ≠ сетке ${w}×${h}`);
  if (w > 512 || h > 512) fail(`${m.name}: ${w}×${h} больше лимита 512`);
  const bad = m.grid.map((r, i) => [i, r]).filter(([, r]) => r.length !== w);
  if (bad.length) fail(`${m.name}: строки разной длины (номера ${bad.map(([i]) => i).join(',')})`);
  if (new Set(m.grid.join('')).size < 2) warn(`${m.name}: один символ на всю карту — проверь, что это задумано`);
}

/* ── 2-3. наборы против движка ── */
const BUILDERS = parseBuilders();
const BIOMES = loadGlobal('biomes.js', 'BIOMES') || {};
const biomeIds = Object.keys(BIOMES);
if (!biomeIds.length) fail('biomes.js: ни одного набора');
const LAYERS = new Set(['plants', 'rocks', 'props']);
let rules = 0;

for (const [id, b] of Object.entries(BIOMES)) {
  const where = `набор «${id}»`;
  for (const k of ['name', 'note', 'sky', 'relief', 'ground', 'scatter']) {
    if (b[k] === undefined) fail(`${where}: нет поля ${k}`);
  }
  if (!b.sky) continue;

  for (const k of ['top', 'bottom', 'sun', 'fog']) if (!isHex(b.sky[k])) fail(`${where}: sky.${k} — цвет 0x…`);
  for (const k of ['hemiSky', 'hemiGround', 'fill']) if (!isHex(b.sky[k])) fail(`${where}: sky.${k} — цвет 0x…`);
  if (!Array.isArray(b.sky.sunDir) || b.sky.sunDir.length !== 3 || !b.sky.sunDir.every(isNum)) fail(`${where}: sky.sunDir — три числа`);
  if (!Array.isArray(b.sky.fogK) || b.sky.fogK.length !== 2 || !b.sky.fogK.every(isNum)) fail(`${where}: sky.fogK — [near, far] из двух чисел`);
  else if (b.sky.fogK[0] <= 0 || b.sky.fogK[1] <= b.sky.fogK[0]) fail(`${where}: sky.fogK должен расти: ${JSON.stringify(b.sky.fogK)}`);
  for (const k of ['exposure', 'sunI', 'hemiI', 'fillI']) if (!isNum(b.sky[k])) fail(`${where}: sky.${k} — число`);

  if (b.water !== null) {
    if (!isNum(b.water.level)) fail(`${where}: water.level — число`);
    else if (b.water.flood !== undefined && typeof b.water.flood !== 'boolean') fail(`${where}: water.flood — true/false`);
    else if (!b.water.flood && b.water.level > b.relief.base) {
      warn(`${where}: вода выше базовой отметки — суши не будет видно. Для намеренно затопленной карты поставь water.flood: true`);
    }
  }

  for (const k of ['amp', 'freq', 'oct', 'base', 'rimStart', 'rimEnd', 'rimDrop']) {
    if (!isNum(b.relief[k])) fail(`${where}: relief.${k} — число`);
  }
  if (isNum(b.relief.amp) && b.relief.amp <= 0) fail(`${where}: relief.amp должен быть больше нуля`);
  /* обрыв отсчитывается от границы карты в долях ширины поля: 0 — край карты,
     1 — край полотна. Вне этого порядка спад не начнётся или не закончится. */
  if ([b.relief.rimStart, b.relief.rimEnd].every(isNum)) {
    if (b.relief.rimStart < 0 || b.relief.rimEnd > 1 || b.relief.rimStart >= b.relief.rimEnd) {
      fail(`${where}: relief.rimStart/rimEnd должны идти по возрастанию внутри [0;1], ` +
           `а это ${b.relief.rimStart} → ${b.relief.rimEnd}`);
    }
  }
  if (b.relief.ridgeAmp !== undefined) {
    if (!isNum(b.relief.ridgeAmp) || b.relief.ridgeAmp < 0) fail(`${where}: relief.ridgeAmp — неотрицательное число`);
    if (b.relief.ridgeAmp > 0) {
      for (const k of ['ridgeFreq', 'ridgeOct']) if (!isNum(b.relief[k])) fail(`${where}: relief.${k} — число, если заданы горы`);
    }
  }

  for (const t of ['free', 'road', 'blocked']) if (!isHexPair(b.ground[t])) fail(`${where}: ground.${t} — пара цветов`);
  if (!['free', 'road', 'blocked'].every(t => isHexPair(b.ground[t]))) continue;

  for (const type of ['free', 'road', 'blocked']) {
    const specs = b.scatter[type];
    if (!Array.isArray(specs)) { fail(`${where}: scatter.${type} — массив`); continue; }
    for (const sp of specs) {
      rules++;
      const at = `${where} → ${type} → ${sp.b}`;
      const obj = BUILDERS[sp.b];
      if (!obj) { fail(`${at}: объекта нет в BUILDERS (доступны: ${Object.keys(BUILDERS).join(', ')})`); continue; }
      const parts = obj.ids;
      /* главное правило данных: свободная клетка и дорога проходимы.
         Препятствие (`solid`) там превратило бы свободную клетку в занятую
         и перекрыло дорогу — это ошибка, а не украшение. */
      if (obj.solid && (type === 'free' || type === 'road')) {
        fail(`${at}: объект непроходимый, а стоял бы на ${type === 'free' ? 'свободной' : 'дороге'} клетке. ` +
             `Перенеси в scatter.${type === 'free' ? 'blocked' : 'blocked'} или возьми проходимый объект`);
      }
      if (!parts.length) fail(`${at}: у объекта нет ни одной части с id`);
      if (sp.layer !== undefined && !LAYERS.has(sp.layer)) fail(`${at}: неизвестный layer «${sp.layer}»`);
      if (sp.per !== undefined && !(isNum(sp.per) && sp.per >= 0)) fail(`${at}: per — неотрицательное число`);
      for (const key of ['colors', 'glow']) {
        if (sp[key] === undefined) continue;
        for (const id2 of Object.keys(sp[key])) {
          if (!parts.includes(id2)) fail(`${at}: в ${key} нет части «${id2}» (есть: ${parts.join(', ')})`);
        }
      }
      if (sp.scale !== undefined) {
        const ok = isNum(sp.scale) || (Array.isArray(sp.scale) && sp.scale.length === 2 && sp.scale.every(isNum));
        if (!ok) fail(`${at}: scale — число или пара`);
        else if (Array.isArray(sp.scale) && sp.scale[0] > sp.scale[1]) fail(`${at}: scale перевёрнут`);
      }
    }
  }
}

/* ── 3. симметрия правил: набор без объектов — бессмысленен ── */
for (const [id, b] of Object.entries(BIOMES)) {
  const n = ['free', 'road', 'blocked'].reduce((s, t) => s + (b.scatter[t] ? b.scatter[t].length : 0), 0);
  if (n === 0) fail(`набор «${id}»: ни одного правила расстановки`);
}

/* ── 4. выгруженные скины ───────────────────────────────────────────────────
   Контракт не содержит перечислений, поэтому проверять тут нечем «сверху»:
   берём каждый файл и спрашиваем его по правилам самого контракта. */
const mapHash = parseMapHash();
const SKINS = path.join(ROOT, 'dist', 'skins');
const HEXP = /^#[0-9a-f]{6}$/;
const CELL_TYPES = ['free', 'road', 'blocked'];
const SKIN_CELL = 8;
const SKIN_LAYERS = new Set(['plants', 'rocks', 'props']);

function checkSkin(skin, where) {
  if (!skin || typeof skin !== 'object') { fail(`${where}: не объект JSON`); return; }

  if (skin.version !== 1) fail(`${where}: version ${JSON.stringify(skin.version)} — контракт версии 1`);
  if (typeof skin.name !== 'string' || !skin.name) fail(`${where}: name — непустая строка`);
  else if (!BIOMES[skin.name]) fail(`${where}: набор «${skin.name}» не существует в biomes.js`);

  /* карта: хэш должен совпадать с реальной картой такого размера */
  const m = skin.map || {};
  if (!Number.isInteger(m.width) || !Number.isInteger(m.height)) fail(`${where}: map.width/height — целые числа`);
  const src = DEMO.find(x => x.width === m.width && x.height === m.height);
  if (!src) fail(`${where}: в maps.js нет карты ${m.width}×${m.height} — сверять hash не с чем`);
  else if (mapHash({ w: src.width, h: src.height, grid: src.grid }) !== m.hash) {
    fail(`${where}: map.hash не совпадает с картой «${src.name}»`);
  }

  for (const t of CELL_TYPES) {
    const p = skin.ground && skin.ground[t];
    if (!Array.isArray(p) || p.length !== 2 || !p.every(v => typeof v === 'string' && HEXP.test(v))) {
      fail(`${where}: ground.${t} — пара строк #rrggbb`);
    }
  }
  for (const k of ['blockedLift', 'roadFlatten', 'roadSink']) {
    if (!isNum(skin.relief && skin.relief[k])) fail(`${where}: relief.${k} — число`);
  }
  if (!skin.light || typeof skin.light !== 'object') fail(`${where}: light — объект с полями sky и water`);
  else if (!skin.light.sky || typeof skin.light.sky !== 'object') fail(`${where}: light.sky — объект`);

  const sc = skin.scatter || {};
  if (sc.cell !== SKIN_CELL) fail(`${where}: scatter.cell — ${SKIN_CELL}, а не ${JSON.stringify(sc.cell)}`);
  if (!Array.isArray(sc.rules) || !sc.rules.length) { fail(`${where}: scatter.rules — непустой массив`); return; }

  /* кожа устарела, если набор в biomes.js изменился после выгрузки */
  const biome = BIOMES[skin.name];
  if (biome) {
    const declared = CELL_TYPES.reduce((n, t) => n + (((biome.scatter || {})[t] || []).length), 0);
    if (sc.rules.length !== declared) {
      fail(`${where}: в наборе ${declared} правил, а в файле ${sc.rules.length} — кожа устарела, выполни npm run export`);
    }
  }

  const want = Math.ceil(m.width / SKIN_CELL) * Math.ceil(m.height / SKIN_CELL);
  const ids = new Set();
  for (const [i, r] of sc.rules.entries()) {
    const at = `${where} → правило ${i}`;
    if (typeof r.id !== 'string' || !r.id) fail(`${at}: id — непустая строка`);
    else if (ids.has(r.id)) fail(`${at}: id «${r.id}» повторяется`);
    else ids.add(r.id);

    const obj = BUILDERS[r.builder];
    if (!obj) fail(`${at}: builder «${r.builder}» нет в BUILDERS (доступны: ${Object.keys(BUILDERS).join(', ')})`);
    if (typeof r.solid !== 'boolean') fail(`${at}: solid — true или false`);
    else if (obj && r.solid !== obj.solid) fail(`${at}: solid=${r.solid}, а в BUILDERS ${obj.solid}`);
    if (!CELL_TYPES.includes(r.cellType)) fail(`${at}: cellType «${r.cellType}» неизвестен`);
    /* главное правило данных: свободная клетка и дорога проходимы */
    else if (r.solid === true && r.cellType !== 'blocked') {
      fail(`${at}: непроходимый объект на клетке «${r.cellType}» — такого быть не должно, см. «Реестр объектов»`);
    }
    if (biome) {
      const inBiome = ((biome.scatter || {})[r.cellType] || []).some(s => s.b === r.builder);
      if (!inBiome) fail(`${at}: «${r.builder}» не значится в scatter.${r.cellType} набора «${skin.name}» — кожа устарела`);
    }
    if (!SKIN_LAYERS.has(r.layer)) fail(`${at}: layer «${r.layer}» неизвестен`);
    if (!Array.isArray(r.scale) || r.scale.length !== 2 || !r.scale.every(n => isNum(n) && n > 0)) {
      fail(`${at}: scale — пара положительных чисел`);
    }
    if (!isNum(r.jitter) || r.jitter < 0 || r.jitter > 1) fail(`${at}: jitter — число в 0..1`);
    if (!isNum(r.tilt) || r.tilt < 0) fail(`${at}: tilt — неотрицательное число`);
    if (!r.colors || typeof r.colors !== 'object' || !Object.keys(r.colors).length) fail(`${at}: colors — непустой объект`);
    else {
      for (const [pid, pair] of Object.entries(r.colors)) {
        if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(v => typeof v === 'string' && HEXP.test(v))) {
          fail(`${at}: colors.${pid} — пара строк #rrggbb`);
        }
      }
    }
    if (r.glow === undefined || r.glow === null || typeof r.glow !== 'object') fail(`${at}: glow — объект (пустой, если свечения нет)`);
    if (r.geometry !== null) fail(`${at}: geometry должен быть null — выгрузка геометрии отдельная работа`);
    if (!Array.isArray(r.density)) fail(`${at}: density — массив чисел`);
    else {
      if (r.density.length !== want) fail(`${at}: в density ${r.density.length} значений, ожидалось ${want}`);
      const bad = r.density.filter(v => !isNum(v) || v < 0);
      if (bad.length) fail(`${at}: в density ${bad.length} значений вне 0..`);
    }
  }
}

/* Все наборы обязаны быть выгружены: иначе чек прошёл бы на пустом месте,
   проверив один-два файла вместо семи. */
let skinCount = 0;
if (!fs.existsSync(SKINS)) {
  fail('dist/skins/ нет — выполни `npm run export`, чек проверяет выгруженное, а не исходники');
} else {
  const files = fs.readdirSync(SKINS).filter(f => f.endsWith('.json'));
  const seen = new Set();
  for (const f of files) {
    const where = `skin ${f}`;
    let skin;
    try { skin = JSON.parse(fs.readFileSync(path.join(SKINS, f), 'utf8')); }
    catch (e) { fail(`${where}: не читается как JSON — ${e.message}`); continue; }
    if (typeof skin.name === 'string') {
      if (seen.has(skin.name)) fail(`${where}: набор «${skin.name}» выгружен дважды`);
      seen.add(skin.name);
    }
    checkSkin(skin, where);
  }
  for (const id of biomeIds) if (!seen.has(id)) fail(`скин для набора «${id}» не выгружен — выполни npm run export`);
  skinCount = files.length;
}

/* ── итог ── */
const nmaps = DEMO.length, nbuilders = Object.keys(BUILDERS).length;
for (const w of warnings) console.warn('warn  ' + w);
for (const e of errors) console.error('FAIL  ' + e);
if (errors.length) {
  console.error(`\n${errors.length} ошибок, ${warnings.length} предупреждений`);
  process.exit(1);
}
console.log(`ok: карт ${nmaps}, наборов ${biomeIds.length}, объектов ${nbuilders}, ` +
            `правил ${rules}, скинов ${skinCount}` +
            (warnings.length ? `, предупреждений ${warnings.length}` : ''));
