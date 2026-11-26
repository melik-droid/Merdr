// Merdr pane header: a slim title line at the top of the pane's island. The
// focused pane's reads strong; the others stay quiet. Split / zoom / close
// buttons on the focused pane or on hover. Focus follows the pointer: a header
// watches the mouse across the window and takes the focus when the pointer
// moves into its pane (rests 100 ms, no button held).
// Props from the app: { pane, terminal }.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, spaces, shared, setShared } from "herdr";
import { paneTitle, paneUnder } from "./model.js";

const asset = (name) => `mods/merdr-pane-header/${name}.svg`;

function programIcon(color, program) {
  if (!program?.icon) return null;
  return program.tint
    ? svg(program.icon).size(13).flex_none().text_color(color)
    : image(program.icon).w(13).h(13).flex_none();
}

function statusMark(t, status) {
  if (status === "working") return svg(asset("spinner")).size(12).flex_none().text_color(t.working).spin(900);
  if (status === "blocked") return div().size(7).flex_none().rounded(4).bg(t.blocked);
  if (status === "done") return div().size(7).flex_none().rounded(4).bg(t.done);
  return null;
}

export default class MerdrPaneHeader extends View {
  init(_props, cx) {
    this.hovered = false;
    this.width = 0; // the header's width, window px
    this.inside = null; // is the pointer in this pane? null: not seen yet
    this.entry = 0; // counts entries, so a stale timer does nothing
    // Merdr: a new pane's header fades in. The first frame draws it transparent, then
    // the opacity target flips and GPUI animates the change natively.
    this.shown = false;
    cx.timer.after(30, (cx) => { this.shown = true; cx.notify(); });
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(5)
      .flex_none()
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); run(command, args); })
      .child(svg(asset(icon)).size(14));
  }

  // Every pane header sees every mouse move. Each reports where its line is;
  // the one whose pane the pointer enters asks for the focus.
  follow(e, cx) {
    const pane = props()?.pane;
    const all = panes();
    const me = all.find((x) => x.pane === pane);
    const shown = spaces().find((s) => s.active)?.tabs.find((tab) => tab.active)?.id;
    if (!me || me.tab !== shown || !e.local_position || !this.width) { this.inside = null; return; }
    // Dragging (a selection, a divider) never moves the focus.
    if (e.pressed_button) { this.entry++; return; }
    const line = {
      x: Math.round(e.position.x - e.local_position.x),
      y: Math.round(e.position.y - e.local_position.y),
      w: Math.round(this.width),
    };
    let rects = shared("merdr.pane.rects") ?? {};
    const old = rects[pane];
    if (!old || old.x !== line.x || old.y !== line.y || old.w !== line.w) {
      rects = Object.fromEntries(Object.entries(rects).filter(([id]) => all.some((x) => x.pane === id)));
      rects[pane] = line;
      setShared("merdr.pane.rects", rects);
    }
    const here = all.filter((x) => x.tab === me.tab);
    const zoomed = here.filter((x) => x.zoomed);
    const ids = (zoomed.length ? zoomed : here).map((x) => x.pane);
    this.point = e.position;
    const inside = paneUnder(rects, ids, e.position) === pane;
    // Only moving in counts: after a keyboard focus change, a resting or
    // jiggling pointer doesn't pull the focus back.
    if (this.inside === null) { this.inside = inside; return; }
    if (inside === this.inside) return;
    this.inside = inside;
    const entry = ++this.entry;
    if (!inside) return;
    cx.timer.after(100, () => {
      if (entry !== this.entry) return;
      // Asked again: on the first move the other headers may not have reported yet.
      if (paneUnder(shared("merdr.pane.rects"), ids, this.point) !== pane) { this.inside = false; return; }
      if (!panes().find((x) => x.pane === pane)?.focused) run("pane.focus", { pane });
    });
  }

  render(_cx) {
    const t = theme();
    const pane = props()?.pane;
    const p = panes().find((x) => x.pane === pane);
    if (!p) return div();
    const icon = programIcon(p.focused ? t.accent : t.dim, p.program);
    const mark = statusMark(t, p.status);
    return h_flex()
      .id(`rx-head-${pane}`)
      .size_full()
      .pl(14)
      .pr(10)
      .gap(8)
      .items_center()
      .bg(t.surface)
      // The island's corners are rounded (frame radius 10, inside a 3px edge): the
      // header's own fill must not square them off.
      .rounded_t(7)
      .opacity(this.shown ? 1 : 0)
      .transition("opacity", { duration: 220, easing: "ease-out" })
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_size_change((size) => { this.width = size.width; })
      .on_window_mouse_move((e, cx) => this.follow(e, cx))
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(icon), (el) => el.child(icon))
      .child(div().flex_1().truncate().text_size(12.5).text_color(p.focused ? t.foreground : t.dim)
        .when(p.focused, (el) => el.font_semibold()).child(paneTitle(p, home()) || "shell"))
      .when(Boolean(mark), (el) => el.child(mark))
      .when(p.focused || this.hovered, (el) => el
        .child(this.button(t, `rx-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `rx-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `rx-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `rx-x-${pane}`, "close", "pane.close", { pane })));
  }
}
