import path from "node:path";
import { defineConfig } from "@playwright/test";
import { viewports, browsers } from "./cases.mjs";
export default defineConfig({
  testDir: ".",
  testMatch: "screens.spec.mjs",
  timeout: 30000,
  expect: {
    timeout: 7000,
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.002 },
  },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  retries: 0,
  outputDir: path.resolve(".visual-results/tests"),
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: path.resolve(".visual-results/html"), open: "never" },
    ],
    ["./reporter.mjs"],
  ],
  snapshotPathTemplate: "{testDir}/baselines/{projectName}/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4175",
    locale: "en-GB",
    timezoneId: "Asia/Bishkek",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: browsers.flatMap((browserName) =>
    viewports.map((v) => ({
      name: `${browserName}-${v.name}`,
      use: {
        browserName,
        viewport: { width: v.width, height: v.height },
        ...(process.env.VISUAL_CHROMIUM_PATH && browserName === "chromium"
          ? {
              launchOptions: {
                executablePath: process.env.VISUAL_CHROMIUM_PATH,
                args: [
                  "--no-sandbox",
                  "--disable-dev-shm-usage",
                  "--disable-gpu",
                ],
              },
            }
          : {}),
      },
    })),
  ),
  webServer: {
    cwd: process.cwd(),
    command: "npx vite --config e2e/visual/vite.config.mts",
    url: "http://127.0.0.1:4175/e2e/visual/fixture/index.html",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
