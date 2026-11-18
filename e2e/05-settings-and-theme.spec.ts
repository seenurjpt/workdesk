import { choose, expect, quickAdd, signUp, test } from "./fixtures";
import { readFile } from "node:fs/promises";

test.describe("settings", () => {
  test("save profile and reminder settings, and they persist", async ({ page }) => {
    await signUp(page, "Settings Person");
    await page.goto("/settings");
    await page.getByLabel("Name", { exact: true }).fill("Renamed Person");
    await choose(page, "#s-week", "Sunday");
    await choose(page, "#s-default-reminder", "30 minutes before");
    await page.getByLabel("Work starts", { exact: true }).fill("08:15");
    await page.getByLabel("Work ends", { exact: true }).fill("17:45");
    await page.getByRole("checkbox", { name: /Quiet hours/ }).check();
    await page.getByLabel("From", { exact: true }).fill("21:00");
    await page.getByLabel("Until", { exact: true }).fill("06:30");
    await page.getByRole("checkbox", { name: /Morning summary/ }).check();
    await choose(page, "#s-tone", "Bell");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Renamed Person");
    await expect(page.locator("#s-week")).toContainText("Sunday");
    await expect(page.locator("#s-default-reminder")).toContainText("30 minutes before");
    await expect(page.getByLabel("Work starts", { exact: true })).toHaveValue("08:15");
    await expect(page.getByLabel("Until", { exact: true })).toHaveValue("06:30");
    await expect(page.getByRole("checkbox", { name: /Morning summary/ })).toBeChecked();
    await expect(page.locator("#s-tone")).toContainText("Bell");
    await expect(page.getByRole("heading", { name: /Good .*, Renamed/ })).toHaveCount(0); // not on this page
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: /Good .*, Renamed/ })).toBeVisible();
  });

  test("the volume slider responds to the keyboard and the mouse", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings");
    const slider = page.getByRole("slider", { name: "Volume" });
    await slider.focus();
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0.1");
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "0.15");
    const box = (await slider.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
    const v = Number(await slider.getAttribute("aria-valuenow"));
    expect(v).toBeGreaterThan(0.45);
    expect(v).toBeLessThan(0.6);
    // Pulling past the end stretches then settles back.
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 120, box.y + box.height / 2, { steps: 6 });
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
    await page.mouse.up();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
  });

  test("dropdowns work by keyboard and by mouse, including a long list", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings");
    // The list is ready for keys once an option is highlighted; typing sooner would be lost.
    const ready = async () =>
      expect(page.locator("[role=option][data-highlighted]")).toHaveCount(1);
    await page.locator("#s-week").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await ready();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("#s-week")).toContainText("Sunday");
    await page.locator("#s-tz").click();
    await expect(page.getByRole("option").first()).toBeVisible();
    await ready();
    expect(await page.getByRole("option").count()).toBeGreaterThan(300);
    await page.keyboard.type("Europe/Lon");
    await page.keyboard.press("Enter");
    await expect(page.locator("#s-tz")).toContainText("Europe/London");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
  });

  test("exports download real data", async ({ page }) => {
    await signUp(page, "Export Person");
    await quickAdd(page, "Exportable task today #Exp");
    await page.goto("/settings");
    const [json] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /Export all data/ }).click(),
    ]);
    const data = JSON.parse(await readFile((await json.path())!, "utf8"));
    expect(JSON.stringify(data)).toContain("Exportable task");
    const [csv] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /Export tasks/ }).click(),
    ]);
    const text = await readFile((await csv.path())!, "utf8");
    expect(text).toContain("Exportable task");
  });

  test("notification and install sections explain themselves", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Browser notifications" })).toBeVisible();
    await expect(page.getByText(/only fire while WorkDesk is open/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Install the app" })).toBeVisible();
    await page.getByRole("button", { name: "Send a test" }).click();
  });
});

test.describe("theme", () => {
  test("theme choices apply immediately, persist, and System follows the device", async ({
    page,
  }) => {
    await signUp(page);
    await page.goto("/settings");
    const html = page.locator("html");
    await page.emulateMedia({ colorScheme: "light" });
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(html).not.toHaveClass(/dark/);
    await page.getByRole("radio", { name: "System" }).click();
    await expect(html).not.toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveClass(/dark/);
    // top-bar menu has all three too
    await page.getByRole("button", { name: "Change theme" }).click();
    await expect(page.getByRole("menuitemradio")).toHaveCount(3);
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test("the first paint already has the saved theme (no flash)", async ({
    page,
    consoleErrors,
  }) => {
    await signUp(page);
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Dark" }).click();
    // With the app's own scripts blocked, only the inline head script can set the theme.
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.unroute("**/_next/static/**/*.js");
    consoleErrors.length = 0; // the blocked scripts are logged as failed loads on purpose
  });
});

test.describe("help and platform files", () => {
  test("help page documents the commands and every anchor works", async ({ page }) => {
    await signUp(page);
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Help and guide" })).toBeVisible();
    for (const [id, label] of [
      ["add", "Adding things"],
      ["quick-add", "Quick-add commands"],
      ["keys", "Keyboard shortcuts"],
      ["tasks", "Working with tasks"],
      ["notes", "Notes"],
      ["reminders", "Reminders"],
      ["more", "More tools"],
      ["offline", "Offline and your data"],
    ]) {
      await page
        .getByRole("navigation", { name: "On this page" })
        .getByRole("link", { name: label })
        .click();
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await expect(page.getByText("remind:15m").first()).toBeVisible();
  });

  test("manifest, service worker, icons and share images are served", async ({ request }) => {
    for (const path of [
      "/manifest.webmanifest",
      "/sw.js",
      "/favicon.ico",
      "/icon.svg",
      "/opengraph-image.png",
      "/twitter-image.png",
      "/icons/apple-touch-icon.png",
      "/offline",
    ]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
    const sw = await request.get("/sw.js");
    expect(sw.headers()["cache-control"]).toContain("no-cache");
    const home = await request.get("/");
    expect(home.headers()["content-security-policy"]).toContain("default-src 'self'");
    expect(home.headers()["x-frame-options"]).toBe("DENY");
  });

  test("the reminders API is not open to the public", async ({ request }) => {
    for (const path of ["/api/reminders", "/api/export?type=tasks-csv"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([301, 302, 303, 307, 308, 401, 403, 404, 405], path).toContain(res.status());
    }
  });
});
