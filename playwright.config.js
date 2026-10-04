// Playwright: гоняем страницу в реальном Chromium и ловим то, что не видит check.js —
// ошибки в консоли, падения при смене набора/карты/легенды, нулевую сцену.
// Своя папка кэша, чтобы не трогать системную установку браузеров.

module.exports = {
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8801',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run serve',
    url: 'http://127.0.0.1:8801/index.html',
    reuseExistingServer: true,
    timeout: 20_000,
  },
};
