// Pure helpers shared by the Merdr mods: pane titles, list positions for the
// sliding selections, and the notification inbox. No imports, so it runs in
// Herdr mods and in `node --test`. Each mod folder carries its own copy.

export function shortFolder(cwd, home) {
  if (!cwd) return "";
  if (cwd === home) return "~";
  return cwd.startsWith(home + "/") ? "~" + cwd.slice(home.length) : cwd;
}

export function paneTitle(pane, home) {
  if (!pane) return "";
  if (pane.name) return pane.name;
  const program = pane.program;
  if (pane.terminal && (program?.agent || pane.status)) return pane.title || program?.name || "";
  if (pane.terminal && program) {
    const where = shortFolder(pane.cwd, home);
    return where ? `${program.name} ${where}` : program.name;
  }
  return pane.title || "";
}

// Where the selected item of a list sits: the sum of the sizes before it, plus the
// gap between items (a row's height down a list, a tab's width across the tab bar).
// null when nothing is selected, the index is out of range, or a row at or above
// it has no known height (then the list keeps a static highlight).
export function stackTop(heights, index, gap = 0) {
  if (index < 0 || index >= heights.length) return null;
  let top = 0;
  for (let i = 0; i < index; i++) {
    if (typeof heights[i] !== "number") return null;
    top += heights[i] + gap;
  }
  return typeof heights[index] === "number" ? { top, height: heights[index] } : null;
}

// The in-app inbox: the latest notifications, newest first, at most `max`.
export function inboxAdd(list, note, now, max = 50) {
  const entry = {
    id: `${now}-${note.title ?? ""}`,
    title: note.title ?? "",
    body: note.body ?? "",
    level: note.level ?? "info",
    action: note.action ?? null,
    at: now,
  };
  return [entry, ...(Array.isArray(list) ? list : [])].slice(0, max);
}

// How many entries arrived after the inbox was last opened.
export function unreadCount(list, seen) {
  if (!Array.isArray(list)) return 0;
  return list.filter((e) => e.at > (seen ?? -Infinity)).length;
}

// An entry's age, short: "now", "2m", "3h", "1d".
export function ago(ms) {
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

// The toolbar's color wash: the strips that together paint the ground with `color`
// rising to `peak` opacity at `top` px and gone again at `width`. Each strip is the
// color already composited over the translucent ground, so one layer is drawn:
// Herdr adds the alphas of stacked layers up, which would turn the frost opaque.
export function washStrips(ground, color, peak, { width = 460, top = 150, step = 10 } = {}) {
  const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
  const under = [1, 3, 5].map((i) => channel(ground, i));
  const over = [1, 3, 5].map((i) => channel(color, i));
  const base = ground.length === 9 ? channel(ground, 7) / 255 : 1;
  const byte = (v) => Math.round(v).toString(16).padStart(2, "0");
  return Array.from({ length: Math.ceil(width / step) }, (_, n) => {
    const x = (n + 0.5) * step;
    const at = peak * Math.max(0, x <= top ? x / top : (width - x) / (width - top));
    const alpha = at + base * (1 - at);
    const mixed = under.map((u, i) => (over[i] * at + u * base * (1 - at)) / alpha);
    return { width: step, color: "#" + mixed.map(byte).join("") + byte(alpha * 255) };
  });
}

// Focus follows the pointer: which pane is under `point`? Herdr tells mods no
// pane positions, so each pane header reports its own line {x, y, w}. The pane
// is the one whose line spans the point sideways and sits lowest above it.
// `ids` are the panes on screen; lines of any other pane are ignored.
export function paneUnder(rects, ids, point) {
  let found = null;
  for (const id of ids) {
    const r = rects?.[id];
    if (!r || point.x < r.x || point.x >= r.x + r.w || point.y < r.y) continue;
    if (!found || r.y > rects[found].y) found = id;
  }
  return found;
}
