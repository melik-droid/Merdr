#!/bin/sh
# Removes what install.sh put in your Herdr app home: the Merdr layout, mods and
# themes it installed (only those carrying its marker) and the layout:merdr
# section of keys.json (only while it is still the one Merdr added; backed up
# first). Switches the window to Herdr's main layout first when Merdr is showing.
#
# Usage: sh uninstall.sh [--home DIR] [--no-switch]
set -u

TOOLS=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/tools
SRC=${MERDR_SRC:-$(dirname -- "$TOOLS")}
HOME_DIR=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
SWITCH=1
while [ $# -gt 0 ]; do
	case "$1" in
	--home) HOME_DIR=$2; shift 2 ;;
	--no-switch) SWITCH=0; shift ;;
	*) echo "uninstall.sh: unknown argument $1" >&2; exit 2 ;;
	esac
done
say() { echo "merdr: $*"; }

if [ "$SWITCH" -eq 1 ] && command -v herdr-app >/dev/null 2>&1 \
	&& herdr-app status 2>/dev/null | grep -q '"layout": *"merdr"'; then
	herdr-app do layout.switch '{"name":"main"}' >/dev/null && say "switched to Herdr's main layout"
fi

for d in "$HOME_DIR"/mods/merdr-*/; do
	[ -e "$d/.merdr-owned" ] || continue
	rm -rf "$d" && say "removed mods/$(basename "$d")"
done
for marker in "$HOME_DIR"/themes/.merdr-owned-*.json; do
	[ -e "$marker" ] || continue
	n=${marker##*/.merdr-owned-}
	rm -f "$HOME_DIR/themes/$n" "$marker" && say "removed themes/$n"
done
if [ -e "$HOME_DIR/layouts/.merdr-owned-merdr.json" ]; then
	rm -f "$HOME_DIR/layouts/merdr.json" "$HOME_DIR/layouts/.merdr-owned-merdr.json" && say "removed layouts/merdr.json"
fi

if [ -f "$HOME_DIR/keys.json" ] && [ -f "$SRC/keys.json" ]; then
	r=$(osascript -l JavaScript "$TOOLS/keys.js" remove "$HOME_DIR/keys.json" "$SRC/keys.json" "$(date +%Y%m%d-%H%M%S)")
	case "$r" in
	missing) ;;
	unreadable|invalid|failed) echo "merdr: could not update $HOME_DIR/keys.json ($r); left it alone, remove layout:merdr by hand" >&2 ;;
	*)
		echo "$r" | while read -r what name; do
			case "$what" in
			removed) say "keys: removed $name" ;;
			kept) say "keys: $name was changed since install, left as is" ;;
			esac
		done ;;
	esac
fi
