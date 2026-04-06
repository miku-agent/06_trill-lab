import { expect, test, type Page } from "@playwright/test";

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

test.describe("패턴 전환 상태 초기화", () => {
  test("trill → druruk: gameState가 idle로 초기화된다", async ({ page }) => {
    // 1. trill 패턴 + testMode로 시작
    await page.goto("/practice?pattern=trill&testMode=true");
    await startControlledPractice(page);

    // playing 상태 진입 확인: "연습 시작" 버튼이 사라지고 "지금 종료" 버튼이 보임
    await expect(page.getByRole("button", { name: "지금 종료" })).toBeVisible();

    // 2. URL을 druruk로 변경 (패턴 전환)
    await page.goto("/practice?pattern=druruk&testMode=true");

    // 3. gameState가 idle로 초기화되었는지 확인
    //    idle 상태: "연습 시작" 버튼이 보이고 "지금 종료" 버튼은 없음
    await expect(page.getByRole("button", { name: "연습 시작" })).toBeVisible();
    await expect(page.getByRole("button", { name: "지금 종료" })).not.toBeVisible();

    // READY 상태 표시 확인 (lastFeedback이 null이면 "READY" 표시)
    await expect(page.locator(".practice-judgment-toast strong")).toHaveText("READY");

    // 이전 판정 통계가 초기화되었는지 확인
    await expect(page.getByText("JUDGED / TOTAL").locator("..").locator("strong")).toHaveText("0 / 0");
  });

  test("druruk → trill: config가 trill 기본값으로 갱신된다", async ({ page }) => {
    // 1. druruk 패턴으로 시작하고 연습 시작
    await page.goto("/practice?pattern=druruk&testMode=true");

    // druruk 패턴의 설정 UI가 렌더되었는지 확인
    await expect(page.getByRole("heading", { name: "드르륵 세팅" })).toBeVisible();

    // druruk 연습 시작 (상태를 playing으로 전환)
    await waitForPracticeTestApi(page);
    await page.evaluate(() => {
      const win = window as Window & { __practiceTestApi?: PracticeTestApi };
      win.__practiceTestApi?.startControlledGame({ drurukKeyCount: 6 });
    });

    await expect(page.getByRole("button", { name: "지금 종료" })).toBeVisible();

    // 2. URL을 trill로 변경 (패턴 전환)
    await page.goto("/practice?pattern=trill&testMode=true");

    // 3. config가 trill 기본값으로 갱신되었는지 확인
    //    trill 기본: BPM 150, 비트 4, 노트 속도 6.5
    await expect(page.getByRole("heading", { name: "트릴 연습 세팅" })).toBeVisible();
    await expect(page.getByLabel("BPM")).toHaveValue("150");
    await expect(page.getByLabel("비트")).toHaveValue("4");
    await expect(page.getByLabel("노트 속도")).toHaveValue("6.5");

    // trill 기본 키 바인딩 확인: 왼쪽 A, 오른쪽 '
    await expect(page.getByRole("button", { name: "왼쪽 키" })).toContainText("A");
    await expect(page.getByRole("button", { name: "오른쪽 키" })).toContainText("'");

    // gameState가 idle인지 확인 (이전 druruk playing 상태 잔류 없음)
    await expect(page.getByRole("button", { name: "연습 시작" })).toBeVisible();
    await expect(page.getByRole("button", { name: "지금 종료" })).not.toBeVisible();
  });
});
