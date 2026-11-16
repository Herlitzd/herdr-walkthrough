# This fork

Herlitzd/herdr-walkthrough is a personal fork of [dmazlum/herdr-walkthrough](https://github.com/dmazlum/herdr-walkthrough),
run in Herdr Desktop on Windows with herdr-core in WSL, where every space is on the WSL machine. Upstream
reads git and runs `claude` on the computer the app runs on and shows "This space is on another machine"
for anything else. Changes are marked in the code with `// Local patch (<name>)` comments.

## What it changes

| Patch | What |
|---|---|
| machine | `machine.js` stands in for herdr's `exec`, `readTextFile`, `writeTextFile`, `watchFolder`, `home` and `appHome`, pointed at the space's machine. `exec` gets the PATH of an interactive bash there (so `claude` in `~/.local/bin` is found); writes go through `exec` in pieces (it takes no input, and an argument is at most 128 KB); folder watching is a 3-second poll with `find -newermt` (the app can't watch the machine's folders). With no machine, everything is herdr's own |
| machine (launch) | a generation is started with `systemd-run --user` when there is one: herdr-core's exec ends every process the command started when it returns, `nohup` and `setsid` ones too, so the background run died at once |
| machine (copy) | Copy as Markdown uses the app's clipboard (`cx.write_to_clipboard`); there's no pbcopy, wl-copy or xclip on WSL |
| pr | `props.on` (the machine) and `props.pr` (a PR number to open on). Paddock's PR row passes them, opening the walkthrough in a `Walk #n` tab in the space |

The key here is `ctrl-shift-r` (`ctrl-shift-k`, upstream's on Windows, is Herdr's picker). The Last turn hooks
aren't installed.

## Install (Windows + WSL)

Cloned on the Windows side; Herdr's `mods/walkthrough` is a junction to the repo's `mods/walkthrough`:

```
cmd /c mklink /J %USERPROFILE%\.config\herdr-app\mods\walkthrough %USERPROFILE%\src\herdr-walkthrough\mods\walkthrough
```

Hot reload doesn't see edits through the junction. After an edit, from WSL:

```sh
cd /mnt/c/Users/$USER/.config/herdr-app/mods && mv walkthrough walkthrough-reload && sleep 2 && mv walkthrough-reload walkthrough
```

## Committing, pushing, upstream

Straight on `main`, from WSL:

```sh
cd /mnt/c/Users/$USER/src/herdr-walkthrough   # the Windows user, if it differs from WSL's
npm test
git -c user.name=Herlitzd -c user.email=2797382+Herlitzd@users.noreply.github.com commit -am "..."
git -c credential.helper='!gh auth git-credential' push origin main
```

Upstream changes: `git fetch upstream && git merge upstream/main`, then look for conflicts around the
`Local patch` comments and run `npm test`. Keep `mod.json`'s version as upstream's (a test checks it).
