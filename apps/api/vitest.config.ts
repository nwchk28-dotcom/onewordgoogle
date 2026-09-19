import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          GEMINI_API_KEY: "test-gemini-key",
          TURNSTILE_SECRET_KEY: "test-turnstile-key",
        },
      },
    }),
  ],
});
