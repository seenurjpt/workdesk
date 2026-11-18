import { expect, quickAdd, signUp, test } from "./fixtures";

const ROUTES = [
  "/today",
  "/today?tab=all",
  "/today?tab=upcoming",
  "/today?tab=overdue",
  "/inbox",
  "/general",
  "/board",
  "/calendar",
  "/notes",
  "/waiting",
  "/review",
  "/review?tab=weekly",
  "/templates",
  "/trash",
  "/settings",
  "/help",
];
const WIDTHS = [1280, 768, 375, 280];

test("every page is healthy at every screen size", async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page, "Health Check");
  await quickAdd(page, "Overdue sample yesterday !p1 #Health @a");
  await quickAdd(page, "Today sample today 4pm");
  await quickAdd(page, "Upcoming sample in 4 days wait:Sam");
  await page.goto("/notes");
  await page.getByRole("button", { name: "New note" }).first().click();
  await page.waitForURL(/\/notes\/[a-f0-9]{24}/);
  await page.getByPlaceholder("Untitled note").fill("Health note");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  const noteUrl = page.url().replace(/^https?:\/\/[^/]+/, "");

  const problems: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of [...ROUTES, noteUrl]) {
      const res = await page.goto(route);
      await page.waitForLoadState("networkidle");
      if (!res || res.status() >= 400) problems.push(`${width} ${route}: HTTP ${res?.status()}`);
      const info = await page.evaluate(() => {
        const bad: string[] = [];
        const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        if (over > 0) bad.push(`overflow ${over}px`);
        const main = document.querySelectorAll("main").length;
        if (main !== 1) bad.push(`${main} <main> landmarks`);
        const h1 = [...document.querySelectorAll("h1")].filter(
          (e) => (e as HTMLElement).offsetParent !== null,
        ).length;
        if (h1 < 1 && !location.pathname.startsWith("/notes/")) bad.push("no visible h1");
        for (const b of document.querySelectorAll("button, a[href]")) {
          const el = b as HTMLElement;
          if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
          const name = (
            el.getAttribute("aria-label") ||
            el.textContent ||
            el.getAttribute("title") ||
            ""
          ).trim();
          if (!name) bad.push(`unnamed ${el.tagName.toLowerCase()} ${el.outerHTML.slice(0, 80)}`);
        }
        for (const i of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
          const el = i as HTMLInputElement;
          if (!el.offsetParent || el.getAttribute("aria-hidden") === "true") continue;
          const labelled =
            el.getAttribute("aria-label") ||
            el.getAttribute("aria-labelledby") ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
            el.closest("label");
          if (!labelled) bad.push(`unlabelled input ${el.outerHTML.slice(0, 80)}`);
        }
        const imgs = [...document.querySelectorAll("img")].filter((m) => !m.hasAttribute("alt"));
        if (imgs.length) bad.push(`${imgs.length} img without alt`);
        return bad;
      });
      for (const b of info) problems.push(`${width} ${route}: ${b}`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("dark mode renders every page without errors", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Dark Check");
  await quickAdd(page, "Dark sample today");
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Dark" }).click();
  for (const route of ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBeLessThan(400);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("main").first()).toBeVisible();
  }
});

test("keyboard users can reach everything: tab order has visible focus", async ({ page }) => {
  await signUp(page);
  await page.goto("/today");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  let withRing = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const visible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return false;
      const cs = getComputedStyle(el);
      return (
        (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none"
      );
    });
    if (visible) withRing += 1;
  }
  expect(withRing).toBeGreaterThan(18);
});
