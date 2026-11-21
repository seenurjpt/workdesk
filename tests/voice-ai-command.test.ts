import { describe, expect, it } from "vitest";
import { aiResultSchema, toVoiceCommand } from "@/lib/voice-ai-command";
import { encodeWav } from "@/lib/cloud-speech";

const VOCAB = {
  projects: [{ id: "p1", name: "Client A" }],
  tags: ["finance"],
};
const map = (raw: unknown) => toVoiceCommand(aiResultSchema.parse(raw), VOCAB);

describe("Gemini answer → voice command", () => {
  it("adds tasks with Gemini's quick-add text as is", () => {
    expect(
      map({ transcript: "x", action: "add_task", task_text: "Call Priya tomorrow 4:30pm #ClientA" }),
    ).toEqual({ type: "addTask", text: "Call Priya tomorrow 4:30pm #ClientA", formatted: true });
  });

  it("only opens pages, projects and tags that exist", () => {
    expect(map({ transcript: "x", action: "navigate", target: "/notes" })).toMatchObject({
      type: "navigate",
      path: "/notes",
    });
    expect(map({ transcript: "x", action: "navigate", target: "project:p1" })).toMatchObject({
      path: "/projects/p1",
    });
    expect(map({ transcript: "x", action: "navigate", target: "tag:Finance" })).toMatchObject({
      path: "/tags/finance",
    });
    for (const target of ["/admin", "https://evil.example", "project:nope", "tag:secret", ""]) {
      expect(map({ transcript: "x", action: "navigate", target })).toEqual({
        type: "unknown",
        heard: "x",
      });
    }
  });

  it("needs the fields each action depends on", () => {
    expect(map({ transcript: "x", action: "complete_task", query: " report " })).toEqual({
      type: "complete",
      query: "report",
    });
    expect(map({ transcript: "x", action: "complete_task" })).toMatchObject({ type: "unknown" });
    expect(map({ transcript: "x", action: "theme" })).toMatchObject({ type: "unknown" });
    expect(map({ transcript: "x", action: "add_task", task_text: "  " })).toMatchObject({
      type: "unknown",
    });
  });

  it("rejects actions it doesn't know", () => {
    expect(aiResultSchema.safeParse({ transcript: "x", action: "delete_everything" }).success).toBe(
      false,
    );
  });
});

describe("encodeWav", () => {
  it("writes a 16-bit mono PCM WAV", async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1, 0.5]));
    expect(blob.type).toBe("audio/wav");
    const view = new DataView(await blob.arrayBuffer());
    expect(view.byteLength).toBe(44 + 8);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });
});
