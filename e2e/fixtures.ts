import { test as base, expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-1";

/** Every test fails if the browser logs an error or throws, so silent bugs cannot slip through. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
      });
      await use(errors);
      expect(errors, "browser errors during the test").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

let counter = 0;
export function uniqueEmail(tag = "u"): string {
  counter += 1;
  return `e2e-${tag}-${Date.now()}-${counter}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Creates a new account through the real sign-up form and lands on Today. */
export async function signUp(page: Page, name = "E2E Tester", email = uniqueEmail()) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/today");
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  return { name, email };
}

/** Signs in through the form. Pass `stay` when you are already on the login page (to keep ?next=). */
export async function signIn(page: Page, email: string, password = PASSWORD, stay = false) {
  if (!stay) await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Adds a task through the top bar quick-add and waits for it to be saved. */
export async function quickAdd(page: Page, text: string) {
  const input = page.getByLabel("Quick add task").first();
  await input.fill(text);
  await input.press("Enter");
  await expect(page.getByText("Task added").first()).toBeVisible();
  await expect(input).toHaveValue("");
}

export function taskRow(page: Page, title: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Edit "${title}"`, exact: true }) })
    .first();
}

/** Chooses an option in one of the app's custom dropdowns. */
export async function choose(
  page: Page,
  trigger: string | ReturnType<Page["locator"]>,
  option: string | RegExp,
) {
  const el = typeof trigger === "string" ? page.locator(trigger) : trigger;
  await el.click();
  await page.getByRole("option", { name: option }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

export function checkbox(page: Page, title: string) {
  return page.getByRole("checkbox", { name: `Complete "${title}"`, exact: true });
}

export async function openEditor(page: Page, title: string) {
  await page
    .getByRole("button", { name: `Edit "${title}"`, exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Edit task" })).toBeVisible();
}

/** Clicks the Undo action on the latest toast. */
export async function undo(page: Page) {
  await page.locator("[data-sonner-toast]").getByRole("button", { name: "Undo" }).first().click();
}

export async function tab(page: Page, name: "All" | "Today" | "Upcoming" | "Overdue") {
  await page
    .getByRole("navigation", { name: "Task views" })
    .getByRole("link", { name: new RegExp(`^${name}`) })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Task views" })
      .getByRole("link", { name: new RegExp(`^${name}`) }),
  ).toHaveAttribute("aria-current", "page");
}

/** The number shown on a tab pill. */
export async function tabCount(page: Page, name: string): Promise<number> {
  const text = await page
    .getByRole("navigation", { name: "Task views" })
    .getByRole("link", { name: new RegExp(`^${name}`) })
    .innerText();
  return Number(text.replace(/\D/g, ""));
}

/** Waits for toasts to go away: they sit at the bottom right and can cover a row's buttons. */
export async function clearToasts(page: Page) {
  await page.mouse.move(2, 2); // a pointer resting on a toast keeps it open
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
}
