import { clearToasts, expect, quickAdd, signUp, taskRow, test } from "./fixtures";

const status = (page: import("@playwright/test").Page) => page.getByTestId("connection-status");

test.describe("offline indicator", () => {
  test("shows Offline in the top bar when the connection drops, and Back online when it returns", async ({
    page,
    context,
    consoleErrors,
  }) => {
    await signUp(page);
    // If the machine running the tests has lost its own network, the indicator is right to show.
    test.skip(!(await page.evaluate(() => navigator.onLine)), "this machine's network is down");
    await expect(status(page)).toHaveCount(0); // nothing takes up space while online

    await context.setOffline(true);
    await expect(status(page)).toBeVisible();
    await expect(status(page)).toContainText("Offline");

    // an action taken offline is kept and counted
    const input = page.getByLabel("Quick add task").first();
    await input.fill("Written offline today");
    await input.press("Enter");
    await expect(page.getByText("Saved offline").first()).toBeVisible();
    await expect(status(page)).toContainText("1");

    await context.setOffline(false);
    await expect(status(page)).toContainText("Back online");
    await expect(page.getByText(/Synced 1 change/).first()).toBeVisible({ timeout: 15_000 });
    await expect(taskRow(page, "Written offline")).toBeVisible();
    await expect(status(page)).toHaveCount(0, { timeout: 8000 }); // and it goes away again
    consoleErrors.length = 0; // failed requests while offline are logged by the browser, on purpose
  });

  test("also notices when the browser thinks it is online but the server cannot be reached", async ({
    page,
    consoleErrors,
  }) => {
    await signUp(page);
    await clearToasts(page);
    // Wi-Fi up, internet down: every POST (server action) and ping fails, navigator.onLine stays true.
    await page.route("**/*", (route) => {
      const req = route.request();
      if (req.method() === "POST" || req.url().includes("/api/ping"))
        return route.abort("internetdisconnected");
      return route.continue();
    });
    const input = page.getByLabel("Quick add task").first();
    await input.fill("Unreachable server today");
    await input.press("Enter");
    await expect(status(page)).toBeVisible();
    await expect(status(page)).toContainText("Offline");

    await page.unroute("**/*");
    // the app probes with a short backoff, then recovers on its own and syncs the kept task
    await expect(status(page)).toContainText("Back online", { timeout: 20_000 });
    await expect(page.getByText(/Synced 1 change/).first()).toBeVisible({ timeout: 15_000 });
    await expect(taskRow(page, "Unreachable server")).toBeVisible();
    void quickAdd;
    consoleErrors.length = 0;
  });
});
