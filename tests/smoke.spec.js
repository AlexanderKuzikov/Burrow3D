/* Дымовой тест Burrow3D.
   Проверяет в настоящем Chromium то, чего не видит scripts/check.js:
   - страница поднимается без ошибок в консоли
   - сцена реально построилась (есть рельеф и объекты)
   - все наборы оформления переключаются
   - все встроенные карты грузятся и разбираются на три типа клеток
   - легенда символов меняет разбивку и пересобирает сцену
   - слои и свободная камера не ломают страницу
   ------------------------------------------------------------------------- */

'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

/** Ошибки страницы, которые считаем падением. favicon и CDN-шум — нет. */
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/favicon/i.test(t)) errors.push('console: ' + t);
  });
  return errors;
}

async function boot(page, errors) {
  await page.goto('/index.html');
  await page.waitForFunction(() => window.BURROW && window.BURROW.S && window.BURROW.S.M, null, { timeout: 30_000 });
  // дождаться, пока сцена действительно что-то нарисовала
  await page.waitForFunction(() => window.BURROW.renderer.info.render.frame > 5, null, { timeout: 30_000 });
}

test.describe('Burrow3D', () => {

  test('страница поднимается, сцена построена, консоль чистая', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    const info = await page.evaluate(() => {
      const B = window.BURROW;
      let instanced = 0, terrain = null, water = null;
      B.scene.traverse(o => {
        if (o.isInstancedMesh) instanced++;
        if (o.isMesh && o.material.map && !terrain) terrain = o;
        if (o.isMesh && o.material.isMeshPhysicalMaterial) water = o;
      });
      const tiles = B.propsReport().sets[B.S.biome] || [];
      let propMeshes = 0, procBlocked = 0;
      const slots = new Set();
      B.scene.traverse(o => {
        if (!o.isInstancedMesh) return;
        if (o.userData.src === 'prop') { propMeshes++; slots.add(o.userData.slot); }
        if (o.userData.src === 'rule' && o.userData.cellType === 'blocked') procBlocked++;
      });
      return {
        objects: B.scene.children.find(o => o.isGroup)?.userData.count ?? 0,
        props: B.scene.children.find(o => o.isGroup)?.userData.props ?? 0,
        instanced, hasTerrain: !!terrain, hasWater: !!water,
        cells: B.S.map.w * B.S.map.h,
        counts: B.S.counts.reduce((a, b) => a + b, 0),
        propTiles: tiles.length,
        loaded: tiles.every(t => t.loaded),
        propMeshes, procBlocked,
        slots: [...slots].sort((a, b) => a - b),
        refusal: B.propsRefusal(B.S.biome),
      };
    });

    expect(info.cells).toBeGreaterThan(0);
    expect(info.counts).toBe(info.cells);          // все клетки распределены по типам
    expect(info.hasTerrain).toBe(true);
    expect(info.objects).toBeGreaterThan(0);
    expect(info.instanced).toBeGreaterThan(0);
    /* лес — набор с пропсами: на занятых клетках модели из манифеста,
       процедурным там делать нечего */
    expect(info.refusal).toBe('');
    expect(info.propTiles).toBe(40);
    expect(info.loaded).toBe(true);
    expect(info.propMeshes).toBe(40);
    expect(info.procBlocked).toBe(0);
    expect(info.slots.length).toBe(40);            // видны все сорок слотов
    expect(errors).toEqual([]);
  });

  test('все наборы оформления переключаются без ошибок', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    const ids = await page.evaluate(() => Object.keys(window.BURROW.BIOMES));
    expect(ids.length).toBeGreaterThanOrEqual(7);

    for (const id of ids) {
      await page.evaluate(b => window.BURROW.setBiome(b), id);
      await page.waitForTimeout(120);
      const objects = await page.evaluate(() => window.BURROW.S ? window.BURROW.S.buildMs : -1);
      expect(objects, `набор ${id} не пересобрался`).toBeGreaterThanOrEqual(0);
      const current = await page.evaluate(() => window.BURROW.S.biome);
      expect(current).toBe(id);
    }
    /* Шесть наборов без пропсов — с внятной причиной, а не сценой с другими
       объектами: откат на процедурные вернул бы то расхождение, которое мы закрываем. */
    const withProps = await page.evaluate(() => Object.keys(window.BURROW.propsReport().sets));
    const bad = [];
    for (const id of ids) {
      await page.evaluate(b => window.BURROW.setBiome(b), id);
      await page.waitForTimeout(120);
      const r = await page.evaluate(() => {
        const B = window.BURROW;
        let n = 0;
        B.scene.traverse(o => { if (o.isInstancedMesh) n++; });
        return {
          refusal: B.propsRefusal(B.S.biome),
          meshes: n,
          overlay: document.getElementById('refuse').classList.contains('on'),
          msg: document.getElementById('refuseMsg').textContent,
        };
      });
      const hasProps = withProps.includes(id);
      if (hasProps && r.refusal) bad.push(`${id}: пропсы есть, но отказ «${r.refusal}»`);
      if (!hasProps && !r.refusal) bad.push(`${id}: пропсов нет, но отказа нет`);
      if (!hasProps && r.meshes) bad.push(`${id}: пропсов нет, но объектов на экране ${r.meshes}`);
      if (!hasProps && !r.overlay) bad.push(`${id}: отказа не видно в предпросмотре`);
      if (!hasProps && r.msg !== r.refusal) bad.push(`${id}: надпись «${r.msg}» ≠ причине «${r.refusal}»`);
    }
    expect(bad, '\n  ' + bad.join('\n  ')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('встроенные карты грузятся и разбираются на три типа', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    const names = await page.evaluate(() => window.BURROW.DEMO.map(m => m.name));
    expect(names.length).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < names.length; i++) {
      await page.selectOption('#selMap', { index: i });
      await page.waitForTimeout(200);
      const info = await page.evaluate(() => {
        const B = window.BURROW;
        const legend = new Set(B.S.legend);
        return {
          name: B.S.map.name,
          cells: B.S.map.w * B.S.map.h,
          counts: B.S.counts,
          legend: B.S.legend,
          unique: legend.size,
          sum: B.S.counts.reduce((a, b) => a + b, 0),
        };
      });
      expect(info.name).toBe(names[i]);
      expect(info.sum).toBe(info.cells);
      expect(info.unique).toBe(3);                 // три различных символа в легенде
    }
    /* Пропсы стоят только на занятых клетках: по одному на клетку, двухклеточные
       занимают пару — значит пропсов не больше, чем занятых клеток. */
    const props = await page.evaluate(() => {
      const B = window.BURROW;
      let blocked = 0;
      for (let i = 0; i < B.S.type.length; i++) if (B.S.type[i] === 2) blocked++;
      let placed = 0;
      B.scene.traverse(o => { if (o.isGroup && o.userData.props) placed = o.userData.props; });
      return { biome: B.S.biome, blocked, placed };
    });
    expect(props.biome).toBe('forest');
    expect(props.placed).toBeGreaterThan(0);
    expect(props.placed, 'пропсов больше, чем занятых клеток').toBeLessThanOrEqual(props.blocked);
    expect(errors).toEqual([]);
  });

  test('легенда символов меняет разбивку карты', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    const before = await page.evaluate(() => window.BURROW.S.counts.slice());
    // обменяем «дорога» и «занятая» местами через интерфейс
    await page.evaluate(() => {
      const s = document.querySelector('.lsel[data-t="1"]');
      const other = window.BURROW.S.legend[2];
      s.value = other;
      s.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.BURROW.S.counts.slice());

    expect(after[1]).toBe(before[2]);            // дорога заняла прежнее место «занятой»
    expect(after[2]).toBe(before[1]);
    expect(after[0]).toBe(before[0]);            // свободная не изменилась
    expect(errors).toEqual([]);
  });

  test('клетка, мир и текстура стоят в одной системе координат', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    /* Главная проверка на рассогласование слоёв: клетка → мировая точка →
       обратно в клетку обязана вернуть ту же клетку. Раньше начало координат
       у полотна и у карты совпадало, и карта уезжала на ring клеток. */
    const rt = await page.evaluate(() => {
      const B = window.BURROW, S = B.S, M = S.M;
      const cellToWorld = (cx, cy) => [M.originX + (cx + 0.5) * M.CELL, M.originZ + (cy + 0.5) * M.CELL];
      const worldToCell = (x, z) => [Math.floor((x - M.originX) / M.CELL), Math.floor((z - M.originZ) / M.CELL)];
      const bad = [];
      for (const [cx, cy] of [[0, 0], [1, 1], [S.map.w - 1, 0], [0, S.map.h - 1],
                              [S.map.w - 1, S.map.h - 1], [S.map.w >> 1, S.map.h >> 1]]) {
        const [x, z] = cellToWorld(cx, cy);
        const [bx, by] = worldToCell(x, z);
        if (bx !== cx || by !== cy) bad.push(`${cx},${cy} -> ${bx},${by}`);
      }
      return { bad, originX: M.originX, ring: M.ring, planeX: M.planeX };
    });
    expect(rt.bad, 'клетка и мир разошлись: ' + rt.bad.join('; ')).toEqual([]);

    /* Второй слой: текстура в точке клетки обязана показывать тип этой клетки.
       Цвета берём не «похожими», а напрямую из данных палитры, а тип
       определяем тем, какая из трёх пар цветов ближе всего к пикселю. */
    const tex = await page.evaluate(() => {
      const B = window.BURROW, S = B.S, M = S.M;
      let t = null;
      B.scene.traverse(o => { if (o.isMesh && o.material.map) t = o.material.map; });
      const img = t.image, d = img.data, TW = img.width, TH = img.height;
      const TYPE = ['free', 'road', 'blocked'];
      const hex2rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      const pal = TYPE.map(k => S.ground[k].map(c => hex2rgb(c.toString(16))));
      const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
      const near = rgb => pal.map(p => Math.min(...p.map(c => d2(rgb, c)))).indexOf(
        Math.min(...pal.map(p => Math.min(...p.map(c => d2(rgb, c))))));
      let bad = 0, n = 0, first = null;
      // шаг 3 — не ловим границы клеток
      for (let cy = 0; cy < S.map.h; cy += 3) {
        for (let cx = 0; cx < S.map.w; cx += 3) {
          const x = M.originX + (cx + 0.5) * M.CELL, z = M.originZ + (cy + 0.5) * M.CELL;
          const u = (x + M.PX / 2) / M.PX, v = (z + M.PZ / 2) / M.PZ;
          const tx = Math.floor(u * TW), ty = Math.floor(v * TH);
          if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
          const i = (ty * TW + tx) * 4;
          const drawn = near([d[i], d[i + 1], d[i + 2]]);
          const data = S.type[cy * S.map.w + cx];
          n++;
          if (drawn !== data) { bad++; if (!first) first = `${cx},${cy}: данные ${TYPE[data]}, нарисовано ${TYPE[drawn]}`; }
        }
      }
      return { bad, n, first, pct: +(bad / n * 100).toFixed(1) };
    });
    // цвета «плям» приглушены шумом, поэтому небольшой процент — норма,
    // но треть сетки означала бы сдвиг слоя
    expect(tex.pct, `текстура разошлась с данными на ${tex.pct}% (${tex.first})`).toBeLessThan(8);

    expect(errors).toEqual([]);
  });

  test('край карты, дорога и горы ведут себя как задумано', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    /* Три свойства, которые невозможно увидеть глазами, пока не сломан рельеф:
         1. край карты выше воды (кроме намеренно затопленных наборов);
         2. дорога не грубее соседних свободных клеток — иначе «ровная» дорога
            оказывалась уторком на границе своей маски;
         3. горы достаются только занятым клеткам: свободные вдали от занятых
            остаются в базовом рельефе набора. */
    const PROBE = () => {
      const B = window.BURROW, S = B.S, M = S.M, W = S.map.w, H = S.map.h;
      const h = (cx, cy) => B.terrainH(M.originX + (cx + 0.5) * M.CELL, M.originZ + (cy + 0.5) * M.CELL);
      const step = t => {
        const d = [];
        for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W - 1; cx++) {
          if (S.type[cy * W + cx] !== t || S.type[cy * W + cx + 1] !== t) continue;
          d.push(Math.abs(h(cx, cy) - h(cx + 1, cy)));
        }
        return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
      };
      let edgeMin = Infinity;
      for (let cx = 0; cx < W; cx++) edgeMin = Math.min(edgeMin, h(cx, 0), h(cx, H - 1));
      for (let cy = 0; cy < H; cy++) edgeMin = Math.min(edgeMin, h(0, cy), h(W - 1, cy));
      /* свободная клетка, от которой занятая дальше чем на 4 клетки */
      let farMax = -Infinity, farN = 0;
      for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
        if (S.type[cy * W + cx] !== 0) continue;
        let near = false;
        for (let dy = -4; dy <= 4 && !near; dy++) for (let dx = -4; dx <= 4; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (S.type[ny * W + nx] === 2) { near = true; break; }
        }
        if (near) continue;
        farMax = Math.max(farMax, h(cx, cy)); farN++;
      }
      return {
        biome: S.biome, waterY: S.waterDef ? S.waterDef.level : null,
        flood: !!(S.waterDef && S.waterDef.flood),
        ridgeAmp: S.relief.ridgeAmp || 0, amp: S.relief.amp, detAmp: S.relief.detAmp || 0,
        edgeMin: +edgeMin.toFixed(2), stepFree: step(0), stepRoad: step(1),
        farMax: farN ? +farMax.toFixed(2) : null, farN,
      };
    };

    const maps = await page.evaluate(() => window.BURROW.DEMO.map(m => m.name));
    const biomes = await page.evaluate(() => Object.keys(window.BURROW.BIOMES));
    const bad = [];
    const seen = [];

    for (const name of maps) {
      await page.evaluate(n => {
        const i = window.BURROW.DEMO.findIndex(m => m.name === n);
        window.BURROW.loadMap(window.BURROW.DEMO[i]);
      }, name);
      await page.waitForTimeout(150);
      for (const id of biomes) {
        await page.evaluate(b => window.BURROW.setBiome(b), id);
        await page.waitForTimeout(150);
        const r = await page.evaluate(PROBE);
        seen.push(`${name}/${r.biome}`);
        const at = `${name} / ${r.biome}`;

        if (r.waterY !== null && !r.flood && r.edgeMin < r.waterY + 1) {
          bad.push(`${at}: край карты на ${r.edgeMin} — ниже воды (${r.waterY}); карта тонет`);
        }
        if (r.stepRoad !== null && r.stepFree !== null && r.stepRoad > r.stepFree * 1.15 + 0.05) {
          bad.push(`${at}: дорога грубее местности — ступенька ${r.stepRoad} против ${r.stepFree}`);
        }
        if (r.ridgeAmp > 0 && r.farMax !== null) {
          const bound = r.amp * 0.5 + r.detAmp * 0.5 + 2;
          if (r.farMax > bound) {
            bad.push(`${at}: горы забрали свободные клетки (${r.farMax} > ${bound.toFixed(1)} вне занятых)`);
          }
        }
      }
    }

    expect(seen.length, 'наборы не прогнались').toBe(maps.length * biomes.length);
    expect(bad, 'рельеф поехал:\n  ' + bad.join('\n  ')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('карты из своей папки попадают в список', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    /* Браузер не умеет перечислять файлы в каталоге, а fetch на file:// заблокирован,
       поэтому карты рядом со страницей берутся одним жестом — выбором папки.
       Проверяем разбор, переименование по файлу и то, что мусор не ломает страницу. */
    const dir = path.join(__dirname, '..', 'test-results', 'maps');
    fs.mkdirSync(dir, { recursive: true });
    const good = path.join(dir, 'alpha.json');
    const junk = path.join(dir, 'not-a-map.json');
    const W = 12, H = 8;
    const grid = Array.from({ length: H }, (_, y) =>
      (y === 0 || y === H - 1 ? '#' : '.').repeat(W).split('')
        .map((c, x) => (c === '#' || x === 3 || x === 8 ? '#' : '.')).join(''));
    fs.writeFileSync(good, JSON.stringify({ name: 'ignored-name', width: W, height: H, grid }));
    fs.writeFileSync(junk, JSON.stringify({ hello: 'world' }));

    const before = await page.evaluate(() => window.BURROW.DEMO.length);
    // webkitdirectory принимает только путь к папке — это и есть реальный сценарий
    await page.setInputFiles('#dir', dir);
    await page.waitForTimeout(400);

    const info = await page.evaluate(() => {
      const B = window.BURROW;
      const sel = document.getElementById('selMap');
      return {
        name: B.S.map.name, w: B.S.map.w, h: B.S.map.h,
        poolSize: sel.options.length,
        selected: sel.options[sel.selectedIndex]?.textContent,
        demoUntouched: B.DEMO.length,
      };
    });
    expect(info.name).toBe('alpha');            // имя из файла, а не из JSON
    expect(info.w).toBe(W);
    expect(info.h).toBe(H);
    expect(info.demoUntouched).toBe(before);    // встроенный список не тронут
    expect(info.selected).toBe('alpha');
    expect(errors, 'мусорный .json не должен ломать страницу').toEqual([]);
  });

  test('кожа выгружается детерминированно, читается обратно и совпадает с картинкой', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    /* 96×96 — худший случай по размеру сетки счётчиков: 24×24 блоков на
       правило, и карта не делится на 4 без остатка. */
    const size = await page.evaluate(() => ({ w: window.BURROW.S.map.w, h: window.BURROW.S.map.h }));
    expect(size.w).toBe(96);
    expect(size.h).toBe(96);

    const ids = await page.evaluate(() => Object.keys(window.BURROW.BIOMES));
    const report = [];
    const refusals = [];

    for (const id of ids) {
      const frame = await page.evaluate(() => window.BURROW.renderer.info.render.frame);
      await page.evaluate(b => window.BURROW.setBiome(b), id);
      await page.waitForFunction(f => window.BURROW.renderer.info.render.frame > f + 3, frame, { timeout: 60_000 });

      const hasProps = await page.evaluate(b => (window.BURROW.propsReport().sets[b] || []).length, id);
      if (!hasProps) {
        /* Набор без пропсов: выгрузка отказывает с внятной причиной по имени
           набора и по числу недостающих слотов — неполный файл не выгружается. */
        const r = await page.evaluate(() => {
          const B = window.BURROW;
          let reason;
          try { B.skinJson(); reason = 'ОТКАЗА НЕТ'; }
          catch (e) { reason = e.message; }
          return {
            reason,
            overlay: document.getElementById('refuseMsg').textContent,
          };
        });
        expect(r.reason, `${id}: отказа выгрузки нет`).not.toBe('ОТКАЗА НЕТ');
        expect(r.reason).toContain(id);            // причина называет набор
        expect(r.reason).toContain('40 слотов из 40');
        expect(r.overlay, `${id}: в предпросмотре не видна причина`).toBe(r.reason);
        refusals.push(`${id}: ${r.reason.split(';')[0]}…`);
        continue;
      }

      const r = await page.evaluate(() => {
        const B = window.BURROW, S = B.S;
        const a = B.skinJson();                       // первая выгрузка
        const b = B.skinJson();                       // вторая, подряд
        const skin = JSON.parse(a);                   // round-trip: читаем назад
        const bad = [];

        if (a !== b) bad.push('две выгрузки подряд разошлись');
        if (skin.version !== B.SKIN_VERSION) bad.push('version');
        if (skin.name !== S.biome) bad.push('name');
        /* без cellSize игре неизвестен масштаб клетки: её ландшафт вышел бы вдвое ниже */
        if (skin.cellSize !== B.CELL) bad.push('cellSize ' + skin.cellSize + ' вместо CELL ' + B.CELL);
        if (skin.map.width !== S.map.w || skin.map.height !== S.map.h) bad.push('map.width/height');
        if (skin.map.fingerprint !== B.mapFingerprint(S.map)) bad.push('map.fingerprint');
        if (skin.scatter.cell !== B.SKIN_BLOCK) bad.push('scatter.cell');

        /* плитки: все сорок слотов манифеста, номер и файл совпадают */
        const manifest = (B.propsReport().sets[S.biome] || []);
        if (!Array.isArray(skin.tiles) || skin.tiles.length !== B.TILE_SLOTS) {
          bad.push('tiles длиной ' + (skin.tiles && skin.tiles.length));
        } else {
          const want = new Map(manifest.map(t => [t.slot, t]));
          for (const t of skin.tiles) {
            const src = want.get(t.slot);
            if (!src) { bad.push('плитка ' + t.slot + ': слота нет в манифесте'); continue; }
            if (t.file !== src.file) bad.push('плитка ' + t.slot + ': файл «' + t.file + '» против «' + src.file + '»');
            if (t.contentHash !== src.contentHash) bad.push('плитка ' + t.slot + ': contentHash разошёлся');
            if (t.kind !== src.kind || t.footprint !== src.footprint || t.solid !== src.solid) {
              bad.push('плитка ' + t.slot + ': вид разошёлся с манифестом');
            }
          }
        }

        const gw = Math.ceil(S.map.w / B.SKIN_BLOCK), gh = Math.ceil(S.map.h / B.SKIN_BLOCK);

        let sumCount = 0;
        const idsSeen = new Set();
        for (const [i, rule] of skin.scatter.rules.entries()) {
          const at = 'правило ' + i + ' (' + rule.id + ')';
          const obj = B.BUILDERS[rule.builder];
          if (!obj) bad.push(at + ': builder «' + rule.builder + '» нет в BUILDERS');
          if (obj && rule.solid !== obj.solid) bad.push(at + ': solid не совпадает с BUILDERS');
          if (rule.solid === true && rule.cellType !== 'blocked') bad.push(at + ': непроходимый на ' + rule.cellType);
          if (idsSeen.has(rule.id)) bad.push(at + ': id повторяется');
          idsSeen.add(rule.id);
          if (rule.geometry !== null) bad.push(at + ': geometry не null');
          for (const [pid, pair] of Object.entries(rule.float || {})) {
            if (!Array.isArray(pair) || pair.length !== 2 || pair.some(v => typeof v !== 'number')) {
              bad.push(at + ': float.' + pid + ' не пара чисел');
            }
          }
          if (rule.count.length !== gw * gh) bad.push(at + ': count длиной ' + rule.count.length);
          /* На занятых клетках рисуются пропсы, а не процедурные объекты, —
             поэтому счётчики процедурных правил сверяем только там, где они
             рисуются: на свободных и на дороге. */
          if (rule.cellType === 'blocked') continue;
          for (const v of rule.count) {
            if (!(v >= 0)) { bad.push(at + ': счётчик вне 0..'); break; }
            sumCount += v;
          }
        }
        /* числа, о которых просит приёмка: ожидание из файла и реальность на экране */
        let placed = 0, props = 0;
        const slots = new Set();
        B.scene.traverse(o => {
          if (o.isGroup) { placed += o.userData.count || 0; props += o.userData.props || 0; }
          if (o.isInstancedMesh && o.userData.src === 'prop') slots.add(o.userData.slot);
        });
        return { biome: S.biome, bad, sumCount: Math.round(sumCount), placed, props,
                 procedural: placed - props, tiles: skin.tiles.length,
                 slots: [...slots].sort((a, b) => a - b), bytes: a.length };
      });

      report.push(`${r.biome}: счётчики ${r.sumCount}, процедурных на экране ${r.procedural}, ` +
                  `пропсов ${r.props}, плиток ${r.tiles} (${r.bytes} Байт)`);
      expect(r.bad, `${r.biome}: ${r.bad.join('; ')}`).toEqual([]);
      expect(r.slots.length, `${r.biome}: на экране не все сорок слотов`).toBe(40);
      /* сумма счётчиков — ожидание того же самого расчёта, поэтому обязана
         попадать в фактическое число объектов, а не просто «того же порядка» */
      expect(r.sumCount, `${r.biome}: счётчики ${r.sumCount} против ${r.procedural} процедурных`)
        .toBeGreaterThan(r.procedural * 0.85);
      expect(r.sumCount, `${r.biome}: счётчики ${r.sumCount} против ${r.procedural} процедурных`)
        .toBeLessThan(r.procedural * 1.15);
    }

    console.log('\n  сумма счётчиков против объектов на экране (карта 96×96):');
    for (const line of report) console.log('    ' + line);
    console.log('  отказы выгрузки:');
    for (const line of refusals) console.log('    ' + line);
    expect(report.length + refusals.length).toBe(ids.length);
    expect(refusals.length).toBe(ids.length - 1);   // выгружается только набор с пропсами
    expect(errors).toEqual([]);

    /* Пропсы проверены именем и хэшем, а не на глаз: в браузере скачиваем каждый
       файл и сверяем sha256 с contentHash из манифеста. */
    const hashes = await page.evaluate(async () => {
      const manifest = (window.BURROW.propsReport().sets.forest || []);
      const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
      const bad = [];
      for (const t of manifest) {
        const res = await fetch(t.url);
        const buf = await res.arrayBuffer();
        const got = 'sha256:' + hex(await crypto.subtle.digest('SHA-256', buf));
        if (got !== t.contentHash) bad.push(t.file + ': на диске ' + got.slice(7, 23) + '…');
      }
      return { n: manifest.length, bad };
    });
    expect(hashes.n).toBe(40);
    expect(hashes.bad, 'contentHash разошёлся:\n  ' + hashes.bad.join('\n  ')).toEqual([]);

    /* кнопка «Выгрузить кожу» — то, чем владелец пользуется на самом деле,
       поэтому проверяем её целиком: имя файла из имени набора и побайтовое
       совпадение содержимого с тем, что отдаёт экспортёр */
    await page.evaluate(() => window.BURROW.setBiome('forest'));
    await page.waitForTimeout(200);
    const want = await page.evaluate(() => ({ file: window.BURROW.skinFileName(), text: window.BURROW.skinJson() }));
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.locator('#bSkin').click(),
    ]);
    expect(download.suggestedFilename()).toBe(want.file);
    const stream = await download.createReadStream();
    const got = await new Promise((res, rej) => {
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', rej);
    });
    expect(got).toBe(want.text);
  });

  test('собранный файл самодостаточен: ни одного запроса наружу', async ({ page }) => {
    const dist = path.join(__dirname, '..', 'dist', 'burrow3d.html');
    test.skip(!fs.existsSync(dist), 'нет dist/burrow3d.html — сначала npm run build');

    /* Главное свойство артефакта: открывается по file:// и не ходит в сеть.
       Проверяем именно сеть — иначе случайно вернувшийся CDN не заметят. */
    const external = [];
    page.on('request', r => {
      const u = r.url();
      if (!/^(file|data|blob):/.test(u)) external.push(u);
    });
    const errors = collectErrors(page);

    await page.goto('file:///' + dist.replace(/\\/g, '/'));
    await page.waitForFunction(() => window.__MAP_READY === true, null, { timeout: 60_000 });
    await page.waitForFunction(() => window.BURROW.renderer.info.render.frame > 5, null, { timeout: 60_000 });

    const info = await page.evaluate(() => {
      const B = window.BURROW;
      let instanced = 0, terrain = false;
      B.scene.traverse(o => {
        if (o.isInstancedMesh) instanced++;
        if (o.isMesh && o.material.map) terrain = true;
      });
      const tiles = (B.propsReport().sets.forest || []);
      return { maps: B.DEMO.length, biomes: Object.keys(B.BIOMES).length, instanced, terrain,
               skinRules: B.exportSkin().scatter.rules.length,
               skinTiles: B.exportSkin().tiles.length,
               propTiles: tiles.length, loaded: tiles.every(t => t.loaded) };
    });
    expect(info.maps).toBeGreaterThanOrEqual(3);      // карты вложены в файл
    expect(info.biomes).toBeGreaterThanOrEqual(7);    // наборы вложены в файл
    expect(info.terrain).toBe(true);
    expect(info.instanced).toBeGreaterThan(0);
    expect(info.skinRules, 'выгрузка кожи должна работать и в собранном файле').toBeGreaterThan(0);
    /* пропсы вложены в файл: по file:// их не скачать, и без вставки артефакт
       открывался бы с пустым «Лесом-Полем» */
    expect(info.propTiles).toBe(40);
    expect(info.loaded).toBe(true);
    expect(info.skinTiles).toBe(40);
    expect(external, 'артефакт ходит в сеть: ' + external.join(', ')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('слои выключаются и включаются обратно', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    const before = await page.evaluate(() => {
      let n = 0; window.BURROW.scene.traverse(o => { if (o.isInstancedMesh && o.visible) n++; }); return n;
    });
    for (const id of ['bPlants', 'bRocks', 'bProps']) await page.locator('#' + id).click();
    await page.waitForTimeout(120);
    const off = await page.evaluate(() => {
      let n = 0; window.BURROW.scene.traverse(o => { if (o.isInstancedMesh && o.visible) n++; }); return n;
    });
    expect(off).toBeLessThan(before);

    for (const id of ['bPlants', 'bRocks', 'bProps']) await page.locator('#' + id).click();
    await page.waitForTimeout(120);
    const on = await page.evaluate(() => {
      let n = 0; window.BURROW.scene.traverse(o => { if (o.isInstancedMesh && o.visible) n++; }); return n;
    });
    expect(on).toBe(before);
    expect(errors).toEqual([]);
  });

  test('свободная камера включается и не ломает сцену', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, errors);

    await page.locator('#bFree').click();
    expect(await page.evaluate(() => window.BURROW.controls.enabled)).toBe(false);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyW');
    await page.locator('#bFree').click();
    expect(await page.evaluate(() => window.BURROW.controls.enabled)).toBe(true);
    expect(errors).toEqual([]);
  });

});
