import { expect, test } from "@playwright/test";

const turnstileMock = `
  window.turnstile = {
    render(_container, options) {
      window.__turnstileOptions = options;
      return "widget-1";
    },
    execute() {
      window.__turnstileOptions.callback("test-token");
    },
    reset() {},
    remove() {}
  };
`;

test.beforeEach(async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js**", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: turnstileMock });
  });
});

test("clarification, answer lock, and reset form one conversation", async ({ page }) => {
  let requestCount = 0;
  await page.route("https://api.test/v1/query", async (route) => {
    requestCount += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        requestCount === 1
          ? { kind: "clarification", text: "どこの天気ですか？" }
          : { kind: "answer", text: "晴れ" },
      ),
    });
  });

  await page.goto("");
  await page.getByLabel("質問").fill("明日の天気は？");
  await page.getByRole("button", { name: "送信" }).click();
  const conversation = page.getByRole("region", { name: "検索の会話" });
  await expect(conversation.getByText("どこの天気ですか？")).toBeVisible();

  await page.getByLabel("質問").fill("東京都港区");
  await page.getByRole("button", { name: "送信" }).click();
  await expect(conversation.getByText("晴れ", { exact: true })).toBeVisible();
  await expect(page.getByLabel("質問")).toBeDisabled();

  await page.getByRole("button", { name: "新しい検索" }).click();
  await expect(page.getByLabel("質問")).toBeEnabled();
  await expect(page.getByText("晴れ", { exact: true })).toHaveCount(0);
});

test("layout remains usable at the configured viewport", async ({ page }) => {
  await page.goto("");
  const input = page.getByLabel("質問");
  await expect(input).toBeVisible();
  const box = await input.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
});
