/** localStorage key holding "light", "dark" or "system". */
export const THEME_KEY = "theme";

/**
 * Runs before first paint (inlined into <head> by the root layout, on the server) so there is no
 * flash of the wrong theme. Keep in step with `apply` in the theme provider.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}`;
