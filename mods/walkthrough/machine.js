// Local patch (machine): the walkthrough as shipped reads git and runs claude on the computer
// the app runs on, and treats a space with a `machine` as out of reach. Here the app runs on
// Windows and every space is on the WSL machine ("local"), so this stands in for the herdr
// functions it uses and sends them there instead:
//   exec          -> `on: <machine>`, with the PATH an interactive bash has (claude is in ~/.local/bin)
//   readTextFile  -> `on: <machine>`
//   writeTextFile -> through exec, in pieces (exec takes no input, and Windows caps a command line at 32K chars)
//   watchFolder   -> a poll for files changed since the last look (the app can't watch WSL folders)
//   home, appHome -> the machine's home, and the app folder as the machine sees it (/mnt/c/...)
// With no machine (a space on this computer) everything is herdr's own.
import * as herdr from "herdr";

let MACHINE = null, HOME = null, PATH = null, APP = null;

/** Points the walkthrough at a machine and reads its home and PATH. Call before anything else. */
export async function useMachine(machine) {
  MACHINE = machine || null;
  if (!MACHINE) return;
  const r = await herdr.exec("bash", ["-ic", 'printf "%s\\n%s" "$HOME" "$PATH"'], { on: MACHINE, timeout: 15000 }).catch(() => null);
  const [home, path] = (r?.stdout ?? "").trim().split("\n").slice(-2);
  HOME = home?.startsWith("/") ? home : null;
  PATH = path || null;
  const win = herdr.appHome(); // C:\Users\me\.config\herdr-app
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(win);
  APP = m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}` : win;
}

export const machine = () => MACHINE;

export function exec(command, args = [], options = {}) {
  if (!MACHINE) return herdr.exec(command, args, options);
  const run = PATH ? ["env", [`PATH=${PATH}`, command, ...args]] : [command, args];
  return herdr.exec(run[0], run[1], { ...options, on: options.on ?? MACHINE });
}

export const home = () => (MACHINE && HOME) || herdr.home();
export const appHome = () => (MACHINE && APP) || herdr.appHome();

export function readTextFile(path, options = {}) {
  return herdr.readTextFile(path, MACHINE ? { ...options, on: options.on ?? MACHINE } : options);
}

// UTF-16 units per piece. The command goes through hc on Windows, whose whole command line is at
// most 32,767 characters, and quoting can double a piece (every " gets a \), so keep it well under.
const PIECE = 12_000;

export async function writeTextFile(path, text, expected) {
  if (!MACHINE) return herdr.writeTextFile(path, text, expected);
  const tmp = `${path}.${Date.now().toString(36)}.part`;
  const ok = (r) => { if (!r || r.code !== 0) throw new Error((r?.stderr || `couldn't write ${path}`).trim()); };
  ok(await exec("sh", ["-c", ': > "$0"', tmp]));
  for (let i = 0; i < text.length; i += PIECE) {
    let end = Math.min(text.length, i + PIECE);
    // Never split a surrogate pair.
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    ok(await exec("sh", ["-c", 'printf %s "$1" >> "$0"', tmp, text.slice(i, end)]));
    i = end - PIECE;
  }
  ok(await exec("mv", ["-f", tmp, path]));
  return null;
}

// What changed under a folder since a moment: its files (not .git or node_modules), and git's
// index and HEAD when the folder is a git dir or a repository.
// It waits first: the mods have no timers of their own, so the pause is the machine's sleep.
const CHANGED = `d=$0; since=$1; sleep 3
find "$d" \\( -name .git -o -name node_modules \\) -prune -o -newermt "@$since" -print 2>/dev/null | head -200
case "$d" in */.git|*/.git/*|*/worktrees/*) for f in "$d/index" "$d/HEAD"; do [ -e "$f" ] && find "$f" -newermt "@$since" -print; done ;;
*) for f in index HEAD; do p=$(git -C "$d" rev-parse --path-format=absolute --git-path $f 2>/dev/null) && [ -e "$p" ] && find "$p" -newermt "@$since" -print; done ;; esac 2>/dev/null`;

export async function watchFolder(path) {
  if (!MACHINE) return herdr.watchFolder(path);
  let since = Math.floor(Date.now() / 1000) - 1;
  for (;;) {
    const r = await exec("sh", ["-c", CHANGED, path, String(since)]).catch(() => null);
    if (!r) await exec("sleep", ["3"]).catch(() => null);
    const changed = (r?.stdout ?? "").split("\n").filter(Boolean);
    if (changed.length) return [...new Set(changed)];
    since = Math.floor(Date.now() / 1000) - 1;
  }
}
