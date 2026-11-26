// Merdr: the in-app inbox. The latest notifications (kept by merdr-toast in shared
// "merdr.inbox"), newest first. Opening it marks them seen; a row runs its action
// (an agent: agent.focus) and closes the list; Clear empties it.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared, run, closeOverlay, props, theme } from "herdr";
import { ago } from "./model.js";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class MerdrInbox extends View {
  init() {
    setShared("merdr.inbox.seen", Date.now());
  }

  row(t, e, now, overlay) {
    return h_flex()
      .id(`inbox-${e.id}`)
      .flex_none()
      .px(10)
      .py(8)
      .gap(10)
      .rounded(8)
      .items_center()
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (e.action?.name) run(e.action.name, e.action.args ?? {});
        closeOverlay(overlay);
      })
      .child(div().size(7).flex_none().rounded(4).bg(t[DOT[e.level] ?? "accent"]))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(13).font_semibold().text_color(t.foreground).child(e.title))
        .when(Boolean(e.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(e.body))))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(now - e.at)));
  }

  render() {
    const t = theme();
    const list = shared("merdr.inbox") ?? [];
    const now = Date.now();
    const overlay = props()?.overlay;
    return v_flex()
      .size_full()
      .bg(t.popover)
      .child(h_flex().flex_none().h(40).pl(14).pr(8).items_center().justify_between()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Notifications"))
        .when(list.length > 0, (el) => el.child(div().id("inbox-clear").px(8).py(3).rounded(6).text_size(12).text_color(t.muted)
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { setShared("merdr.inbox", []); cx.notify(); })
          .child("Clear"))))
      .child(v_flex().id("inbox-list").flex_1().min_h(0).px(4).pb(6).overflow_y_scrollbar()
        .when(list.length === 0, (el) => el.child(div().px(10).py(16).text_size(12).text_color(t.dim).child("No notifications yet.")))
        .children(list.map((e) => this.row(t, e, now, overlay))));
  }
}
