import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "@/lib/voice-commands";

const VOCAB = {
  projects: [
    { id: "p1", name: "Client A" },
    { id: "p2", name: "Hiring" },
  ],
  tags: ["docs", "finance"],
};
const cmd = (s: string) => parseVoiceCommand(s, VOCAB);

describe("voice commands: navigation", () => {
  it.each([
    ["open notes page", "/notes"],
    ["Open notes.", "/notes"],
    ["go to the board", "/board"],
    ["show me my calendar", "/calendar"],
    ["take me to settings please", "/settings"],
    ["can you open the inbox", "/inbox"],
    ["open overdue tasks", "/today?tab=overdue"],
    ["open weekly review", "/review?tab=weekly"],
    ["open review", "/review"],
    ["notes", "/notes"],
    ["open trash", "/trash"],
    ["show activity log", "/activity"],
  ])("%s", (said, path) => {
    expect(cmd(said)).toMatchObject({ type: "navigate", path });
  });

  it("opens the user's projects and tags", () => {
    expect(cmd("open client A")).toMatchObject({ type: "navigate", path: "/projects/p1" });
    expect(cmd("open the hiring project")).toMatchObject({
      type: "navigate",
      path: "/projects/p2",
    });
    expect(cmd("show finance tag")).toMatchObject({ type: "navigate", path: "/tags/finance" });
  });
});

describe("voice commands: tasks", () => {
  it.each([
    ["add a task call Priya tomorrow 5PM", "call Priya tomorrow 5PM"],
    ['add a task for "call priya tomorrow 5PM"', "call priya tomorrow 5PM"],
    ["add task to send the report on Friday", "send the report on Friday"],
    ["create a to-do: book flights", "book flights"],
    ["new task buy milk", "buy milk"],
    ["remind me to pay rent on the 1st", "pay rent on the 1st"],
    ["I need to call the bank tomorrow", "call the bank tomorrow"],
    ["add buy milk to my tasks", "buy milk"],
  ])("%s", (said, text) => {
    expect(cmd(said)).toEqual({ type: "addTask", text });
  });

  it("completes tasks", () => {
    expect(cmd("mark call Priya as done")).toEqual({ type: "complete", query: "call Priya" });
    expect(cmd("complete the task send report")).toEqual({
      type: "complete",
      query: "send report",
    });
    expect(cmd("I finished the invoice")).toEqual({ type: "complete", query: "the invoice" });
  });
});

describe("voice commands: everything else", () => {
  it("notes", () => {
    expect(cmd("new note")).toEqual({ type: "newNote", title: "" });
    expect(cmd("create a note called Sprint ideas")).toEqual({
      type: "newNote",
      title: "Sprint ideas",
    });
    expect(cmd("start a meeting note")).toEqual({ type: "newMeeting" });
  });

  it("search", () => {
    expect(cmd("search for invoice")).toEqual({ type: "search", query: "invoice" });
    expect(cmd("find onboarding checklist")).toEqual({
      type: "search",
      query: "onboarding checklist",
    });
  });

  it("theme, timer, help, cancel", () => {
    expect(cmd("switch to dark mode")).toEqual({ type: "theme", value: "dark" });
    expect(cmd("light mode")).toEqual({ type: "theme", value: "light" });
    expect(cmd("turn off dark mode")).toEqual({ type: "theme", value: "light" });
    expect(cmd("stop the timer")).toEqual({ type: "stopTimer" });
    expect(cmd("what can you do")).toEqual({ type: "help" });
    expect(cmd("never mind")).toEqual({ type: "cancel" });
  });

  it("does not guess", () => {
    expect(cmd("the weather is nice").type).toBe("unknown");
    expect(cmd("").type).toBe("unknown");
  });
});
