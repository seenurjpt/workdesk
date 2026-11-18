import { describe, expect, it } from "vitest";
import { DEFAULT_SOUND_PREFS, TONES, clampVolume, toneSpec } from "@/lib/sound";

describe("tones", () => {
  it("every tone has audible, sane notes", () => {
    for (const { value } of TONES) {
      const notes = toneSpec(value);
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.freq).toBeGreaterThan(100);
        expect(n.freq).toBeLessThan(8000);
        expect(n.duration).toBeGreaterThan(0.05);
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(1);
        expect(n.start).toBeGreaterThanOrEqual(0);
      }
      // never longer than a couple of seconds: a reminder, not a song
      expect(Math.max(...notes.map((n) => n.start + n.duration))).toBeLessThan(2);
    }
  });
  it("offers distinct tones", () => {
    const sigs = TONES.map(({ value }) => JSON.stringify(toneSpec(value)));
    expect(new Set(sigs).size).toBe(TONES.length);
  });
  it("clamps volume", () => {
    expect(clampVolume(5)).toBe(1);
    expect(clampVolume(0)).toBe(0.1);
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(NaN)).toBe(DEFAULT_SOUND_PREFS.volume);
  });
});
