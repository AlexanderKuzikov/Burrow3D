/* Копирование пропсов из NexusModeler: npm run props → props/manifest.json + props/*.glb
   ---------------------------------------------------------------------------
   Геометрия принадлежит не нам: её делает `NexusModeler` и отдаёт набором по
   сорок нумерованных слотов (`export/land/manifest.json` плюс сорок GLB). Здесь
   мы только читаем — писать в соседний проект нельзя, и незачем: имена наборов
   и слотов должны прийти оттуда такими, какие там есть.

   Что делает скрипт:
     • читает манифест источника и копирует его побайтово — формат не переписывается,
       чтобы не появился второй, «наш» формат манифеста;
     • сверяет каждую запись с диском источника: sha256 из `contentHash` и размер
       из `bytes`. Расхождение здесь означает битый экспорт у источника, и молчать
       об этом нельзя — дальше это вылезет как «модель грузится криво»;
     • раскладывает файлы в `props/` и переписывает каталог целиком, чтобы в нём
       не копились модели от удалённых наборов.

   Проверку полноты набора (все сорок слотов на месте) здесь намеренно НЕТ: по
   контракту она живёт в файле кожи, а значит в `npm run check`. Здесь мы только
   предупреждаем, чтобы не искать потом, откуда взялась дыра.

   Путь к источнику — `../NexusModeler/export/land`, переопределяется переменной
   окружения PROPS_SRC. Ничего не качаем по сети и ничего не пишем наружу. */

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = process.env.PROPS_SRC || path.join(ROOT, '..', 'NexusModeler', 'export', 'land');
const OUT = path.join(ROOT, 'props');
const SLOTS = 40;                                 // столько слотов обещает контракт
const RE_ID = /^land\.([^.]+)\.(\d+)$/;

const errors = [];
const fail = m => errors.push(m);
const warn = m => console.warn('warn  ' + m);

function sha256(file) {
  return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (!fs.existsSync(SRC)) {
  console.error(`FAIL  источник пропсов не найден: ${SRC}`);
  console.error('      пропсы делает соседний проект NexusModeler; укажи путь переменной PROPS_SRC');
  process.exit(1);
}

const srcManifest = path.join(SRC, 'manifest.json');
if (!fs.existsSync(srcManifest)) {
  console.error(`FAIL  ${srcManifest} нет — у источника нет выгрузки пропсов`);
  process.exit(1);
}

const raw = fs.readFileSync(srcManifest, 'utf8');
let manifest;
try { manifest = JSON.parse(raw); }
catch (e) { console.error(`FAIL  манифест источника не читается как JSON: ${e.message}`); process.exit(1); }

if (manifest.version !== 1) fail(`манифест источника: version ${JSON.stringify(manifest.version)} — ждём 1`);
if (!Array.isArray(manifest.models) || !manifest.models.length) fail('манифест источника: нет models');

/* ── проверка каждой записи и раскладка по наборам ── */
const sets = new Map();
let bytesTotal = 0;

for (const m of manifest.models || []) {
  const hit = RE_ID.exec(String(m.id || ''));
  if (!hit) { fail(`запись «${m.id}»: имя вне вида land.<набор>.<NN>`); continue; }
  const set = hit[1], nn = +hit[2];
  if (!m.land) { fail(`${m.id}: нет блока land — у рельефной модели он обязателен`); continue; }
  if (m.land.slot !== nn) fail(`${m.id}: номер в имени ${nn}, а в land.slot ${m.land.slot} — они обязаны совпадать`);
  if (!Number.isInteger(m.land.slot) || m.land.slot < 1 || m.land.slot > SLOTS) {
    fail(`${m.id}: слот ${m.land.slot} вне 1…${SLOTS}`);
  }
  if (typeof m.file !== 'string' || !/^[\w.-]+\.glb$/i.test(m.file)) fail(`${m.id}: непристойное имя файла «${m.file}»`);

  const src = path.join(SRC, m.file);
  if (!fs.existsSync(src)) { fail(`${m.id}: файла нет на диске источника: ${m.file}`); continue; }
  const size = fs.statSync(src).size;
  if (m.bytes !== undefined && m.bytes !== size) fail(`${m.id}: bytes ${m.bytes}, а на диске ${size}`);
  const got = sha256(src);
  if (m.contentHash && got !== m.contentHash) fail(`${m.id}: contentHash разошёлся — на диске ${got}`);

  if (!sets.has(set)) sets.set(set, new Map());
  sets.get(set).set(m.land.slot, { file: m.file, bytes: size });
  bytesTotal += size;
}

/* ── раскладка ── */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const [, tiles] of sets) {
  for (const [, t] of tiles) fs.copyFileSync(path.join(SRC, t.file), path.join(OUT, t.file));
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), raw, 'utf8');

/* полнота — предупреждение, а не падение: по контракту её проверяет npm run check */
for (const [set, tiles] of sets) {
  const missing = [];
  for (let s = 1; s <= SLOTS; s++) if (!tiles.has(s)) missing.push(s);
  const n = tiles.size;
  console.log(`  ${set.padEnd(10)} слотов ${String(n).padStart(2)} из ${SLOTS}` +
    (missing.length ? `  нет: ${missing.join(', ')}` : ''));
  if (n !== SLOTS) warn(`набор «${set}»: слотов ${n} из ${SLOTS} — набор без пропсов не выгружается и не показывается`);
}

if (errors.length) {
  for (const e of errors) console.error('FAIL  ' + e);
  console.error(`\n${errors.length} ошибок`);
  process.exit(1);
}
console.log(`готово: props/ — наборов ${sets.size}, ${(bytesTotal / 1048576).toFixed(2)} МБ, манифест скопирован побайтово`);
