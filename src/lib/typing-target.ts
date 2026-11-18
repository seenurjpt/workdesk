/**
 * True when a key press is meant for the thing that has focus, not for a global shortcut: text
 * fields, the rich editor, and widgets that use letters or arrows themselves (open dropdowns and
 * menus type-ahead on letters, sliders move on arrows).
 */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return true;
  return Boolean(
    el.closest(
      '[role="listbox"], [role="combobox"], [role="option"], [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="slider"], [role="textbox"]',
    ),
  );
}
