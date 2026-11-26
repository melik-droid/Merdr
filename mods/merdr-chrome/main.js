import { View, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, shared, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

export default class WorkspaceChrome extends View {
  render() {
    const t = theme();
    const collapsed = narrow();
    const out = shared("merdr.sidebar.out") === true;
    // Merdr: the bottom of the lower island (merdr-agents draws its top). Settings is in the toolbar.
    return v_flex().size_full().bg(t.chrome).rounded_b(10).border_t(1).border_color(t.border).px(8).pt(4).pb(4).text_size(13)
      .relative().left(out ? -24 : 0).opacity(out ? 0 : 1)
      .transition("left", { duration: 160, easing: "ease-in-out" }).transition("opacity", { duration: 160, easing: "ease-in-out" })
      .when(collapsed, el => el.px(0).items_center())
      .child(h_flex().id("machine").h(28).px(8).gap(9).items_center().rounded(8)
        .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip("Add machine"))
        .text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(() => run("mod.open", { name: "machine-add" })).child(svg("mods/merdr-chrome/plus.svg").size(14))
        .when(!collapsed, el => el.child("Add machine")));
  }
}
