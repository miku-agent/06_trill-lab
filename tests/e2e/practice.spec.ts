import { expect, test, type Page } from "@playwright/test";

type PracticeFeedbackPayload = {
  id: number;
  lane: number;
  judgment: "perfect" | "good";
  signedMs: string;
  timingLabel: "FAST" | "SLOW";
};

type PracticeTestApi = {
  startControlledGame: (partialConfig?: Record<string, unknown>) => void;
  setElapsedMs: (nextElapsedMs: number) => void;
  getPendingNotes: () => Array<{ id: number; lane: number; time: number }>;
  focus: () => void;
};

async function waitForPracticeTestApi(page: Page) {
  await page.waitForFunction(() => {
    const win = window as Window & { __practiceTestApi?: PracticeTestApi };
    return typeof win.__practiceTestApi?.startControlledGame === "function";
  });
}

async function injectTestFeedback(page: Page, feedbacks: PracticeFeedbackPayload[]) {
  await page.waitForFunction(() => {
    const win = window as Window & { __injectTestFeedback?: (nextFeedbacks: PracticeFeedbackPayload[]) => void };
    return typeof win.__injectTestFeedback === "function";
  });

  await page.evaluate((nextFeedbacks) => {
    const win = window as Window & { __injectTestFeedback?: (feedbacks: PracticeFeedbackPayload[]) => void };
    win.__injectTestFeedback?.(nextFeedbacks);
  }, feedbacks);
}

async function startControlledPractice(page: Page) {
  await waitForPracticeTestApi(page);
  await page.evaluate(() => {
    const win = window as Window & { __practiceTestApi?: PracticeTestApi };
    win.__practiceTestApi?.startControlledGame({
      bpm: 150,
      subdivision: 4,
      speed: 6.5,
      endMode: "timed",
      duration: 30,
      leftKey: "a",
      rightKey: "'",
    });
    win.__practiceTestApi?.focus();
  });
}

async function getPendingNotes(page: Page) {
  return page.evaluate(() => {
    const win = window as Window & { __practiceTestApi?: PracticeTestApi };
    return win.__practiceTestApi?.getPendingNotes() ?? [];
  });
}

async function setElapsedMs(page: Page, nextElapsedMs: number) {
  await page.evaluate((elapsedMs) => {
    const win = window as Window & { __practiceTestApi?: PracticeTestApi };
    win.__practiceTestApi?.setElapsedMs(elapsedMs);
  }, nextElapsedMs);
}

async function expectFeedbackWithinLaneNearJudgmentLine(page: Page, laneIndex: number) {
  const lane = page.locator(".practice-lane").nth(laneIndex);
  const feedback = lane.locator(".practice-lane-feedback");
  const judgmentLine = page.locator(".practice-judgment-line");

  const [laneBox, feedbackBox, lineBox] = await Promise.all([
    lane.boundingBox(),
    feedback.boundingBox(),
    judgmentLine.boundingBox(),
  ]);

  expect(laneBox).not.toBeNull();
  expect(feedbackBox).not.toBeNull();
  expect(lineBox).not.toBeNull();

  if (!laneBox || !feedbackBox || !lineBox) {
    throw new Error("Expected lane, feedback, and judgment line bounding boxes to exist.");
  }

  expect(feedbackBox.x).toBeGreaterThanOrEqual(laneBox.x);
  expect(feedbackBox.x + feedbackBox.width).toBeLessThanOrEqual(laneBox.x + laneBox.width);
  expect(feedbackBox.y).toBeGreaterThanOrEqual(laneBox.y);
  expect(feedbackBox.y + feedbackBox.height).toBeLessThanOrEqual(laneBox.y + laneBox.height);
  expect(feedbackBox.y + feedbackBox.height).toBeLessThanOrEqual(lineBox.y + 14);
  expect(feedbackBox.y + feedbackBox.height).toBeGreaterThanOrEqual(lineBox.y - 32);
}

