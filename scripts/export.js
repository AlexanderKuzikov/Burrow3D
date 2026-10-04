/* Выгрузка кожи для всех наборов оформления: npm run export → dist/skins/*.json
   ---------------------------------------------------------------------------
   Работает в настоящем браузере и зовёт ровно ту функцию выгрузки, что и кнопка
   «Выгрузить кожу» в панели. Своя реализация выгрузки в Node разошлась бы с
   браузерной на первой же правке набора, а проверить это было бы нечем.

   Экспортёру нужна карта: densities считаются по типам клеток, а не по данным
   набора. Берём первую встроенную карту — она всегда есть, и её размер известен.

   Нужен Playwright (он и так devDependency ради тестов). Рантайм-зависимостей
   у приложения по-прежнему нет. */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'skins');
const PORT = 8816;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  let browser;
  try {
    await sleep(1200);
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.waitForFunction(() => window.__MAP_READY === true, null, { timeout: 60_000 });

    const map = await page.evaluate(() => ({ name: window.BURROW.S.map.name, w: window.BURROW.S.map.w, h: window.BURROW.S.map.h }));
    const biomes = await page.evaluate(() => Object.keys(window.BURROW.BIOMES));
    console.log(`карта ${map.name} ${map.w}×${map.h}, наборов: ${biomes.length}`);

    fs.mkdirSync(OUT, { recursive: true });
    for (const id of biomes) {
      const frame = await page.evaluate(() => window.BURROW.renderer.info.render.frame);
      await page.evaluate(b => window.BURROW.setBiome(b), id);
      await page.waitForFunction(f => window.BURROW.renderer.info.render.frame > f + 3, frame, { timeout: 60_000 });
      const skin = await page.evaluate(() => ({
        name: window.BURROW.S.biome,
        file: window.BURROW.skinFileName(),
        text: window.BURROW.skinJson(),
      }));
      fs.writeFileSync(path.join(OUT, skin.file), skin.text, 'utf8');
      const rules = JSON.parse(skin.text).scatter.rules.length;
      console.log(`  ${skin.file.padEnd(22)} ${(skin.text.length / 1024).toFixed(1)} КБ, правил: ${rules}`);
    }

    if (errors.length) { console.error('ошибки страницы:', errors); process.exit(1); }
    console.log(`готово: dist/skins/ (${biomes.length} файлов)`);
  } finally {
    if (browser) await browser.close();
    srv.kill();
  }
})().catch(e => { console.error('экспорт не удался: ' + e.message); process.exit(1); });