import { expect, signIn, signUp, test, uniqueEmail, PASSWORD } from "./fixtures";

test.describe("landing page", () => {
  test("shows the product, links to sign in and sign up", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/WorkDesk/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("calm desk");
    await expect(page.getByRole("link", { name: "Create your account" }).first()).toHaveAttribute(
      "href",
      "/register",
    );
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute(
      "href",
      "/login",
    );
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("the navbar docks as you scroll and returns at the top", async ({ page }) => {
    await page.goto("/");
    const shell = page.locator("header [data-docked]");
    await expect(shell).toHaveAttribute("data-docked", "false");
    await page.mouse.wheel(0, 900);
    await expect(shell).toHaveAttribute("data-docked", "true");
    // The page behind the floating dock must not show bare white (the strip bug).
    await page.evaluate(() => window.scrollTo(0, 30));
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(shell).toHaveAttribute("data-docked", "false");
  });

  test("section links scroll to their section and highlight", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("link", { name: "Features" })
      .click();
    await expect(page.locator("#features")).toBeInViewport();
    await expect(
      page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Features" }),
    ).toHaveAttribute("aria-current", "location");
  });

  test("the try-it box parses what you type", async ({ page }) => {
    await page.goto("/");
    const box = page.getByLabel(/Try it/);
    await box.scrollIntoViewIfNeeded();
    await box.fill("Call Sam friday 3pm #sales !p1");
    await expect(page.getByText("WorkDesk would create")).toBeVisible();
    await expect(page.getByText("Call Sam", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("Urgent priority")).toBeVisible();
    await expect(page.getByText("Project: sales")).toBeVisible();
  });

  test("light/dark toggle works, has no system option and is remembered", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await page.emulateMedia({ colorScheme: "light" });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await page.goto("/login");
    await expect(html).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await expect(html).not.toHaveClass(/dark/);
    await expect(page.getByRole("menuitemradio")).toHaveCount(0);
  });

  for (const width of [375, 280]) {
    test(`no sideways scrolling at ${width}px (landing, sign in, sign up)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      for (const path of ["/", "/login", "/register"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(over, `${path} overflow`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe("sign up, sign in and sign out", () => {
  test("sign up validates its fields", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Name is required")).toBeVisible();
    await expect(page.getByText("Enter a valid email")).toBeVisible();
    await expect(page.getByText("At least 8 characters", { exact: true })).toBeVisible();
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("the password strength meter and show/hide work", async ({ page }) => {
    await page.goto("/register");
    const pw = page.getByLabel("Password", { exact: true });
    await pw.fill("abc");
    await expect(page.getByText("Password strength: Too short")).toBeVisible();
    await pw.fill("abcdefgh");
    await expect(page.getByText("Password strength: Okay")).toBeVisible();
    await pw.fill("Abcdefgh123!xyz");
    await expect(page.getByText("Password strength: Strong")).toBeVisible();
    await expect(pw).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(pw).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(pw).toHaveAttribute("type", "password");
  });

  test("full journey: sign up, sign out, protected page redirects, sign back in", async ({
    page,
  }) => {
    const { name, email } = await signUp(page, "Journey Tester");
    await expect(
      page.getByRole("heading", { name: new RegExp(`Good .*, ${name.split(" ")[0]}`) }),
    ).toBeVisible();

    // A signed-in visitor on / or /login is sent to Today.
    await page.goto("/");
    await expect(page).toHaveURL(/\/today$/);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/today$/);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/notes");
    await expect(page).toHaveURL(/\/login\?next=%2Fnotes/);
    await signIn(page, email, PASSWORD, true);
    await expect(page).toHaveURL(/\/notes$/);
  });

  test("rejects a duplicate email and a wrong password", async ({ page, context }) => {
    const { email } = await signUp(page);
    await context.clearCookies();
    await page.goto("/register");
    await page.getByLabel("Name").fill("Copycat");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /./ }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);

    await signIn(page, email, "wrong-password-9");
    await expect(page.getByText("Incorrect email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, email);
    await page.waitForURL("**/today");
  });

  test("sign in for an unknown email is rejected", async ({ page }) => {
    await signIn(page, uniqueEmail("nobody"));
    await expect(page.getByText("Incorrect email or password")).toBeVisible();
  });
});

test.describe("access control", () => {
  test("signed-out visitors cannot reach app pages or the export API", async ({
    page,
    request,
  }) => {
    for (const path of [
      "/today",
      "/inbox",
      "/board",
      "/calendar",
      "/notes",
      "/settings",
      "/trash",
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
    const res = await request.get("/api/export?type=json", { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401, 403]).toContain(res.status());
  });

  test("one user cannot open another user's note or project", async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    await signUp(a, "Alice E2E");
    await a.goto("/notes");
    await a.getByRole("button", { name: "New note" }).first().click();
    await a.waitForURL(/\/notes\/[a-f0-9]{24}/);
    const noteUrl = a.url();

    const b = await (await browser.newContext()).newPage();
    await signUp(b, "Bob E2E");
    await b.goto(noteUrl);
    await expect(b.getByRole("heading", { name: "Not found" })).toBeVisible();
    await expect(b.getByText("That page does not exist or was removed.")).toBeVisible();
    await a.context().close();
    await b.context().close();
  });
});
