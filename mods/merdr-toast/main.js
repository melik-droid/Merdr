// Merdr's notifications: Herdr's corner note (Herdr's own and every notify())
// drawn as a rounded island, and each one kept in the inbox, so the bell in
// the tab bar counts it and the list keeps it after the note is gone. Click
// to run its action (e.g. go to the agent) and dismiss it.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, checking, shared, setShared } from "herdr";
import { inboxAdd } from "./model.js";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class MerdrToast extends View {
  init() {
    if (checking()) return;
    const p = props() ?? {};
    const note = { title: p.title || "Herdr", body: p.body ?? "", level: p.level, action: p.action };
    setShared("merdr.inbox", inboxAdd(shared("merdr.inbox"), note, Date.now()));
  }

  render(cx) {
    const t = theme();
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    const text = (value) => p.fitHeight
      ? div().child(value)
      : div().truncate().child(typeof value === "string" ? value.split("\n", 1)[0] : value);
    return h_flex()
      .id("toast")
      .when(p.fitHeight, (el) => el.w_full().min_h(70).flex_none().py(12))
      .when(!p.fitHeight, (el) => el.size_full())
      .px(18)
      .gap(12)
      .items_center()
      .bg(t.popover)
      .rounded(12)
      .border(1).border_color(t.border)
      .overflow_hidden()
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(p.icon ? image(p.icon).w(18).h(18).flex_none() : div().size(8).rounded(4).flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .child(text(login ? `${login[1]} needs a login: run` : p.title ?? "").font_semibold().text_size(13).text_color(t.foreground))
          .when(!login && Boolean(p.body), (el) => el.child(text(p.body).text_size(12).text_color(t.muted)))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
              .text_size(12).text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      );
  }
}