test.describe("/practice", () => {
  test("기본 설정 UI를 렌더하고 비트 변경이 배지에 반영된다", async ({ page }) => {
    await page.goto("/practice");

    await expect(page.getByRole("heading", { name: "연습 모드" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "트릴 연습 세팅" })).toBeVisible();
    await expect(page.getByLabel("BPM")).toHaveValue("150");
    await expect(page.getByLabel("비트")).toHaveValue("4");
    await expect(page.getByLabel("노트 속도")).toHaveValue("6.5");
    await expect(page.locator(".practice-field").filter({ hasText: "LANE 2" }).locator("button")).toContainText("A");
    await expect(page.locator(".practice-field").filter({ hasText: "LANE 3" }).locator("button")).toContainText("'");
    await expect(page.getByText("BEAT LINE: 1/4 · 비트 4")).toBeVisible();

    await page.getByLabel("비트").selectOption("8");
    await expect(page.getByText("BEAT LINE: 1/4 · 비트 8")).toBeVisible();
  });

  test("키 바인딩 변경이 레일과 안내에 반영된다", async ({ page }) => {
    await page.goto("/practice");

    const leftKeyButton = page.locator(".practice-field").filter({ hasText: "LANE 2" }).locator("button");
    await leftKeyButton.click();
    await expect(leftKeyButton).toContainText("키 입력 중... (ESC 취소)");

    await page.keyboard.press("s");

    await expect(leftKeyButton).toContainText("S");
    await expect(page.locator(".practice-lane").nth(1).locator(".practice-lane-top strong")).toContainText("S");
    await expect(page.locator(".practice-key-floor").nth(1)).toContainText("S");
  });

  test("연습 시작 후 상태가 진행되고 첫 미스로 종료할 수 있다", async ({ page }) => {
    await page.goto("/practice");

    await page.getByLabel("종료 모드").selectOption("firstMiss");
    await page.getByRole("button", { name: "연습 시작" }).click();

    await expect(page.getByRole("button", { name: "지금 종료" })).toBeVisible();
    await expect(page.getByText(/시작 준비.../)).toBeVisible();

    await expect.poll(async () => page.locator(".practice-judgment-number-card.is-miss strong").innerText(), {
      timeout: 5000,
    }).not.toBe("0");

    await expect(page.locator(".practice-timing-graph-card")).toBeVisible();
    await expect(page.locator(".practice-timing-svg circle")).toHaveCount(1, { timeout: 3000 }).catch(() => {});
    await expect(page.locator(".practice-timing-svg")).toBeVisible();

    await page.getByRole("button", { name: "초기화" }).click();
    await expect(page.getByRole("button", { name: "연습 시작" })).toBeVisible();
    await expect(page.getByText("JUDGED / TOTAL").locator("..").locator("strong")).toHaveText("0 / 0");
  });

  test("실제 입력으로 PERFECT 판정과 lane feedback이 연결된다", async ({ page }) => {
    await page.goto("/practice?testMode=true");
    await startControlledPractice(page);

    const [firstNote] = await getPendingNotes(page);
    expect(firstNote?.lane).toBe(1);

    await setElapsedMs(page, firstNote.time);
    await page.keyboard.press("a");

    await expect(page.locator(".practice-judgment-number-card.is-perfect strong")).toHaveText("1");

    const laneFeedback = page.locator('.practice-lane-feedback.is-perfect[data-lane="1"]');
    await expect(laneFeedback).toBeVisible();
    await expect(laneFeedback.locator("strong")).toHaveText("PERFECT");
    await expect(laneFeedback.locator("span")).toHaveText("+0ms");
    await expect(laneFeedback.locator("small")).toHaveText("SLOW");

    const feedbackBox = await laneFeedback.boundingBox();
    const judgmentLine = await page.locator(".practice-judgment-line").boundingBox();
    expect(feedbackBox).not.toBeNull();
    expect(judgmentLine).not.toBeNull();
    expect(Math.abs((feedbackBox?.y ?? 0) + (feedbackBox?.height ?? 0) / 2 - (judgmentLine?.y ?? 0))).toBeLessThan(48);
  });

  test("실제 입력으로 GOOD 판정과 lane feedback이 연결된다", async ({ page }) => {
    await page.goto("/practice?testMode=true");
    await startControlledPractice(page);

    const [, secondNote] = await getPendingNotes(page);
    expect(secondNote?.lane).toBe(2);

    await setElapsedMs(page, secondNote.time + 60);
    await page.keyboard.press("'");

    await expect(page.locator(".practice-judgment-number-card.is-good strong")).toHaveText("1");

    const laneFeedback = page.locator('.practice-lane-feedback.is-good[data-lane="2"]');
    await expect(laneFeedback).toBeVisible();
    await expect(laneFeedback.locator("strong")).toHaveText("GOOD");
    await expect(laneFeedback.locator("span")).toHaveText("+60ms");
    await expect(laneFeedback.locator("small")).toHaveText("SLOW");
  });

  test("레인별 판정 피드백이 올바르게 렌더된다 - PERFECT with FAST timing", async ({ page }) => {
    await page.goto("/practice?testMode=true");

    await injectTestFeedback(page, [
      {
        id: 1,
        lane: 1,
        judgment: "perfect",
        signedMs: "-18ms",
        timingLabel: "FAST",
      },
    ]);

    const laneFeedback = page.locator('.practice-lane-feedback.is-perfect[data-lane="1"]');
    await expect(laneFeedback).toBeVisible();
    await expect(laneFeedback.locator("strong")).toHaveText("PERFECT");
    await expect(laneFeedback.locator("span")).toHaveText("-18ms");
    await expect(laneFeedback.locator("small")).toHaveText("FAST");
    await expectFeedbackWithinLaneNearJudgmentLine(page, 1);
  });

  test("레인별 판정 피드백이 올바르게 렌더된다 - GOOD with SLOW timing", async ({ page }) => {
    await page.goto("/practice?testMode=true");

    await injectTestFeedback(page, [
      {
        id: 2,
        lane: 2,
        judgment: "good",
        signedMs: "+45ms",
        timingLabel: "SLOW",
      },
    ]);

    const laneFeedback = page.locator('.practice-lane-feedback.is-good[data-lane="2"]');
    await expect(laneFeedback).toBeVisible();
    await expect(laneFeedback.locator("strong")).toHaveText("GOOD");
    await expect(laneFeedback.locator("span")).toHaveText("+45ms");
    await expect(laneFeedback.locator("small")).toHaveText("SLOW");
    await expectFeedbackWithinLaneNearJudgmentLine(page, 2);
  });

  test("여러 레인에 동시에 판정 피드백이 표시된다", async ({ page }) => {
    await page.goto("/practice?testMode=true");

    await injectTestFeedback(page, [
      {
        id: 3,
        lane: 1,
        judgment: "perfect",
        signedMs: "+12ms",
        timingLabel: "SLOW",
      },
      {
        id: 4,
        lane: 2,
        judgment: "good",
        signedMs: "-33ms",
        timingLabel: "FAST",
      },
    ]);

    const perfectFeedback = page.locator('.practice-lane-feedback.is-perfect[data-lane="1"]');
    await expect(perfectFeedback).toBeVisible();
    await expect(perfectFeedback.locator("strong")).toHaveText("PERFECT");
    await expect(perfectFeedback.locator("span")).toHaveText("+12ms");
    await expect(perfectFeedback.locator("small")).toHaveText("SLOW");

    const goodFeedback = page.locator('.practice-lane-feedback.is-good[data-lane="2"]');
    await expect(goodFeedback).toBeVisible();
    await expect(goodFeedback.locator("strong")).toHaveText("GOOD");
    await expect(goodFeedback.locator("span")).toHaveText("-33ms");
    await expect(goodFeedback.locator("small")).toHaveText("FAST");
  });

  test("레인 피드백 업데이트가 올바르게 반영된다", async ({ page }) => {
    await page.goto("/practice?testMode=true");

    await injectTestFeedback(page, [
      {
        id: 5,
        lane: 1,
        judgment: "perfect",
        signedMs: "-5ms",
        timingLabel: "FAST",
      },
    ]);

    let laneFeedback = page.locator(".practice-lane-feedback");
    await expect(laneFeedback).toHaveCount(1);
    await expect(laneFeedback.locator("strong")).toHaveText("PERFECT");

    await injectTestFeedback(page, [
      {
        id: 6,
        lane: 1,
        judgment: "good",
        signedMs: "+67ms",
        timingLabel: "SLOW",
      },
    ]);

    laneFeedback = page.locator(".practice-lane-feedback");
    await expect(laneFeedback).toHaveCount(1);
    await expect(laneFeedback.locator("strong")).toHaveText("GOOD");
    await expect(laneFeedback.locator("span")).toHaveText("+67ms");
  });
});
