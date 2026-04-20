import { test, expect } from "@playwright/test";

const VIDEO_ID = "3Qs0AxR0Xss";

test.describe("영상 상세 페이지", () => {
  test("영상 페이지 로드 — 헤드라인·요약 표시", async ({ page }) => {
    await page.goto(`/video/${VIDEO_ID}`);
    await expect(page.locator("body")).not.toContainText("찾을 수 없습니다");
    await expect(page.locator(".art-headline")).toBeVisible();
  });

  test("요약 본문(deck) — 비어있지 않음", async ({ page }) => {
    await page.goto(`/video/${VIDEO_ID}`);
    const deck = page.locator(".art-deck");
    await expect(deck).toBeVisible();
    const text = await deck.innerText();
    expect(text.trim().length).toBeGreaterThan(50);
  });

  test("썸네일 이미지 표시", async ({ page }) => {
    await page.goto(`/video/${VIDEO_ID}`);
    const img = page.locator(".art-thumb img");
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    expect(src).toContain(VIDEO_ID);
  });

  test("YouTube 원본 링크 존재", async ({ page }) => {
    await page.goto(`/video/${VIDEO_ID}`);
    const ytLink = page.locator(".art-cta a.btn.ol");
    await expect(ytLink).toBeVisible();
    await expect(ytLink).toContainText("YouTube에서 영상 보기");
  });

  test("AI 요약 칩 표시", async ({ page }) => {
    await page.goto(`/video/${VIDEO_ID}`);
    const chip = page.locator(".chip.accent");
    await expect(chip.first()).toBeVisible();
    await expect(chip.first()).toContainText("AI 요약");
  });

  test("존재하지 않는 영상 — 오류 메시지", async ({ page }) => {
    await page.goto("/video/zzz_invalid_id");
    await expect(page.locator("body")).toContainText("찾을 수 없습니다");
  });
});
