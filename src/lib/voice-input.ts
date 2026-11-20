/**
 * Turns natural speech into quick-add syntax, so saying
 * "call Priya tomorrow at four thirty p.m. high priority in project client A"
 * gives the same result as typing
 * "Call Priya tomorrow at 4:30pm !high #ClientA".
 *
 * Only unambiguous phrases are rewritten. Project and tag phrases are only
 * rewritten when they match a project or tag the user already has, so normal
 * words in a title are left alone.
 */

export interface VoiceVocabulary {
  projects: string[];
  tags: string[];
}

const EMPTY_VOCAB: VoiceVocabulary = { projects: [], tags: [] };

/* ---------- numbers ---------- */

const ONES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };

const ONES_RE = Object.keys(ONES).join("|");
const TEENS_RE = Object.keys(TEENS).join("|");
const TENS_RE = Object.keys(TENS).join("|");

/** 1–12 as a word or digits. */
const HOUR_RE = `(?:1[0-2]|0?[1-9]|${ONES_RE}|ten|eleven|twelve)`;
/** 00–59 as digits, "oh five", "fifteen", "forty five", "forty-five". */
const MIN_RE = `(?:[0-5]\\d|(?:oh|o)\\s+(?:${ONES_RE})|(?:${TENS_RE})(?:[\\s-](?:${ONES_RE}))?|${TEENS_RE})`;

