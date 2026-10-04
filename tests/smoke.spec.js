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
      return {
        objects: B.scene.children.find(o => o.isGroup)?.userData.count ?? 0,
        instanced, hasTerrain: !!terrain, hasWater: !!water,
        cells: B.S.map.w * B.S.map.h,
        counts: B.S.counts.reduce((a, b) => a + b, 0),
      };
    });

    expect(info.cells).toBeGreaterThan(0);
    expect(info.counts).toBe(info.cells);          // все клетки распределены по типам
    expect(info.hasTerrain).toBe(true);
    expect(info.objects).toBeGreaterThan(0);
    expect(info.instanced).toBeGreaterThan(0);
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
