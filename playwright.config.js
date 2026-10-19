// Dev-only test config - does not affect how the game itself is served or
// built. The site keeps loading directly as static HTML/CSS/JS.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test',
  // 60 s per test. CI renders WebGL in software (SwiftShader), so a test that
  // loads the page twice and clicks through Settings spends most of its time
  // waiting for frames. Those took ~20 s with three r160 and 21-31 s with
  // r186 (2026-10-19, PRs #21 and #22), so 30 s failed at random.
  timeout: 60000,
  fullyParallel: true,
  // Yerelde 1 işçi: makinede 8 GB RAM var, paralel çalıştırma worker'ları
  // "JavaScript heap out of memory" ile düşürüyor. CI'da sınır yok.
  workers: process.env.CI ? undefined : 1,
  reporter: [['list']],
  webServer: {
    command: 'python3 -m http.server 4174',
    url: 'http://localhost:4174/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  use: {
    baseURL: 'http://localhost:4174',
    // Point PW_CHROMIUM_PATH at an existing Chromium to skip the browser
    // download (sandboxes without egress); unset, Playwright uses its own.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
});
