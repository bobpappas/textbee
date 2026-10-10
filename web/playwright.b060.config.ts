import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "paced-group-sms.spec.ts",
  workers: 1,
  retries: 0,
  webServer: {
    ...base.webServer,
    command: `"${process.execPath}" node_modules/next/dist/bin/next build && "${process.execPath}" node_modules/next/dist/bin/next start -p 3100`,
    reuseExistingServer: false,
  },
});
