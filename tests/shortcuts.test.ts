import { describe, expect, it } from "vitest";
import { GO_TARGETS, SEQUENCE_WINDOW_MS, SHORTCUTS, stepSequence } from "@/lib/shortcuts";

const idle = { pendingSince: null };

describe("g-then-key sequences", () => {
  it("navigates on g then a target key", () => {
    const a = stepSequence(idle, "g", 1000);
    expect(a.consumed).toBe(true);
    expect(a.navigate).toBeUndefined();
    const b = stepSequence(a.state, "t", 1500);
    expect(b).toMatchObject({ navigate: "/today", consumed: true, state: { pendingSince: null } });
  });
  it("covers every documented target", () => {
    for (const [k, path] of Object.entries(GO_TARGETS)) {
      const s = stepSequence(stepSequence(idle, "g", 0).state, k, 100);
      expect(s.navigate).toBe(path);
    }
  });
  it("is case-insensitive", () => {
    expect(stepSequence(stepSequence(idle, "G", 0).state, "U", 10).navigate).toBe(
      "/today?tab=upcoming",
    );
  });
  it("expires after the window", () => {
    const a = stepSequence(idle, "g", 0);
    const b = stepSequence(a.state, "t", SEQUENCE_WINDOW_MS + 1);
    expect(b.navigate).toBeUndefined();
    expect(b.consumed).toBe(false);
  });
  it("cancels on an unrelated key and lets that key through", () => {
    const a = stepSequence(idle, "g", 0);
    const b = stepSequence(a.state, "x", 100);
    expect(b).toMatchObject({ consumed: false, state: { pendingSince: null } });
  });
  it("g twice restarts the window", () => {
    const a = stepSequence(idle, "g", 0);
    const b = stepSequence(a.state, "g", 500);
    expect(b.state.pendingSince).toBe(500);
    expect(stepSequence(b.state, "n", 900).navigate).toBe("/notes");
  });
  it("ignores keys when nothing is pending", () => {
    const r = stepSequence(idle, "t", 0);
    expect(r.consumed).toBe(false);
    expect(r.navigate).toBeUndefined();
  });
  it("documents every navigation shortcut", () => {
    const go = SHORTCUTS.find((g) => g.group === "Go to")!;
    expect(go.items).toHaveLength(Object.keys(GO_TARGETS).length);
  });
});
