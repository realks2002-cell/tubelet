import { test, expect } from "@playwright/test";

test.describe("Compose 페이지", () => {
  test("페이지 로드 — 타이틀·헤더 표시", async ({ page }) => {
    await page.goto("/compose");
    await expect(page).toHaveTitle(/Compose/);
    await expect(page.locator(".masthead h1")).toContainText("바로 요약");
  });

  test("아카이브 링크 — / 로 이동", async ({ page }) => {
    await page.goto("/compose");
    const link = page.locator('.top-nav a[href="/"]');
    await expect(link).toBeVisible();
    await expect(link).toContainText("아카이브");
  });

  test("URL 입력 폼 — placeholder 텍스트 확인", async ({ page }) => {
    await page.goto("/compose");
    const input = page.locator("#compose-url");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("placeholder", /youtube\.com/i);
  });

  test("빈 URL 제출 — 브라우저 validation으로 막힘", async ({ page }) => {
    await page.goto("/compose");
    await page.locator("#compose-btn").click();
    // required 속성으로 제출 안 됨 — status 텍스트 변화 없음
    await expect(page.locator("#compose-status")).toBeEmpty();
  });

  test("잘못된 URL 제출 — 오류 메시지 표시", async ({ page }) => {
    await page.goto("/compose");
    await page.locator("#compose-url").fill("https://example.com/not-youtube");
    await page.locator("#compose-btn").click();
    const status = page.locator("#compose-status");
    await expect(status).toContainText("오류", { timeout: 15000 });
  });

  test("랜딩 → Compose 버튼 클릭 → /compose 이동", async ({ page }) => {
    await page.goto("/");
    await page.locator('.top-nav a[href="/compose"]').click();
    await expect(page).toHaveURL(/\/compose/);
    await expect(page.locator(".masthead h1")).toBeVisible();
  });

  test("힌트 박스 2개 표시", async ({ page }) => {
    await page.goto("/compose");
    const hints = page.locator(".hint");
    await expect(hints).toHaveCount(2);
  });
});
