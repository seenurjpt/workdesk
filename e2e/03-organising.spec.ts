import { choose, clearToasts, expect, quickAdd, signUp, taskRow, test } from "./fixtures";

test.describe("projects, tags and general tasks", () => {
  test("create a project, add a task to it, and find it on the project page", async ({ page }) => {
    await signUp(page);
    await page.getByRole("button", { name: "New project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await dialog.getByLabel("Name").fill("Alpha Launch");
    await dialog.getByRole("radio").nth(2).click();
    await dialog.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Project created")).toBeVisible();
    const link = page.getByRole("link", { name: /^Alpha Launch/ });
    await expect(link).toBeVisible();

    await quickAdd(page, "Write launch post today #AlphaLaunch");
    await link.click();
    await expect(page).toHaveURL(/\/projects\/[a-f0-9]{24}/);
    await expect(page.getByRole("heading", { name: "Alpha Launch" })).toBeVisible();
    await expect(taskRow(page, "Write launch post")).toBeVisible();
  });

  test("a task needs no project: it lives in General", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "No project needed today");
    await page.goto("/general");
    await expect(taskRow(page, "No project needed")).toBeVisible();
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  });

  test("tags list their tasks", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Tagged item today @finance");
    await quickAdd(page, "Untagged item today");
    await expect(page.getByRole("button", { name: /^Tags/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.getByRole("link", { name: /finance/ }).click();
    await expect(page).toHaveURL(/\/tags\/finance/);
    await expect(taskRow(page, "Tagged item")).toBeVisible();
    await expect(taskRow(page, "Untagged item")).toHaveCount(0);
  });
});

test.describe("board and calendar", () => {
  test("the board shows columns and moves a card from the menu", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Board card today");
    await page.goto("/board");
    for (const col of ["To do", "In progress", "Done"])
      await expect(page.getByRole("heading", { name: new RegExp(`^${col}`) })).toBeVisible();
    const todo = page.getByRole("list", { name: "To do tasks" });
    await expect(todo.getByText("Board card")).toBeVisible();
    // Opening the menu and choosing is one unit: retry it whole if the menu closes under load.
    await expect(async () => {
      if (!(await page.getByRole("menuitem", { name: "In progress" }).isVisible())) {
        await page.getByRole("button", { name: 'Move "Board card"' }).click();
      }
      await page.getByRole("menuitem", { name: "In progress" }).click({ timeout: 3000 });
      await expect(
        page.getByRole("list", { name: "In progress tasks" }).getByText("Board card"),
      ).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20_000 });
    await expect(todo.getByText("Board card")).toHaveCount(0);
    // survives a reload
    await page.reload();
    await expect(
      page.getByRole("list", { name: "In progress tasks" }).getByText("Board card"),
    ).toBeVisible();
  });

  test("dragging a card with the mouse into an empty column, and between columns, works", async ({
    page,
  }) => {
    await signUp(page);
    await quickAdd(page, "Drag one today");
    await quickAdd(page, "Drag two today");
    await quickAdd(page, "Drag three today");
    // A long To do column makes the empty columns tall too, which is what broke real boards:
    // the drop area's far corners used to count against it.
    for (let i = 1; i <= 12; i += 1) await quickAdd(page, `Filler ${i} today`);
    await clearToasts(page);
    await page.goto("/board");
    const list = (name: string) => page.getByRole("list", { name: `${name} tasks` });
    // a card is labelled "<title>. Press space to pick up and move with arrow keys."
    const card = (title: string) => page.getByLabel(new RegExp(`^${title}\\. Press space`)).first();

    async function drag(
      title: string,
      target: ReturnType<typeof list>,
      where: "middle" | "top" = "middle",
    ) {
      const from = (await card(title).boundingBox())!;
      const to = (await target.boundingBox())!;
      const x = to.x + to.width / 2;
      const y = where === "top" ? to.y + 20 : to.y + Math.min(to.height / 2, 200);
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, {
        steps: 3,
      });
      await page.mouse.move(x, y, { steps: 18 });
      await page.waitForTimeout(250); // a person hovers a moment before letting go
      await page.mouse.up();
    }

    // into an EMPTY column (this used to snap straight back)
    await drag("Drag one", list("In progress"));
    await expect(list("In progress").getByText("Drag one")).toBeVisible();
    await expect(list("To do").getByText("Drag one")).toHaveCount(0);
    // into another empty column
    await drag("Drag two", list("Blocked"));
    await expect(list("Blocked").getByText("Drag two")).toBeVisible();
    // onto a column that already has a card, and back to the first column
    await drag("Drag three", list("Blocked"), "top");
    await expect(list("Blocked").getByText("Drag three")).toBeVisible();
    await expect(list("Blocked").getByText("Drag two")).toBeVisible();
    await drag("Drag one", list("To do"));
    await expect(list("To do").getByText("Drag one")).toBeVisible();
    await expect(list("In progress").getByText("Drag one")).toHaveCount(0);

    // everything survives a reload
    await page.reload();
    await expect(list("Blocked").getByText("Drag two")).toBeVisible();
    await expect(list("Blocked").getByText("Drag three")).toBeVisible();
    await expect(list("To do").getByText("Drag one")).toBeVisible();
  });

  test("group the board by project and priority", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Grouping card today !p1 #Team");
    await page.goto("/board");
    await page.getByRole("button", { name: "Priority", exact: true }).click();
    await expect(page).toHaveURL(/group=priority/);
    await expect(page.getByText("Grouping card")).toBeVisible();
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page).toHaveURL(/group=project/);
    await expect(page.getByText("Grouping card")).toBeVisible();
  });

  test("the calendar adds a task on a day, switches month/week and moves months", async ({
    page,
  }) => {
    await signUp(page);
    await page.goto("/calendar");
    await expect(page.getByRole("grid")).toBeVisible();
    const add = page.getByRole("button", { name: /^Add task on/ }).nth(10);
    await add.hover();
    await add.click();
    const dialog = page.getByRole("dialog", { name: "New task" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox").first().fill("Calendar entry");
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Task added").first()).toBeVisible();
    await expect(page.getByRole("gridcell").getByText("Calendar entry")).toBeVisible();

    await page.getByRole("button", { name: "week", exact: true }).click();
    await expect(page.getByRole("button", { name: "week", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "month", exact: true }).click();
    const heading = page.locator("main").getByRole("heading", { level: 2 }).first();
    await expect(heading).toHaveText(/^[A-Za-z]+ \d{4}$/); // back in month view
    const before = await heading.innerText();
    await page.getByRole("button", { name: /next/i }).first().click();
    await expect(heading).not.toHaveText(before);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(heading).toHaveText(before);
  });
});

test.describe("templates, trash and review", () => {
  test("starter templates exist and can create a note", async ({ page }) => {
    await signUp(page);
    await page.goto("/templates");
    for (const t of ["Meeting notes", "Release checklist", "Client kickoff"])
      await expect(page.getByText(t).first()).toBeVisible();
    await page.getByRole("button", { name: "Create note" }).first().click();
    await page.waitForURL(/\/notes\/[a-f0-9]{24}/);
    await expect(page.getByRole("textbox", { name: "Note body" })).toBeVisible();
  });

  test("trash can be emptied", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Disposable today");
    await clearToasts(page);
    await page.getByRole("button", { name: 'Delete "Disposable"' }).click();
    await page.goto("/trash");
    await expect(page.getByText("Disposable")).toBeVisible();
    await page.getByRole("button", { name: /Empty trash/ }).click();
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await confirm
      .getByRole("button", { name: /Delete forever|Empty|Confirm/ })
      .last()
      .click();
    await expect(page.getByText("Trash emptied")).toBeVisible();
    await expect(page.getByText("Disposable")).toHaveCount(0);
  });

  test("daily and weekly review pages load with their sections", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Review me yesterday");
    await page.goto("/review");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Review me")).toBeVisible();
    await page.goto("/review?tab=weekly");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy weekly report/ })).toBeVisible();
  });
});

