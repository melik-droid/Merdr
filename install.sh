#!/bin/sh
# Installs Merdr into your Herdr app home (default ~/.config/herdr-app):
# layouts/merdr.json, mods/merdr-*/, themes/merdr-{light,dark}.json, and the
# layout:merdr section of keys.json. Then checks the mods and switches to Merdr.
#
# Never overwrites what it did not install: a layout, mod or theme with the
# same name that it did not put there stops the install before anything is
# written. keys.json is backed up before it is changed, and a layout:merdr
# section you already have is left as it is.
#
# Usage: sh install.sh [--home DIR] [--no-check] [--no-switch]
#   --home       the Herdr app home to install into
#   --no-check   skip the Herdr version check and `herdr-app check`
#   --no-switch  install without switching the window to Merdr
set -u

TOOLS=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/tools
SRC=${MERDR_SRC:-$(dirname -- "$TOOLS")}
HOME_DIR=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
CHECK=1
SWITCH=1
NEED=0.1.18
while [ $# -gt 0 ]; do
	case "$1" in
	--home) HOME_DIR=$2; shift 2 ;;
	--no-check) CHECK=0; shift ;;
	--no-switch) SWITCH=0; shift ;;
	*) echo "install.sh: unknown argument $1" >&2; exit 2 ;;
	esac
done

say() { echo "merdr: $*"; }
die() { echo "merdr: $*" >&2; exit 1; }

# version_ok VERSION: true when VERSION >= $NEED (numeric, dot by dot).
version_ok() {
	echo "$1 $NEED" | awk '{
		n = split($1, a, "."); split($2, b, ".")
		for (i = 1; i <= 3; i++) { if (a[i] + 0 > b[i] + 0) exit 0; if (a[i] + 0 < b[i] + 0) exit 1 }
		exit 0 }'
}

if [ "$CHECK" -eq 1 ] || [ "$SWITCH" -eq 1 ]; then
	command -v herdr-app >/dev/null 2>&1 || die "herdr-app is not on PATH; Merdr needs the Herdr app $NEED or newer"
fi
if [ "$CHECK" -eq 1 ]; then
	have=$(herdr-app --version 2>/dev/null | awk '{print $2}')
	version_ok "${have:-0}" || die "Merdr needs Herdr $NEED or newer (found ${have:-unknown}); update Herdr first"
fi

[ -f "$SRC/layouts/merdr.json" ] || die "missing $SRC/layouts/merdr.json"
MODS=""
for d in "$SRC"/mods/*/; do
	[ -f "$d/main.js" ] && MODS="$MODS $(basename "$d")"
done
[ -n "$MODS" ] || die "no mods in $SRC/mods"

# Check everything first, so a refusal writes nothing.
refuse=0
taken() { echo "merdr: $1 exists and was not installed by Merdr; leaving it alone" >&2; refuse=1; }
[ -e "$HOME_DIR/layouts/merdr.json" ] && [ ! -e "$HOME_DIR/layouts/.merdr-owned-merdr.json" ] && taken "$HOME_DIR/layouts/merdr.json"
for m in $MODS; do
	[ -e "$HOME_DIR/mods/$m" ] && [ ! -e "$HOME_DIR/mods/$m/.merdr-owned" ] && taken "$HOME_DIR/mods/$m"
done
for t in "$SRC"/themes/*.json; do
	n=$(basename "$t")
	[ -e "$HOME_DIR/themes/$n" ] && [ ! -e "$HOME_DIR/themes/.merdr-owned-$n" ] && taken "$HOME_DIR/themes/$n"
done
[ "$refuse" -eq 0 ] || exit 1

mkdir -p "$HOME_DIR/layouts" "$HOME_DIR/mods" "$HOME_DIR/themes" || exit 1
for m in $MODS; do
	dest="$HOME_DIR/mods/$m"
	rm -rf "$dest.merdr-new"
	cp -R "$SRC/mods/$m" "$dest.merdr-new" || exit 1
	rm -f "$dest.merdr-new"/*.d.ts "$dest.merdr-new/jsconfig.json"
	: > "$dest.merdr-new/.merdr-owned"
	rm -rf "$dest" && mv "$dest.merdr-new" "$dest" || exit 1
	say "installed mods/$m"
done
for t in "$SRC"/themes/*.json; do
	n=$(basename "$t")
	cp "$t" "$HOME_DIR/themes/$n.merdr-new" && mv "$HOME_DIR/themes/$n.merdr-new" "$HOME_DIR/themes/$n" || exit 1
	: > "$HOME_DIR/themes/.merdr-owned-$n"
	say "installed themes/$n"
done
cp "$SRC/layouts/merdr.json" "$HOME_DIR/layouts/merdr.json.merdr-new" \
	&& mv "$HOME_DIR/layouts/merdr.json.merdr-new" "$HOME_DIR/layouts/merdr.json" || exit 1
: > "$HOME_DIR/layouts/.merdr-owned-merdr.json"
say "installed layouts/merdr.json"

# keys.json: add each section of the package's keys.json the person doesn't have.
# osascript's JavaScript reads and writes the JSON (every Mac has it).
if [ -f "$SRC/keys.json" ]; then
	r=$(osascript -l JavaScript "$TOOLS/keys.js" add "$HOME_DIR/keys.json" "$SRC/keys.json" "$(date +%Y%m%d-%H%M%S)")
	hand="add layout:merdr from this folder's keys.json to it by hand (it gives cmd-b the sliding sidebar)"
	case "$r" in
	missing) say "keys: $HOME_DIR/keys.json is not there yet (Herdr writes it on its first start); $hand" ;;
	unreadable) echo "merdr: could not read $HOME_DIR/keys.json; left it alone, $hand" >&2 ;;
	invalid) echo "merdr: $HOME_DIR/keys.json is not valid JSON; left it alone, $hand" >&2 ;;
	failed) echo "merdr: could not write $HOME_DIR/keys.json; left it as it was, $hand" >&2 ;;
	*)
		echo "$r" | while read -r what name; do
			case "$what" in
			added) say "keys: added $name" ;;
			kept) say "keys: $name already set, left as is" ;;
			esac
		done ;;
	esac
fi

if [ "$CHECK" -eq 1 ]; then
	for m in $MODS; do
		herdr-app check "$HOME_DIR/mods/$m" >/dev/null || die "herdr-app check failed for mods/$m"
	done
	say "all mods checked"
fi
if [ "$SWITCH" -eq 1 ]; then
	herdr-app do layout.switch '{"name":"merdr"}' >/dev/null && say "switched to Merdr (ctrl-shift-l switches back)"
fi
