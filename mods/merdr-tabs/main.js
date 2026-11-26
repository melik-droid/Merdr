import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, shared, setShared, layout, settings, nextCommand } from "herdr";
import { stackTop } from "./model.js";

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

  // Closing: the islands slide left and fade (shared "merdr.sidebar.out"), then the
  // sidebar hides. Opening: it shows with them out, and they slide back in.
  toggleSidebar(cx) {
    if (find(layout(), "sidebar")?.hidden) {
      setShared("merdr.sidebar.out", true);
      run("layout.show", { id: "sidebar" });
      cx.timer.after(40, () => setShared("merdr.sidebar.out", false));
    } else {
      this.closing = true;
      setShared("merdr.sidebar.out", true);
      cx.timer.after(170, () => { run("layout.hide", { id: "sidebar" }); this.closing = false; });
    }
  }

  render(cx) {
    const t = theme();
    // A sidebar shown some other way (the palette, another key) must not stay slid out.
    if (!this.closing && !this.healing && !find(layout(), "sidebar")?.hidden && shared("merdr.sidebar.out") === true) {
      this.healing = true;
      cx.timer.after(60, () => { this.healing = false; if (!this.closing) setShared("merdr.sidebar.out", false); });
    }
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    // Merdr: one selection background slides to the active tab. Its place is the
    // measured widths of the tabs before it, plus the 3px gaps; until every tab
    // has been measured, the tab keeps Herdr's own highlight.
    const slide = active >= 0 ? stackTop(shown.map(c => this.widths[c.id]), active, 3) : null;
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
        .relative()
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
