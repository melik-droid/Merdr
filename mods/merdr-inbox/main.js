// Merdr: the in-app inbox. The latest notifications (kept by merdr-toast in shared
// "merdr.inbox"), grouped by space, newest first. "Needs you" shows the agents
// waiting right now. A note whose terminal has closed leads nowhere and says so.
// Opening it marks them seen; those that arrived since the last look stay
// tinted while it is open. A row runs its action (an agent: agent.focus) and
// closes the list; its x removes just that note; Clear all empties it.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared, run, closeOverlay, props, theme, agents, terminals } from "herdr";
import { ago, noteWhere, inboxGroups, inboxRemove, needsYou, isGone } from "./model.js";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class MerdrInbox extends View {
  init() {
    this.filter = "all";
    this.hovered = null;
    this.before = shared("merdr.inbox.seen") ?? 0; // newer than this: new to the person
    setShared("merdr.inbox.seen", Date.now());
  }

  chip(t, id, label) {
    const on = this.filter === id;
    return div().id(`inbox-filter-${id}`).h(24).px(10).flex().items_center().rounded(7).text_size(12).cursor_pointer()
      .when(on, (el) => el.bg(t.selected).font_semibold())
      .text_color(on ? t.foreground : t.muted)
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => { this.filter = id; cx.notify(); })
      .child(label);
  }

  row(t, e, now, overlay, live) {
    const over = this.hovered === e.id;
    const fresh = e.at > this.before;
    const gone = isGone(e, live);
    const where = noteWhere(e).detail;
    const detail = gone ? `${where} \u00b7 closed` : where;
    return h_flex()
      .id(`inbox-${e.id}`)
      .flex_none()
      .h(46)
      .px(10)
      .gap(10)
      .rounded(8)
      .items_center()
      .when(!gone, (el) => el.cursor_pointer())
      .when(fresh, (el) => el.bg(t.accent + "1f"))
      .hover((s) => s.bg(t.hover))
      .on_hover((on, cx) => {
        if (on) this.hovered = e.id;
        else if (this.hovered === e.id) this.hovered = null;
        cx.notify();
      })
      .on_click(() => {
        if (gone) return;
        if (e.action?.name) run(e.action.name, e.action.args ?? {});
        closeOverlay(overlay);
      })
      .child(div().size(7).flex_none().rounded(4).bg(t[DOT[e.level] ?? "accent"]))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(13).when(fresh, (el) => el.font_semibold()).text_color(gone ? t.dim : t.foreground).child(e.title))
        .when(Boolean(detail), (el) => el.child(div().truncate().text_size(11.5).text_color(t.muted).child(detail))))
      // Pointed at, the age makes room for what a click can do.
      .when(!over, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(ago(now - e.at))))
      .when(over && Boolean(e.action?.name) && !gone, (el) => el.child(div().flex_none().text_size(12).text_color(t.accent).child("Go \u2192")))
      .when(over, (el) => el.child(div().id(`inbox-remove-${e.id}`).size(22).flex_none().flex().items_center().justify_center()
        .rounded(6).text_size(15).text_color(t.dim)
        .hover((s) => s.bg(t.selected).text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); setShared("merdr.inbox", inboxRemove(shared("merdr.inbox"), e.id)); cx.notify(); })
        .child("\u00d7")));
  }

  render() {
    const t = theme();
    const list = shared("merdr.inbox") ?? [];
    const waiting = needsYou(list, agents());
    const needs = waiting.length;
    const groups = inboxGroups(this.filter === "needs" ? waiting : list);
    const live = terminals();
    const now = Date.now();
    const overlay = props()?.overlay;
    const empty = this.filter === "needs" ? "Nothing needs you." : "No notifications yet.";
    return v_flex()
      .size_full()
      .bg(t.popover)
      .child(h_flex().flex_none().h(40).pl(14).pr(8).items_center().justify_between()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Notifications"))
        .when(list.length > 0, (el) => el.child(div().id("inbox-clear").px(8).py(3).rounded(6).text_size(12).text_color(t.muted)
          .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { setShared("merdr.inbox", []); cx.notify(); })
          .child("Clear all"))))
      .child(h_flex().flex_none().px(8).pb(8).gap(4).items_center().border_b(1).border_color(t.border)
        .child(this.chip(t, "all", "All"))
        .child(this.chip(t, "needs", needs ? `Needs you ${needs}` : "Needs you")))
      .child(v_flex().id("inbox-list").flex_1().min_h(0).px(4).pb(6).overflow_y_scrollbar()
        .when(groups.length === 0, (el) => el.child(div().px(10).py(16).text_size(12).text_color(t.dim).child(empty)))
        .children(groups.flatMap((g) => [
          div().id(`inbox-group-${g.name}`).flex_none().px(10).pt(10).pb(4).truncate()
            .text_size(11).font_medium().text_color(t.dim).child(g.name),
          ...g.items.map((e) => this.row(t, e, now, overlay, live)),
        ])));
  }
}
