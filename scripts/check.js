/* Проверка целостности данных Burrow3D. Без зависимостей: node scripts/check.js
   ---------------------------------------------------------------------------
   Проверяет то, что нельзя увидеть глазами, пока сцена не упадёт в браузере:

   1. maps.js    — у каждой демо-карты ровные строки, размеры совпадают, лимит 512
   2. biomes.js  — у каждого набора есть обязательные поля, корректные пары цветов,
                   границы тумана в порядке возрастания
   3. biomes ↔ BUILDERS — каждый упомянутый объект существует, каждый ключ в colors{}
                   и glow{} совпадает с id части этого объекта, каждый layer известен

   Именно эти три класса ошибок проскакивали при написании набора вручную.
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
    else if (b.water.level < b.relief.base - b.relief.amp - b.relief.rimDrop) warn(`${where}: вода ниже всего рельефа, поверхности не будет видно`);
  }

  for (const k of ['amp', 'freq', 'oct', 'rimStart', 'rimDrop']) if (!isNum(b.relief[k])) fail(`${where}: relief.${k} — число`);
  if (isNum(b.relief.amp) && b.relief.amp <= 0) fail(`${where}: relief.amp должен быть больше нуля`);
  if (isNum(b.relief.rimStart) && (b.relief.rimStart <= 0 || b.relief.rimStart >= 1)) fail(`${where}: relief.rimStart вне (0;1)`);

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

/* ── итог ── */
const nmaps = DEMO.length, nbuilders = Object.keys(BUILDERS).length;
for (const w of warnings) console.warn('warn  ' + w);
for (const e of errors) console.error('FAIL  ' + e);
if (errors.length) {
  console.error(`\n${errors.length} ошибок, ${warnings.length} предупреждений`);
  process.exit(1);
}
console.log(`ok: карт ${nmaps}, наборов ${biomeIds.length}, объектов ${nbuilders}, правил ${rules}` +
            (warnings.length ? `, предупреждений ${warnings.length}` : ''));
