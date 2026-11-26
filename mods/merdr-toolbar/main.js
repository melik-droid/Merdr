// Merdr toolbar: the top line of the window, drawn straight on the frosted
// ground, which it paints itself so the space's color can wash into it. Sidebar
// button, space and branch on the left;
// search, notifications, the Files / Changes panels and Settings on the right.
// Panel handling is Herdr's own (from its tabs mod).

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run, openOverlay, theme, window, shared, layout, settings, updates } from "herdr";
import { unreadCount, washStrips } from "./model.js";

const asset = (name) => `mods/merdr-toolbar/${name}.svg`;

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// Keep the whole leading emoji in the avatar (same rule in spaces and picker).
const EMOJI = /^(?:[#*0-9]️?⃣|\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|(?=[\u{1F000}-\u{1FFFF}])\p{Extended_Pictographic}|\p{Extended_Pictographic}(?=️)|\p{Emoji_Modifier_Base}(?=\p{Emoji_Modifier}))️?[\p{Emoji_Modifier}\u{E0020}-\u{E007F}]*(?:‍\p{Extended_Pictographic}️?\p{Emoji_Modifier}?)*)(?![\p{Grapheme_Extend}\p{Emoji_Modifier}‍])/u;
const spaceAvatar = (name) => EMOJI.exec(name)?.[0] ?? ([...name][0]?.toUpperCase() ?? "?");

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const stop = (_e, cx) => cx.stop_propagation();

export default class MerdrToolbar extends View {
  init() {
    try { this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}"); } catch { this.panels = {}; }
    if (!this.panels || typeof this.panels !== "object" || Array.isArray(this.panels)) this.panels = {};
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  button(t, id, icon, action) {
    return div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(7)
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(typeof icon === "string" ? svg(icon).size(15) : icon);
  }

  // The inbox bell, with a count of notifications since the list was last opened.
  bell(t) {
    const unread = unreadCount(shared("merdr.inbox"), shared("merdr.inbox.seen"));
    return this.button(t, "inbox", asset("bell"), () => openOverlay({ mod: "merdr-inbox", kind: "popup", width: 320, height: 380 }))
      .relative()
      .when(unread > 0, (el) => el.child(div().absolute().top(0).right(-1).min_w(14).h(14).px(3).rounded_full()
        .bg(t.accent).text_color(t.accent_foreground).text_size(9.5).font_bold().flex().items_center().justify_center()
        .child(unread > 9 ? "9+" : String(unread))));
  }

  // The window's ground under the toolbar, with the space's color washed into it
  // behind its name. The layout paints no ground here: this is the only layer.
  ground(t, color) {
    const strips = washStrips(t.canvas, color, settings()?.dark ? 0.42 : 0.3);
    return h_flex().absolute().top(0).left(0).right(0).bottom(0)
      .children(strips.map((s) => div().w(s.width).h_full().flex_none().bg(s.color)))
      .child(div().flex_1().h_full().bg(t.canvas));
  }

  render() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const stored = (shared("space.colors") ?? {})[space?.id] ?? "ansi6";
    const color = stored.startsWith("#") ? stored.slice(0, 7) : (MARK[stored] ?? MARK.ansi6);
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const w = window();
    // Room for the macOS window buttons (they are placed in screen px).
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? (root.traffic_lights[0] + 64) / (settings()?.zoom || 1)
      : 10;
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(28).px(9).gap(6).flex_none().items_center().rounded(7)
        .text_size(12.5).text_color(on ? t.foreground : t.muted).when(on, (el) => el.bg(t.selected))
        .hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).relative().pl(lights).pr(10).gap(4).items_center().text_size(13)
      .child(this.ground(t, color))
      .child(this.button(t, "sidebar-toggle", asset("sidebar"), () => run("merdr-tabs.sidebar")))
      .when(Boolean(space), (el) => el.child(h_flex().id("space-chip").h(30).px(8).gap(8).items_center().rounded(7)
        .text_color(t.foreground).font_semibold().hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop).on_click(() => run("mod.open", { name: "picker" }))
        .child(h_flex().size(20).flex_none().rounded(5).bg(color).items_center().justify_center()
          .text_size(11).font_bold().text_color("#ffffff").child(spaceAvatar(space.name)))
        .child(div().max_w(220).truncate().child(space.name))
        .child(svg(asset("chevron-down")).size(12))))
      .when(Boolean(space?.branch), (el) => el.child(h_flex().px(8).gap(6).items_center().text_color(t.foreground)
        .child(svg(asset("git-branch")).size(13)).child(div().max_w(220).truncate().child(space.branch))))
      .child(div().flex_1())
      .child(this.button(t, "search", asset("search"), () => run("mod.open", { name: "picker" })))
      .child(this.bell(t))
      .when(enabled.includes("files"), (el) => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), (el) => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .child(this.button(t, "settings", asset("settings"), () => run("app.settings")).relative()
        .when(Boolean(updates().app.ready), (el) => el.child(div().absolute().top(4).right(4).size(6).rounded_full().bg(t.accent))))
      .when(w?.buttons, (el) => el
        .child(this.button(t, "minimize", asset("win-min"), () => run("window.minimize")))
        .child(this.button(t, "maximize", asset(w.maximized ? "win-restore" : "win-max"), () => run("window.maximize")))
        .child(this.button(t, "close-window", asset("win-close"), () => run("window.close"))));
  }
}