function wordNumber(raw: string): number | undefined {
  const w = raw.toLowerCase().trim();
  if (/^\d+$/.test(w)) return Number(w);
  if (w in ONES) return ONES[w];
  if (w in TEENS) return TEENS[w];
  if (w in TENS) return TENS[w];
  const oh = w.match(/^(?:oh|o)\s+(\w+)$/);
  if (oh) return ONES[oh[1]];
  const compound = w.match(/^(\w+)[\s-](\w+)$/);
  if (compound && compound[1] in TENS && compound[2] in ONES) {
    return TENS[compound[1]] + ONES[compound[2]];
  }
  if (w === "a" || w === "an") return 1;
  if (w === "half an" || w === "half") return 0.5;
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "4" + "30" + "pm" → "4:30pm"; with no am/pm, 1–7 o'clock is taken as pm (work hours). */
function clock(hour: number, minute: number, meridiem: string | undefined, guessPm: boolean) {
  const time = minute ? `${hour}:${pad(minute)}` : `${hour}`;
  if (meridiem) return `${time}${meridiem.toLowerCase()}m`;
  if (guessPm && hour >= 1 && hour <= 7) return `${time}pm`;
  return minute ? time : `${time}:00`;
}

/* ---------- name matching ---------- */

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

/** Levenshtein distance, capped for speed. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Finds the known name best matching the first 1–4 words of `words`.
 * Exact matches (ignoring case/spaces/punctuation) win; otherwise one typo
 * is allowed for names of 5+ letters ("client hay" won't match, "cliant a" will).
 */
function matchName(words: string[], names: string[]): { name: string; used: number } | undefined {
  let best: { name: string; used: number; cost: number } | undefined;
  for (let used = Math.min(4, words.length); used >= 1; used--) {
    const spoken = normalizeName(words.slice(0, used).join(""));
    if (!spoken) continue;
    for (const name of names) {
      const key = normalizeName(name);
      if (!key) continue;
      const cost = spoken === key ? 0 : key.length >= 5 ? distance(spoken, key) : 9;
      if (cost <= 1 && (!best || cost < best.cost || (cost === best.cost && used > best.used))) {
        best = { name, used, cost };
      }
    }
  }
  return best && { name: best.name, used: best.used };
}

/** Quick-add tokens can't contain spaces: "Client A" → "ClientA" (the server matches it back). */
const token = (name: string) => name.replace(/[^\p{L}\p{M}\p{N}_-]/gu, "");

/* ---------- main ---------- */

const DAY_WORDS = "today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this";
const PART_OF_DAY: Record<string, string> = {
  morning: "9am",
  afternoon: "2pm",
  evening: "6pm",
  night: "8pm",
};

const AFTER_PROJECT =
  /^(?:[!#@]|remind:|wait:|\d|today|tomorrow|tonight|next|this|on|at|by|every|before|monday|tuesday|wednesday|thursday|friday|saturday|sunday|noon)/i;

export function spokenToQuickAdd(input: string, vocab: VoiceVocabulary = EMPTY_VOCAB): string {
  let text = ` ${input.trim()} `;
  const END = `(?=[\\s,.!?])`;

  // "4 p.m." / "9 A.M." → "4 pm" / "9 am" (joined to the number below)
  text = text.replace(/\b([ap])\.\s?m\.?(?=[\s,!?]|$)/gi, (_, ap) => `${ap.toLowerCase()}m`);
  text = text.replace(/\b([AP])M\b/g, (_, ap) => `${ap.toLowerCase()}m`);
  text = text.replace(/\bmidday\b/gi, "noon");

  // "half past four (pm)", "quarter past 4", "quarter to five"
  text = text.replace(
    new RegExp(
      `\\s(?:a\\s+)?(half|quarter)\\s+(past|to)\\s+(${HOUR_RE})(?:\\s+o'?clock)?(?:\\s*([ap])m)?${END}`,
      "gi",
    ),
    (match, part, dir, h, ap) => {
      let hour = wordNumber(h);
      if (!hour) return match;
      let minute = part.toLowerCase() === "half" ? 30 : 15;
      if (dir.toLowerCase() === "to") {
        if (part.toLowerCase() === "half") return match;
        minute = 45;
        hour = hour === 1 ? 12 : hour - 1;
      }
      return ` ${clock(hour, minute, ap, true)}`;
    },
  );

  // "four thirty pm", "10 30 pm", "four pm", "at four", "at four o'clock"
  text = text.replace(
    new RegExp(
      `\\s(at\\s+)?(${HOUR_RE})(?:[\\s:]+(${MIN_RE}))?(\\s+o'?clock)?(?:\\s*([ap])m)?${END}`,
      "gi",
    ),
    (match, at, h, m, oclock, ap) => {
      // Only treat it as a time when it clearly is one: "at …", "o'clock" or am/pm.
      if (!at && !oclock && !ap) return match;
      const hour = wordNumber(h);
      const minute = m ? wordNumber(m) : 0;
      if (!hour || minute === undefined || minute >= 60) return match;
      return ` ${at ? "at " : ""}${clock(hour, minute, ap, true)}`;
    },
  );

  // "tomorrow morning" → "tomorrow 9am", "this evening" → "today 6pm", "tonight" → "today 8pm".
  // If a clock time was also said ("tomorrow morning at 10"), keep that time instead.
  const saidTime = /\d(?::\d\d)?[ap]m\b|\d:\d\d\b|\bnoon\b|\bmidnight\b/i.test(text);
  text = text.replace(
    new RegExp(`\\s(${DAY_WORDS})\\s+(morning|afternoon|evening|night)${END}`, "gi"),
    (_, day: string, part: string) => {
      const d = day.toLowerCase() === "this" ? "today" : day;
      return saidTime ? ` ${d}` : ` ${d} ${PART_OF_DAY[part.toLowerCase()]}`;
    },
  );
  text = text.replace(/\stonight(?=[\s,.!?])/gi, saidTime ? " today" : " today 8pm");
  // "by end of (the) day" / "EOD" → today 5pm; "end of (the) week" → friday 5pm
  text = text.replace(
    /\s(?:by\s+)?(?:the\s+)?(?:end\s+of\s+(?:the\s+)?day|eod)(?=[\s,.!?])/gi,
    " today 5pm",
  );
  text = text.replace(
    /\s(?:by\s+)?(?:the\s+)?end\s+of\s+(?:the\s+)?week(?=[\s,.!?])/gi,
    " friday 5pm",
  );

  // Priority: "high priority", "priority high", "priority one", "p 1", "urgent"
  text = text.replace(
    new RegExp(
      `\\s(?:(urgent|high|medium|low)\\s+priority|priority\\s+(?:is\\s+)?(urgent|high|medium|low))${END}`,
      "gi",
    ),
    (_, a, b) => ` !${(a ?? b).toLowerCase()}`,
  );
  text = text.replace(
    new RegExp(`\\s(?:priority|p)\\s+(?:is\\s+)?(one|two|three|four|[1-4])${END}`, "gi"),
    (_, n) => ` !p${wordNumber(n)}`,
  );
  text = text.replace(/\s(?:it'?s\s+)?urgent(?=[\s,.!?]*$)/i, " !urgent");

  // Reminders: "remind me 15 minutes before", "remind me half an hour before", "a day before"
  text = text.replace(
    new RegExp(
      `\\s(?:and\\s+)?remind\\s+me\\s+(\\d+|${ONES_RE}|${TEENS_RE}|(?:${TENS_RE})(?:[\\s-](?:${ONES_RE}))?|an?|half\\s+an)\\s+(minute|hour|day)s?(?:\\s+(?:before|earlier|ahead|in\\s+advance))?${END}`,
      "gi",
    ),
    (match, n, unit) => {
      const value = wordNumber(n);
      if (!value) return match;
      const u = unit.toLowerCase();
      if (value === 0.5) return u === "hour" ? " remind:30m" : match;
      return ` remind:${value}${u === "minute" ? "m" : u === "hour" ? "h" : "d"}`;
    },
  );

  // Waiting on: "waiting on Priya" → wait:Priya
  text = text.replace(/\swaiting\s+(?:on|for)\s+([A-Za-z][\w'-]*)/gi, (_, who) => ` wait:${who}`);

  // Projects: "hashtag X", "(in|for|under|to) (the) project X", "project X",
  // or "for/in X" at the very end when X is an existing project.
  text = text.replace(
    /\s(?:(?:in|for|under|to|into)\s+(?:the\s+)?)?(hash\s?tag|project)\s+(\S+(?:\s+\S+){0,3})/gi,
    (match, kind: string, rest: string) => {
      const words = rest.split(/\s+/);
      const hit = matchName(words, vocab.projects);
      if (hit) return ` #${token(hit.name)} ${words.slice(hit.used).join(" ")}`;
      // Unknown name: only "hashtag X" is a clear request for a (new) project.
      return /^hash/i.test(kind) ? ` #${token(words[0])} ${words.slice(1).join(" ")}` : match;
    },
  );
  // "send invoice for client A tomorrow": only when the name is followed by the
  // end of the sentence, another command token or a date word.
  if (!/(^|\s)#\S/.test(text)) {
    text = text.replace(/\s(?:in|for|under)\s+(\S+(?:\s+\S+){0,6})/i, (match, rest: string) => {
      const words = rest.split(/\s+/).map((w) => w.replace(/[,.!?]+$/, ""));
      const hit = matchName(words, vocab.projects);
      if (!hit) return match;
      const next = words[hit.used];
      if (next !== undefined && !AFTER_PROJECT.test(next)) return match;
      return ` #${token(hit.name)} ${rest.split(/\s+/).slice(hit.used).join(" ")}`;
    });
  }

  // Tags: "tag X", "tagged X", "label X" when X is an existing tag (or "tag X" for a new one)
  text = text.replace(
    /\s(?:and\s+)?(?:tag(?:ged)?|label(?:led)?)(?:\s+(?:it|as|with))?\s+(\S+(?:\s+\S+){0,2})/gi,
    (match, rest: string) => {
      const words = rest.split(/\s+/);
      const hit = matchName(words, vocab.tags);
      if (hit) return ` @${token(hit.name)} ${words.slice(hit.used).join(" ")}`;
      return match;
    },
  );

  text = text
    .replace(/\s+/g, " ")
    .trim()
    // Phones often add punctuation at the end.
    .replace(/[\s,.。!?]+$/, "")
    // Dangling joiners left after removing phrases: "Call Priya and" → "Call Priya"
    .replace(/\s+(?:and|with|for|in|at|on|by)$/i, "");

  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/* ---------- picking the best guess ---------- */

const COMMAND_WORDS =
  /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|priority|urgent|remind|every|waiting|project|hashtag|[ap]\.?m\b)/gi;

/**
 * Speech engines return several guesses. Prefer the one that mentions the
 * user's own projects/tags and task words, then the engine's confidence.
 */
export function pickBestTranscript(
  alternatives: { transcript: string; confidence: number }[],
  vocab: VoiceVocabulary = EMPTY_VOCAB,
): string {
  if (alternatives.length <= 1) return alternatives[0]?.transcript ?? "";
  const names = [...vocab.projects, ...vocab.tags].map(normalizeName).filter((n) => n.length >= 2);
  let best = alternatives[0];
  let bestScore = -Infinity;
  for (const alt of alternatives) {
    const squashed = normalizeName(alt.transcript);
    const nameHits = names.filter((n) => squashed.includes(n)).length;
    const commandHits = alt.transcript.match(COMMAND_WORDS)?.length ?? 0;
    const score = (alt.confidence || 0) + nameHits * 0.3 + commandHits * 0.05;
    if (score > bestScore) {
      best = alt;
      bestScore = score;
    }
  }
  return best.transcript;
}
