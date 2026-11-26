import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, shared, setShared, layout, settings, nextCommand } from "herdr";
import { stackTop, arrivals, slideWidth } from "./model.js";

const SLIDE_MS = 260; // the sidebar's opening and closing

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Same as the agents mod: drops a status glyph, keeps a leading bracket or quote.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// A tab Herdr named (unnamed, or after its program) follows its agent's live
// title, as the agents list does; a name the person gave stays.
function label(tab, lead) {
  const prog = lead?.program?.name;
  const base = tab.named ? tab.name : prog ?? "Terminal";
  if (!lead?.program?.agent) return base;
  const live = clean(lead.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== lead.terminal && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead.program.key;
  return (tab.name === prog || !tab.named) && telling ? live : base;
}

export default class Tabs extends View {
  init(_props, cx) {
    // Merdr: cmd-b (keys.json layout:merdr "merdr-tabs.sidebar") toggles the sidebar with motion.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "sidebar") this.toggleSidebar(cx);
        cx.notify();
      }
    });
    this.pressed = null;
    this.turn = 0; // sidebar toggles so far
    this.known = null; // tabs seen settled, for the entrance of new ones
    this.lastSlide = null; // where the selection last sat
    this.sliding = false;
    this.scroll = ScrollHandle.new();
    this.widths = {}; // tab id -> measured width, for the sliding selection
    this.hoverTab = null;
    this.barH = 0;
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
  }

  // One tab per wheel notch. A touchpad or smooth-scrolling mouse sends many
  // small events per gesture: a short swipe or one smoothed notch (about
  // 25 px) switches one tab, a longer swipe keeps going a tab per 60 px, at
  // most one every 100 ms so each shows.
  wheel(e) {
    if (e.delta_lines) {
      if (e.delta_lines.y) run(e.delta_lines.y > 0 ? "tab.prev" : "tab.next");
      return;
    }
    const s = this.swipe, now = Date.now();
    // Phases often arrive only as moves (a macOS touchpad included): a pause
    // or a turn starts a new gesture.
    if (e.touch_phase === "started" || now - s.at > 250 || e.delta.y * s.acc < 0) Object.assign(s, { acc: 0, steps: 0 });
    s.at = now;
    s.acc += e.delta.y;
    const need = s.steps ? 60 : 20;
    if (Math.abs(s.acc) < need || now - s.last < 100) return;
    s.acc -= Math.sign(s.acc) * need;
    s.steps++;
    s.last = now;
    run(e.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  // The sidebar's column narrows to nothing (and back) a frame at a time, so the
  // terminals grow into its place as it goes. Its islands keep their width and
  // ride its right edge (shared "merdr.sidebar.slide": that width). A press while
  // it is closing turns it round where it is.
  toggleSidebar(cx) {
    const turn = ++this.turn;
    const node = find(layout(), "sidebar");
    if (!node) return;
    const hidden = Boolean(node.hidden);
    const full = shared("merdr.sidebar.slide") ?? (node.size?.px >= 160 ? node.size.px : 262);
    const open = hidden || this.closing;
    const from = hidden ? 1 : node.size?.px ?? full;
    const to = open ? full : 1;
    this.closing = !open;
    this.sliding = true;
    setShared("merdr.sidebar.slide", full);
    if (hidden) {
      run("layout.resize", { id: "sidebar", px: from });
      run("layout.show", { id: "sidebar" });
    }
    const start = Date.now();
    const frame = () => {
      if (turn !== this.turn) return;
      const p = (Date.now() - start) / SLIDE_MS;
      run("layout.resize", { id: "sidebar", px: slideWidth(from, to, p) });
      if (p < 1) return cx.timer.after(16, frame);
      if (!open) {
        run("layout.hide", { id: "sidebar" });
        run("layout.resize", { id: "sidebar", px: full }); // its width for next time
      }
      this.closing = false;
      this.sliding = false;
      setShared("merdr.sidebar.slide", null);
    };
    cx.timer.after(16, frame);
  }

  // The tabs that just appeared, in any space (see arrivals in model.js). They
  // are drawn aside once, then marked settled, so GPUI slides them in natively.
  arrive(ids, cx) {
    const step = arrivals(this.known, ids);
    this.known = step.known;
    if (step.fresh.length) cx.timer.after(30, (cx) => { for (const id of step.fresh) this.known?.add(id); cx.notify(); });
    return new Set(step.fresh);
  }

  render(cx) {
    const t = theme();
    // A slide cut short (a reload, another way of showing the sidebar) must not
    // leave it thin.
    const side = find(layout(), "sidebar");
    if (!this.sliding && !this.healing && side && !side.hidden && (shared("merdr.sidebar.slide") || side.size?.px < 44)) {
      this.healing = true;
      cx.timer.after(60, () => {
        this.healing = false;
        if (this.sliding) return;
        run("layout.resize", { id: "sidebar", px: shared("merdr.sidebar.slide") ?? 262 });
        setShared("merdr.sidebar.slide", null);
      });
    }
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    // Merdr: one selection background slides to the active tab. Its place is the
    // measured widths of the tabs before it, plus the 3px gaps; until every tab
    // has been measured, the tab keeps Herdr's own highlight.
    const fresh = this.arrive(spaces().flatMap(s => s.tabs.map(tab => tab.id)), cx);
    // A tab not measured yet (just opened) has no place: the selection waits where
    // it was, so it stays the same element and springs over once it is known.
    const measured = active >= 0 ? stackTop(shown.map(c => this.widths[c.id]), active, 3) : null;
    const slide = measured ?? (active >= 0 && fresh.size ? this.lastSlide : null);
    if (measured) this.lastSlide = measured;
    const at = (i) => i + (slide ? 1 : 0); // the sliding background is the first child
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(at(active));
    }
    const stop = (_e, cx) => cx.stop_propagation();
    // A selected tab is tinted with the accent, as in the Islands look.
    const tint = t.accent + "26", edge = t.accent + "73", clear = "#00000000";
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const lead = panes().find(p => p.tab === c.id && p.program?.agent) ?? panes().find(p => p.tab === c.id);
      const program = lead?.program;
      const name = label(c, lead);
      const entering = fresh.has(c.id);
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        // A rename or status dot on this or an earlier tab can push the active one out.
        .on_size_change((size, cx) => {
          // Sizes arrive in screen px; positions are layout px, which the app's zoom scales.
          const width = size.width / (settings()?.zoom || 1);
          const changed = this.widths[c.id] !== width;
          this.widths[c.id] = width;
          if (i <= active) this.scroll.scroll_to_item(at(active));
          if (changed || i <= active) cx.notify();
        })
        .relative().left(entering ? -18 : 0).opacity(entering ? 0 : 1)
        .transition("left", { duration: 260, easing: "ease-out" }).transition("opacity", { duration: 260, easing: "ease-out" })
        .border(1).border_color(c.active && !slide ? edge : clear).when(!slide && c.active, el => el.bg(tint))
        .text_color(c.active ? t.foreground : t.muted)
        // Merdr: the hover background fades in and out (GPUI animates opacity, not color).
        .child(div().absolute().top(-1).left(-1).right(-1).h(29).rounded(7).bg(t.hover)
          .opacity(this.hoverTab === c.id && !c.active ? 1 : 0).transition("opacity", { duration: 120, easing: "ease-out" }))
        .on_hover((h, cx) => {
          if (h) this.hoverTab = c.id;
          else if (this.hoverTab === c.id) this.hoverTab = null;
          cx.notify();
        })
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    return h_flex().size_full().min_w(0).px(8).gap(3).items_center()
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => this.wheel(e))
      .child(h_flex().id("tab-scroll").relative().flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((size, cx) => { this.barH = size.height / (settings()?.zoom || 1); if (active >= 0) this.scroll.scroll_to_item(at(active)); cx.notify(); })
        .children(slide ? [
          div().id("tab-slide").absolute().top(Math.max(0, (this.barH - 29) / 2)).h(29).rounded(7).bg(tint).border(1).border_color(edge)
            .left(slide.top).w(slide.height)
            .spring("left", { response: 220, damping: 0.9 }).spring("width", { response: 220, damping: 0.9 }),
          ...shown.map(item),
        ] : shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })));
  }
}
