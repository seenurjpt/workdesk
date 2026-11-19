/** The quick-add tokens, shared by the Help page and the public Features page. */
export const QUICK_ADD_SYNTAX: { token: string; meaning: string; example: string }[] = [
  {
    token: "tomorrow, friday, 25 dec, in 2 hours",
    meaning: "Due date",
    example: "Call Sam friday",
  },
  {
    token: "5pm, 17:30",
    meaning: "Due time (no time means all day)",
    example: "Standup tomorrow 9:30am",
  },
  {
    token: "#project",
    meaning:
      "Put the task in a project. Case, spaces and punctuation are ignored (#clientA finds “Client A”); no match creates a new project",
    example: "Quote #clientA",
  },
  { token: "@tag", meaning: "Add a tag (use as many as you like)", example: "Draft @docs @q4" },
  {
    token: "!p1 … !p4, !urgent !high !medium !low",
    meaning: "Priority",
    example: "Fix login !urgent",
  },
  {
    token: "every day / weekday / week / month / monday",
    meaning: "Repeat",
    example: "Water plants every week",
  },
  {
    token: 'wait:Priya, wait:"Priya Shah"',
    meaning: "Waiting on someone",
    example: "Contract wait:Priya",
  },
  {
    token: "remind:15m, remind:2h, remind:1d",
    meaning: "Reminder before the due time",
    example: "Demo 3pm remind:30m",
  },
  {
    token: "a Jira or Confluence link",
    meaning: "Recognised and attached as a link",
    example: "Review https://…atlassian.net/browse/ABC-12",
  },
];
