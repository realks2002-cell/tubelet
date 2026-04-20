import { test, expect } from "@playwright/test";

const CHANNEL_SLUG = "삼프로tv-3protv";

test.describe("채널 페이지", () => {
  test("채널 페이지 로드 — 채널명 표시", async ({ page }) => {
    await page.goto(`/channel/${CHANNEL_SLUG}`);
    await expect(page.locator("body")).not.toContainText("채널을 찾을 수 없습니다");
    await expect(page.locator("h1, .masthead h1, h2")).not.toHaveCount(0);
  });

  test("영상 목록 — 1개 이상 표시", async ({ page }) => {
    await page.goto(`/channel/${CHANNEL_SLUG}`);
    const items = page.locator("article, .video-item, .summary-row, a[href*='/video/']");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test("영상 링크 — /video/:id 형식", async ({ page }) => {
    await page.goto(`/channel/${CHANNEL_SLUG}`);
    const links = await page.locator("a[href*='/video/']").evaluateAll(
      (els) => els.map((el) => el.getAttribute("href"))
    );
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      if (href) expect(href).toMatch(/^\/video\//);
    }
  });

  test("존재하지 않는 채널 — 404 텍스트", async ({ page }) => {
    await page.goto("/channel/존재하지않는채널-slug-xyz");
    await expect(page.locator("body")).toContainText("찾을 수 없습니다");
  });

  test("랜딩 채널 카드 클릭 → 채널 페이지 이동", async ({ page }) => {
    await page.goto("/");
    const card = page.locator(`a.channel-card[href="/channel/${CHANNEL_SLUG}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await page.waitForURL(/\/channel\//);
    const decodedUrl = decodeURIComponent(page.url());
    expect(decodedUrl).toContain(`/channel/${CHANNEL_SLUG}`);
    await expect(page.locator("body")).not.toContainText("찾을 수 없습니다");
  });
});
