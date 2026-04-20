import { test, expect } from "@playwright/test";

test.describe("랜딩 페이지", () => {
  test("페이지 로드 — 브랜드·헤더 표시", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Tubelet/);
    await expect(page.locator(".brand")).toContainText("Tubelet");
  });

  test("헤더 nav — Compose 버튼 노출 및 링크 정상", async ({ page }) => {
    await page.goto("/");
    const composeBtn = page.locator('.top-nav a[href="/compose"]');
    await expect(composeBtn).toBeVisible();
    await expect(composeBtn).toContainText("Compose");
  });

  test("헤더 nav — 채널 관리 버튼 노출", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#channels-menu-btn")).toBeVisible();
  });

  test("랜딩 본문에 Compose 폼 없음 (전용 페이지로 이동)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#compose-form")).toHaveCount(0);
  });

  test("채널 섹션 — 채널 카드 1개 이상 표시", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".channel-card");
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("채널 카드 링크 — .html 없이 /channel/:slug 형식", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator("a.channel-card").evaluateAll(
      (els) => els.map((el) => el.getAttribute("href"))
    );
    for (const href of hrefs) {
      if (href) {
        expect(href).toMatch(/^\/channel\//);
        expect(href).not.toContain(".html");
      }
    }
  });

  test("다이제스트 카드 링크 — /digest/:slug 형식", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator("a.digest-card").evaluateAll(
      (els) => els.map((el) => el.getAttribute("href"))
    );
    for (const href of hrefs) {
      if (href) {
        expect(href).toMatch(/^\/digest\//);
        expect(href).not.toContain(".html");
      }
    }
  });

  test("채널 관리 모달 — 버튼 클릭 시 열림·닫힘", async ({ page }) => {
    await page.goto("/");
    const modal = page.locator("#channels-modal");
    await expect(modal).toBeHidden();

    await page.locator("#channels-menu-btn").click();
    await expect(modal).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  });
});
