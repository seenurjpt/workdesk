/**
 * The focus screen opens by growing out of the timer dock, and shrinks back into it when closed.
 * Before either happens, call this: it writes the dock's current position into CSS variables that
 * the `focus-expand` / `focus-collapse` animations (globals.css) start from or end at.
 */
export function captureDockRect(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const el = document.querySelector('[aria-label="Running timer"]');
  const r = el?.getBoundingClientRect();
  // No dock on screen (it was never shown): grow from where it would be, bottom centre.
  const box =
    r && r.width > 0
      ? { top: r.top, right: r.right, bottom: r.bottom, left: r.left, height: r.height }
      : (() => {
          const bw = Math.min(w - 24, 420);
          return {
            top: h - 80,
            right: (w + bw) / 2,
            bottom: h - 24,
            left: (w - bw) / 2,
            height: 56,
          };
        })();
  const s = document.documentElement.style;
  s.setProperty("--dock-top", `${Math.round(box.top)}px`);
  s.setProperty("--dock-right", `${Math.round(w - box.right)}px`);
  s.setProperty("--dock-bottom", `${Math.round(h - box.bottom)}px`);
  s.setProperty("--dock-left", `${Math.round(box.left)}px`);
  s.setProperty("--dock-radius", `${Math.round(box.height / 2)}px`);
}
