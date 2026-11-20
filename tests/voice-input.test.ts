import { describe, expect, it } from "vitest";
import { pickBestTranscript, spokenToQuickAdd } from "@/lib/voice-input";
import { parseQuickAdd } from "@/lib/quick-add-parser";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-11-17T04:30:00Z"); // Tue 17 Nov 2026, 10:00 IST
const VOCAB = { projects: ["Client A", "Internal", "Hiring", "General"], tags: ["docs", "finance"] };
const say = (spoken: string) => spokenToQuickAdd(spoken, VOCAB);
const parse = (spoken: string) => parseQuickAdd(say(spoken), { timezone: TZ, now: NOW });
const ist = (d?: Date) =>
  d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().replace("Z", "") : undefined;

describe("spokenToQuickAdd", () => {
  it("turns a full spoken sentence into quick-add syntax", () => {
    expect(say("call Priya tomorrow at 4 p.m. high priority remind me 15 minutes before.")).toBe(
      "Call Priya tomorrow at 4pm !high remind:15m",
    );
  });

  it("understands priority phrasing", () => {
    expect(say("fix login bug urgent priority")).toBe("Fix login bug !urgent");
    expect(say("fix login bug priority low")).toBe("Fix login bug !low");
    expect(say("fix login bug priority one")).toBe("Fix login bug !p1");
    expect(say("fix login bug p 3")).toBe("Fix login bug !p3");
    expect(say("fix login bug it's urgent")).toBe("Fix login bug !urgent");
  });

  it("understands reminders and waiting on", () => {
    expect(say("pay rent friday remind me an hour before")).toBe("Pay rent friday remind:1h");
    expect(say("pay rent friday and remind me half an hour before")).toBe(
      "Pay rent friday remind:30m",
    );
    expect(say("pay rent friday remind me fifteen minutes before")).toBe(
      "Pay rent friday remind:15m",
    );
    expect(say("contract draft waiting on Rahul")).toBe("Contract draft wait:Rahul");
  });

  it("understands spoken clock times", () => {
    expect(say("call tomorrow at four thirty pm")).toBe("Call tomorrow at 4:30pm");
    expect(say("call tomorrow at 10 30 am")).toBe("Call tomorrow at 10:30am");
    expect(say("call tomorrow at half past four")).toBe("Call tomorrow at 4:30pm");
    expect(say("call tomorrow at quarter to five")).toBe("Call tomorrow at 4:45pm");
    expect(say("call tomorrow at three o'clock")).toBe("Call tomorrow at 3pm");
    expect(say("call tomorrow at four")).toBe("Call tomorrow at 4pm");
    expect(say("call tomorrow at ten")).toBe("Call tomorrow at 10:00");
    expect(say("call at midday")).toBe("Call at noon");
  });

  it("understands parts of the day", () => {
    expect(say("call tomorrow morning")).toBe("Call tomorrow 9am");
    expect(say("call this evening")).toBe("Call today 6pm");
    expect(say("call tonight")).toBe("Call today 8pm");
    expect(say("call tomorrow morning at 10 am")).toBe("Call tomorrow at 10am");
    expect(say("send report by end of the day")).toBe("Send report today 5pm");
    expect(say("send report by EOD")).toBe("Send report today 5pm");
    expect(say("send report by end of the week")).toBe("Send report friday 5pm");
  });

  it("matches the user's projects and tags", () => {
    expect(say("send invoice hashtag client A")).toBe("Send invoice #ClientA");
    expect(say("send invoice in project client A")).toBe("Send invoice #ClientA");
    expect(say("send invoice for client A tomorrow")).toBe("Send invoice #ClientA tomorrow");
    expect(say("send invoice for cliant A")).toBe("Send invoice #ClientA");
    expect(say("update policy tagged finance")).toBe("Update policy @finance");
    // Unknown names are left alone, except an explicit "hashtag".
    expect(say("send invoice in project Phoenix")).toBe("Send invoice in project Phoenix");
    expect(say("send invoice hashtag Phoenix")).toBe("Send invoice #Phoenix");
  });

  it("leaves ordinary words alone", () => {
    expect(say("finish the project report")).toBe("Finish the project report");
    expect(say("remind me to buy milk")).toBe("Remind me to buy milk");
    expect(say("ask for general feedback")).toBe("Ask for general feedback");
    expect(say("buy two apples")).toBe("Buy two apples");
    expect(say("tag Rahul in the doc")).toBe("Tag Rahul in the doc");
    expect(say("")).toBe("");
  });

  it("feeds the quick-add parser", () => {
    const r = parse(
      "call Priya tomorrow at four thirty p.m. high priority for client A remind me 15 minutes before",
    );
    expect(r.title).toBe("Call Priya");
    expect(r.priority).toBe(2);
    expect(r.projectName).toBe("ClientA");
    expect(r.remindOffsetMin).toBe(15);
    expect(ist(r.dueAt)).toBe("2026-11-18T16:30:00.000");

    const m = parse("prepare slides tomorrow morning");
    expect(m.allDay).toBe(false);
    expect(ist(m.dueAt)).toBe("2026-11-18T09:00:00.000");
  });
});

describe("pickBestTranscript", () => {
  it("prefers a guess that names the user's project", () => {
    expect(
      pickBestTranscript(
        [
          { transcript: "send invoice to client hey", confidence: 0.82 },
          { transcript: "send invoice to client A", confidence: 0.7 },
        ],
        VOCAB,
      ),
    ).toBe("send invoice to client A");
  });

  it("otherwise keeps the engine's most confident guess", () => {
    expect(
      pickBestTranscript(
        [
          { transcript: "buy milk", confidence: 0.9 },
          { transcript: "by milk", confidence: 0.4 },
        ],
        VOCAB,
      ),
    ).toBe("buy milk");
  });
});
