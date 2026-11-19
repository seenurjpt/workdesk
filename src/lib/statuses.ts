/**
 * Task statuses. Four are built in and cannot be changed (To do, In progress, Blocked, Done).
 * People can add their own (for example "In review" or "Waiting for QA") for their own account.
 * A custom status counts as open work, like To do: only Done means finished.
 */

export interface CustomStatus {
  /** Stable id, never shown. Tasks store this, so renaming a status keeps its tasks. */
  key: string;
  name: string;
}

export interface StatusOption {
  value: string;
  title: string;
  custom: boolean;
}

export const MAX_CUSTOM_STATUSES = 6;
export const MAX_STATUS_NAME = 24;

const BEFORE_DONE = [
  { value: "todo", title: "To do" },
  { value: "in_progress", title: "In progress" },
  { value: "blocked", title: "Blocked" },
];
const DONE = { value: "done", title: "Done" };

export const DEFAULT_STATUS_KEYS = [...BEFORE_DONE.map((s) => s.value), DONE.value];

/**
 * Board and menu order. Everything except Done can be put in any order (`order` is the saved list
 * of keys). Anything not in `order` yet, such as a status added since, goes after the ordered ones
 * in its natural place. Done is always last.
 */
export function statusList(
  custom: readonly CustomStatus[] = [],
  order: readonly string[] = [],
): StatusOption[] {
  const open: StatusOption[] = [
    ...BEFORE_DONE.map((s) => ({ ...s, custom: false })),
    ...custom.map((c) => ({ value: c.key, title: c.name, custom: true })),
  ];
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  // Array.sort is stable, so equal ranks keep their natural order.
  const sorted = [...open].sort((a, b) => rank(a.value) - rank(b.value));
  return [...sorted, { ...DONE, custom: false }];
}

export function statusName(
  key: string,
  custom: readonly CustomStatus[] = [],
  order: readonly string[] = [],
): string {
  return statusList(custom, order).find((s) => s.value === key)?.title ?? "To do";
}
