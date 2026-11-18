import {
  checkbox,
  choose,
  clearToasts,
  expect,
  openEditor,
  quickAdd,
  signUp,
  tab,
  tabCount,
  taskRow,
  test,
  undo,
} from "./fixtures";

test.describe("capturing tasks", () => {
  test("quick add from the top bar parses date, project, tag and priority", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Send report tomorrow 5pm #Clients @report !high");
    await tab(page, "Upcoming");
    const row = taskRow(page, "Send report");
    await expect(row).toBeVisible();
    await expect(row).toContainText("P2");
    await expect(row).toContainText("Clients");
    await expect(row).toContainText("@report");
    await expect(row).toContainText(/5:00 PM|17:00/);
    // The new project exists in the sidebar.
    await expect(page.getByRole("link", { name: /^Clients/ })).toBeVisible();
  });

  test("the live preview shows what was understood, and rejects an empty title", async ({
    page,
  }) => {
    await signUp(page);
    const input = page.getByLabel("Quick add task").first();
    await input.fill("Draft plan every monday wait:Priya remind:15m !p1");
    const preview = page.locator("#quick-add-preview");
    await expect(preview).toContainText("Draft plan");
    await expect(preview).toContainText("Waiting on Priya");
    await expect(preview).toContainText(/Remind/i);
    await input.fill("!high");
    await input.press("Enter");
    await expect(page.getByText("Add a title for the task")).toBeVisible();
  });

  test("Q opens quick add, Enter saves, the dialog closes", async ({ page }) => {
    await signUp(page);
    await page.mouse.click(700, 400);
    await page.keyboard.press("q");
    const dialog = page.getByRole("dialog", { name: "Quick add" });
    await expect(dialog).toBeVisible();
    await page.keyboard.type("Pay invoice today");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Task added").first()).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(taskRow(page, "Pay invoice")).toBeVisible();
  });

  test("the Add task button at the bottom of a list works", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "First thing today");
    await page.getByRole("button", { name: "Add task" }).last().click();
    const dialog = page.getByRole("dialog", { name: "Quick add" });
    await expect(dialog).toBeVisible();
    await page.keyboard.type("Second thing today");
    await page.keyboard.press("Enter");
    await expect(taskRow(page, "Second thing")).toBeVisible();
  });

  test("Waiting on and recurring tasks", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Contract review wait:Priya tomorrow");
    await page.goto("/waiting");
    await expect(page.getByText("Contract review")).toBeVisible();
    await expect(page.getByText("Priya").first()).toBeVisible();

    await page.goto("/today");
    await quickAdd(page, "Water plants today every week");
    await checkbox(page, "Water plants").click();
    await expect(page.getByText("Task completed").first()).toBeVisible();
    // The next occurrence exists, a week out.
    await tab(page, "Upcoming");
    await expect(taskRow(page, "Water plants")).toBeVisible();
  });
});

