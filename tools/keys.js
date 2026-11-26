// Adds (add) or removes (remove) the package's keys.json sections in the person's
// keys.json. Run by install.sh / uninstall.sh with osascript -l JavaScript.
// add: only sections the person lacks. remove: only sections still equal to ours.
// Backs the file up before a change. Prints one line per section, or one word:
//   missing     no keys.json, or an empty one: Herdr has not written its keymap
//               yet, and a file holding only our section would replace it
//   unreadable  the file exists but can't be read as UTF-8
//   invalid     not a JSON object
//   failed      writing the file or its backup failed
// In every one-word case the file is left as it was.
ObjC.import("Foundation");
function exists(p) { return $.NSFileManager.defaultManager.fileExistsAtPath(p); }
function read(p) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : ObjC.unwrap(s);
}
function write(p, text) { return $(text).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null); }
function run(argv) {
  const [mode, target, source, stamp] = argv;
  const ours = JSON.parse(read(source));
  if (!exists(target)) return "missing";
  const raw = read(target);
  if (raw === null) return "unreadable";
  if (raw.trim() === "") return "missing";
  let keys;
  try { keys = JSON.parse(raw); } catch (e) { return "invalid"; }
  if (keys === null || typeof keys !== "object" || Array.isArray(keys)) return "invalid";
  const out = [];
  let changed = false;
  for (const name of Object.keys(ours)) {
    const same = name in keys && JSON.stringify(keys[name]) === JSON.stringify(ours[name]);
    if (mode === "add") {
      if (name in keys) { if (!same) out.push("kept " + name); continue; }
      keys[name] = ours[name]; changed = true; out.push("added " + name);
    } else {
      if (!(name in keys)) continue;
      if (!same) { out.push("kept " + name); continue; }
      delete keys[name]; changed = true; out.push("removed " + name);
    }
  }
  if (changed) {
    if (!write(target + ".bak-" + stamp, raw)) return "failed";
    if (!write(target, JSON.stringify(keys, null, 2) + "\n")) return "failed";
  }
  return out.join("\n");
}
