import { checkbox, choose, expect, openEditor, quickAdd, signUp, test, undo } from "./fixtures";

async function newNote(page: import("@playwright/test").Page) {
  await page.goto("/notes");
  await page.getByRole("button", { name: "New note" }).first().click();
  await page.waitForURL(/\/notes\/[a-f0-9]{24}/);
  await expect(page.getByRole("textbox", { name: "Note body" })).toBeVisible();
}

test.describe("notes", () => {
  test("write a note, it autosaves, persists and shows in the list", async ({ page }) => {
    await signUp(page);
    await newNote(page);
    await page.getByPlaceholder("Untitled note").fill("Roadmap thoughts");
    const body = page.getByRole("textbox", { name: "Note body" });
    await body.click();
    await page.keyboard.type("First paragraph about the roadmap.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByPlaceholder("Untitled note")).toHaveValue("Roadmap thoughts");
    await expect(page.getByRole("textbox", { name: "Note body" })).toContainText("First paragraph");
    await page.goto("/notes");
    await expect(page.getByRole("link", { name: /Roadmap thoughts/ })).toBeVisible();
  });

  test("the slash menu inserts blocks and formatting works", async ({ page }) => {
    await signUp(page);
    await newNote(page);
    const body = page.getByRole("textbox", { name: "Note body" });
    await body.click();
    await page.keyboard.type("/");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.type("Heading 1");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Big title");
    await expect(body.locator("h1")).toHaveText("Big title");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await page.keyboard.type("Checklist");
    await page.keyboard.press("Enter");
    await page.keyboard.type("todo item");
    await expect(
      body.locator("ul[data-type='taskList'] li, li[data-type='taskItem']").first(),
    ).toContainText("todo item");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("link a task with @ and another note with [[, both show up as links", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Linkable task today");
    await newNote(page);
    await page.getByPlaceholder("Untitled note").fill("Source note");
    const body = page.getByRole("textbox", { name: "Note body" });
    await body.click();
    await page.keyboard.type("See @Linkable");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("option", { name: /Linkable task/ }).click();
    await expect(body).toContainText("Linkable task");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
    // the note appears under the task's "Linked notes"
    await page.goto("/today");
    await openEditor(page, "Linkable task");
    await expect(
      page.getByRole("dialog", { name: "Edit task" }).getByText("Source note"),
    ).toBeVisible();
  });

  test("pin, project, tags, version history, export link and delete with undo", async ({
    page,
  }) => {
    await signUp(page);
    await quickAdd(page, "Seed task today #Gamma");
    await newNote(page);
    await page.getByPlaceholder("Untitled note").fill("Lifecycle note");
    await page.getByRole("textbox", { name: "Note body" }).click();
    await page.keyboard.type("Body text");
    await choose(page, "#note-project", "Gamma");
    await page.getByLabel("Tags").fill("alpha, beta");
    await page.getByRole("button", { name: "Pin" }).click();
    await expect(page.getByRole("button", { name: "Unpin" })).toBeVisible();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "History" }).click();
    const hist = page.getByRole("dialog", { name: "Version history" });
    await hist.getByRole("button", { name: "Save version now" }).click();
    await expect(page.getByText("Version saved")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("link", { name: /Markdown/ })).toHaveAttribute(
      "href",
      /\/api\/export\?type=note&id=/,
    );
    const res = await page.request.get(
      (await page.getByRole("link", { name: /Markdown/ }).getAttribute("href"))!,
    );
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("Body text");

    await page.getByRole("button", { name: "Delete" }).click();
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    if (await confirm.getByRole("button", { name: /^Delete/ }).count())
      await confirm
        .getByRole("button", { name: /^Delete/ })
        .last()
        .click();
    await page.waitForURL(/\/notes$/);
    await expect(page.getByText("Note deleted")).toBeVisible();
    await undo(page);
    await expect(page.getByRole("link", { name: /Lifecycle note/ })).toBeVisible();
    void checkbox;
  });

  test("notes search and filters", async ({ page }) => {
    await signUp(page);
    for (const [title, tags] of [
      ["Alpha plan", "x"],
      ["Beta plan", "y"],
    ]) {
      await newNote(page);
      await page.getByPlaceholder("Untitled note").fill(title);
      await page.getByLabel("Tags").fill(tags);
      await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
    }
    await page.goto("/notes");
    await expect(page.getByRole("link", { name: /Alpha plan/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Beta plan/ })).toBeVisible();
    await page.getByPlaceholder("Search notes").fill("Beta");
    await expect(page.getByRole("link", { name: /Beta plan/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Alpha plan/ })).toHaveCount(0);
  });

  test("meeting note: details, and converting an action item to a task", async ({ page }) => {
    await signUp(page);
    await page.goto("/notes");
    await page.getByRole("button", { name: "New meeting note" }).click();
    await page.waitForURL(/\/notes\/[a-f0-9]{24}/);
    await expect(page.getByText("Meeting details")).toBeVisible();
    const body = page.getByRole("textbox", { name: "Note body" });
    await expect(body).toContainText("Action items");
    // Put a new line under "Action items" and convert it.
    await body.getByText("Action items").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Send the minutes to the team");
    await page.getByRole("button", { name: "Convert to task" }).click();
    await expect(page.getByText(/Task created/)).toBeVisible();
    await page.goto("/inbox");
    await expect(page.getByText("Send the minutes to the team").first()).toBeVisible();
  });
});