test.describe("sidebar", () => {
  test("collapses to icons with tooltips, remembers it, and opens again cleanly", async ({
    page,
  }) => {
    await signUp(page);
    const aside = page.locator("aside").first();
    await expect(aside).toHaveCSS("width", "256px");
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    await expect(aside).toHaveCSS("width", "72px");
    await page.reload();
    await expect(aside).toHaveCSS("width", "72px");

    await aside.getByRole("link", { name: "Board" }).hover();
    await expect(page.getByRole("tooltip").first()).toContainText("Board");
    await expect(page.getByRole("tooltip").first()).toContainText("G");
    await aside.getByRole("link", { name: "Calendar" }).hover();
    await expect(page.getByRole("tooltip").filter({ hasText: "Calendar" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    await expect(aside).toHaveCSS("width", "256px");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    await expect(page.getByRole("tooltip")).toHaveCount(0); // none come back
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
  });

  test("Projects and Tags sections fold and remember", async ({ page }) => {
    await signUp(page);
    await quickAdd(page, "Item today @alpha #Zed");
    const projects = page.getByRole("button", { name: /^Projects/ });
    await expect(projects).toHaveAttribute("aria-expanded", "true");
    await projects.click();
    await expect(projects).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.getByRole("button", { name: /^Projects/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("the search box and add-task box are the same height and aligned", async ({ page }) => {
    await signUp(page);
    const search = await page
      .getByRole("button", { name: /^Search tasks and notes \(Ctrl K\)/ })
      .boundingBox();
    const add = await page.getByLabel("Quick add task").first().boundingBox();
    expect(search && add).toBeTruthy();
    expect(add!.height).toBeCloseTo(search!.height, 0);
    expect(add!.y).toBeCloseTo(search!.y, 0);
    void choose;
  });
});