test.describe("working with tasks", () => {
  test("complete and undo", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Buy milk today");
    await expect(taskRow(page, "Buy milk")).toBeVisible();
    await checkbox(page, "Buy milk").click();
    await expect(page.getByText("Task completed").first()).toBeVisible();
    await expect(page.getByRole("checkbox", { name: 'Complete "Buy milk"' })).toHaveCount(0);
    await undo(page);
    await expect(checkbox(page, "Buy milk")).toBeVisible();
  });

  test("edit every field in the editor and see it on the row", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Plan offsite #Events");
    await quickAdd(page, "Fill-in");
    await openEditor(page, "Plan offsite");
    const dialog = page.getByRole("dialog", { name: "Edit task" });
    await dialog.getByLabel("Title").fill("Plan the offsite");
    await choose(page, "#task-priority", /P1/);
    await choose(page, "#task-project", /No project/);
    await dialog.getByLabel("Due date").fill("2030-05-14");
    await dialog.getByLabel("Time (optional)").fill("10:30");
    await dialog.getByLabel("Tags").fill("travel, q4");
    // reminder
    await choose(page, dialog.getByLabel("Add a reminder"), "1 hour before");
    await expect(dialog.getByText(/1 hour before/).first()).toBeVisible();
    // repeat
    await choose(page, "#repeat-mode", "Every week (same day)");
    // subtasks
    await dialog.getByRole("button", { name: "Add subtask" }).click();
    await dialog.getByLabel("Subtask 1", { exact: true }).fill("Book venue");
    await dialog.getByRole("button", { name: "Save task" }).click();
    await expect(page.getByRole("dialog", { name: "Edit task" })).toHaveCount(0);

    await tab(page, "All");
    const row = taskRow(page, "Plan the offsite");
    await expect(row).toBeVisible();
    await expect(row).toContainText("P1");
    await expect(row).toContainText("@travel");
    await expect(row).toContainText("@q4");
    await expect(row).toContainText("Every week");
    await expect(row).toContainText("0/1 subtasks");
    await expect(row).not.toContainText("Events");

    // reopen: values persisted
    await openEditor(page, "Plan the offsite");
    await expect(page.locator("#task-priority")).toContainText("P1");
    await expect(page.locator("#task-project")).toContainText("No project");
    await expect(page.getByLabel("Due date")).toHaveValue("2030-05-14");
    await expect(page.getByLabel("Subtask 1", { exact: true })).toHaveValue("Book venue");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("delete, undo, then delete again and restore or purge from Trash", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Throwaway one today");
    await quickAdd(page, "Throwaway two today");
    await clearToasts(page);
    await page.getByRole("button", { name: 'Delete "Throwaway one"' }).click();
    await expect(page.getByText("Task deleted").first()).toBeVisible();
    await expect(taskRow(page, "Throwaway one")).toHaveCount(0);
    await undo(page);
    await expect(taskRow(page, "Throwaway one")).toBeVisible();

    for (const t of ["Throwaway one", "Throwaway two"]) {
      await clearToasts(page);
      await page.getByRole("button", { name: `Delete "${t}"` }).click();
      await expect(taskRow(page, t)).toHaveCount(0);
      await expect(page.getByText("Task deleted").first()).toBeVisible();
    }
    await page.goto("/trash");
    await expect(page.getByText("Throwaway one")).toBeVisible();
    await expect(page.getByText("Throwaway two")).toBeVisible();
    await page
      .getByRole("button", { name: /Restore/ })
      .first()
      .click();
    await expect(page.getByText(/restored/i).first()).toBeVisible();
    await page.goto("/today");
    const restored =
      (await taskRow(page, "Throwaway one").count()) +
      (await taskRow(page, "Throwaway two").count());
    expect(restored).toBe(1);
  });

  test("deleting throws the task into a bin that appears, then goes away", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Bin candidate today");
    await expect(page.getByTestId("trash-bin")).toHaveCount(0);
    await clearToasts(page);
    await page.getByRole("button", { name: 'Delete "Bin candidate"' }).click();
    await expect(page.getByTestId("trash-bin")).toBeVisible();
    await expect(page.getByTestId("trash-ghost")).toBeVisible();
    await expect(taskRow(page, "Bin candidate")).toHaveCount(0);
    // the ghost lands and is removed; the bin counts it, then leaves on its own
    await expect(page.getByTestId("trash-ghost")).toHaveCount(0);
    await expect(page.getByTestId("trash-bin")).toContainText("1");
    await expect(page.getByTestId("trash-bin")).toHaveCount(0, { timeout: 8000 });
    // undo still works
    await undo(page);
    await expect(taskRow(page, "Bin candidate")).toBeVisible();
  });

  test("tab counts agree with their lists", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Late invoice yesterday");
    await quickAdd(page, "Standup prep today");
    await quickAdd(page, "Contract draft in 3 days");
    await quickAdd(page, "Annual audit in 6 weeks");
    await quickAdd(page, "Reading list");

    await tab(page, "All");
    expect(await tabCount(page, "All")).toBe(5);
    for (const [name, headings] of [
      ["All", ["Overdue", "Today", "Upcoming", "Later", "No date"]],
    ] as const) {
      for (const h of headings)
        await expect(
          page
            .getByRole("heading", { name: new RegExp(`^${h}`), level: 2 })
            .or(page.getByText(new RegExp(`^${h}\\d*$`)))
            .first(),
        ).toBeVisible();
      void name;
    }
    const rows = async () => page.getByRole("checkbox", { name: /^Complete "/ }).count();
    expect(await rows()).toBe(5);

    await tab(page, "Overdue");
    expect(await tabCount(page, "Overdue")).toBe(1);
    expect(await rows()).toBe(1);
    await tab(page, "Upcoming");
    expect(await tabCount(page, "Upcoming")).toBe(1);
    expect(await rows()).toBe(1);
    await expect(taskRow(page, "Contract draft")).toBeVisible();
    await tab(page, "Today");
    expect(await tabCount(page, "Today")).toBe(1);
    await expect(taskRow(page, "Standup prep")).toBeVisible();
    await expect(taskRow(page, "Late invoice")).toBeVisible();
  });

  test("keyboard: E edits, Space completes, 1-4 sets priority", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Keyboard task today");
    const row = taskRow(page, "Keyboard task");
    await row.focus();
    await page.keyboard.press("2");
    await expect(taskRow(page, "Keyboard task")).toContainText("P2");
    await page.keyboard.press("e");
    await expect(page.getByRole("dialog", { name: "Edit task" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Edit task" })).toHaveCount(0);
    await taskRow(page, "Keyboard task").focus();
    await page.keyboard.press("Space");
    await expect(page.getByText("Task completed").first()).toBeVisible();
  });

  test("go-to shortcuts, the shortcut help and the command palette", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Findable thing today");
    await page.mouse.click(700, 400);
    for (const [keys, url] of [
      [["g", "n"], /\/notes$/],
      [["g", "b"], /\/board$/],
      [["g", "c"], /\/calendar$/],
      [["g", "i"], /\/inbox$/],
      [["g", "a"], /\/today\?tab=all$/],
      [["g", "t"], /\/today$/],
    ] as const) {
      await page.keyboard.press(keys[0]);
      await page.keyboard.press(keys[1]);
      await expect(page).toHaveURL(url);
    }
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toContainText("Keyboard shortcuts");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();
    await page.keyboard.type("Findable");
    await expect(palette.getByText("Findable thing").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await page.keyboard.type("Go to Board");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/board$/);
  });
});
