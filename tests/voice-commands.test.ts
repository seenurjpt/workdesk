import { describe, expect, it } from "vitest";
import { parseVoiceCommand, smallTalkReply } from "@/lib/voice-commands";

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

describe("voice commands: small talk", () => {
  it.each([
    ["Good morning", "morning"],
    ["good morning!", "morning"],
    ["Good morning, WorkDesk", "morning"],
    ["Hey", "greeting"],
    ["hello there", "greeting"],
    ["Thank you so much.", "thanks"],
    ["How are you doing", "howAreYou"],
    ["what's up", "howAreYou"],
    ["Who are you?", "whoAreYou"],
    ["what time is it", "time"],
    ["What day is it today", "date"],
  ])("%s", (said, topic) => {
    expect(cmd(said)).toEqual({ type: "smallTalk", topics: [topic] });
  });

  it("understands several pleasantries at once", () => {
    expect(cmd("Hello, good morning! How are you?")).toEqual({
      type: "smallTalk",
      topics: ["greeting", "morning", "howAreYou"],
    });
  });

  it("doesn't swallow real commands", () => {
    expect(cmd("hey open notes")).toMatchObject({ type: "navigate", path: "/notes" });
    expect(cmd("today")).toMatchObject({ type: "navigate", path: "/today" });
    expect(cmd("good morning routine task")).not.toMatchObject({ type: "smallTalk" });
    expect(cmd("help me plan my day")).toMatchObject({ type: "unknown" });
  });
});

describe("small talk replies", () => {
  const at = (iso: string) => ({ name: "Asha Rao", timezone: "Asia/Kolkata", now: new Date(iso) });
  it("greets by first name and the real time of day", () => {
    expect(smallTalkReply(["morning"], at("2026-11-21T03:30:00Z"))).toBe(
      "Good morning, Asha! What can I do for you?",
    );
    // 9 pm in Kolkata: "good morning" gets "good evening" back.
    expect(smallTalkReply(["morning"], at("2026-11-21T15:30:00Z"))).toMatch(/^Good evening, Asha!/);
  });
  it("answers several at once", () => {
    expect(smallTalkReply(["greeting", "morning", "howAreYou"], at("2026-11-21T03:30:00Z"))).toBe(
      "Good morning, Asha! I'm doing great, thanks for asking! What can I do for you?",
    );
  });
  it("tells the time in the user's timezone", () => {
    expect(smallTalkReply(["time"], at("2026-11-21T03:30:00Z"))).toBe("It's 9:00 AM.");
    expect(smallTalkReply(["date"], at("2026-11-21T03:30:00Z"))).toBe("It's Saturday 21 November.");
  });
});
