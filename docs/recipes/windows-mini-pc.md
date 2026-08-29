# Windows 11 Mini PC Wall Display

**What you get:** a Windows 11 mini PC (Intel N100-class or similar) that
logs in automatically, launches a fullscreen kiosk browser pointed at
PropPulse with no desktop or taskbar visible, restarts nightly to pick up
app updates, and relaunches the browser automatically if it crashes.

**You need:**

- A Windows 11 mini PC with a local user account you're willing to
  auto-login (see the security note in §2 before doing this on a
  multi-purpose machine)
- Microsoft Edge (built in) or Google Chrome
- The deployed app URL (example below uses `https://propulse.vercel.app`;
  self-hosters substitute their own)
- Admin rights to configure Task Scheduler and power settings

This recipe deliberately avoids Windows **Assigned Access** (the
"kiosk mode" built into Windows Settings). Assigned Access locks the
whole session to a single app/window and is designed for single-monitor
retail kiosks; if you ever want a second monitor doing something else on
this box, or just want to Alt-Tab to check on it, a plain auto-started
browser window is the more flexible and more commonly used path for a
shack display.

## 1. Power settings — never sleep, display always on

Settings → System → Power & battery → Screen and sleep:

- **Screen: Never** (both "on battery" and "when plugged in" if a laptop)
- **Sleep: Never** (both, likewise)

Also disable via the classic Control Panel power plan (belt-and-suspenders,
some OEM power tools still read these instead of the new Settings UI):

```powershell
powercfg /change monitor-timeout-ac 0
powercfg /change monitor-timeout-dc 0
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
```

## 2. Auto-login

Run `netplwiz` (Win+R → `netplwiz` → Enter):

- Select the dedicated display account
- Uncheck **"Users must enter a password to use this computer"**
- Apply, enter the password once when prompted

Security note: this account should be a dedicated, low-privilege local
account used only for the display — not your daily-driver Windows login.
Auto-login stores the password in a lightly-obfuscated registry value
(`LSA\DefaultPassword`), which is acceptable for a physically-secured
shack machine but is not something to do on a laptop that leaves the
building.

## 3. Launch the browser in kiosk mode at login

Create a shortcut in the Startup folder. Win+R → `shell:startup` → Enter,
then create a new shortcut in that folder targeting your browser with
kiosk flags.

**Edge:**

```text
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk "https://propulse.vercel.app/kiosk?start=1" --edge-kiosk-type=fullscreen --noerrdialogs --disable-session-crashed-bubble --disable-restore-session-state
```

**Chrome:**

```text
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "https://propulse.vercel.app/kiosk?start=1" --noerrdialogs --disable-session-crashed-bubble --disable-restore-session-state
```

Notes:

- `--kiosk` — fullscreen, no address bar/tabs/chrome
- `--edge-kiosk-type=fullscreen` (Edge-specific) — without it Edge's
  `--kiosk` can default to a more restrictive "single-app kiosk" mode
  meant for Assigned Access scenarios
- `--noerrdialogs` / `--disable-session-crashed-bubble` /
  `--disable-restore-session-state` — suppress the "restore previous
  session?" prompt that appears after an unclean shutdown (e.g. a power
  cut), which would otherwise block the kiosk waiting for input that
  never comes
- `?start=1` is the app's kiosk-autostart contract — boots directly into
  scene rotation without a click (see `src/pages/KioskPage.tsx`). Add
  `&scene=<id>` to pin a starting scene.
- Exact install paths vary by machine (`Program Files` vs
  `Program Files (x86)`, per-user vs system-wide Chrome install) — adjust
  the path if the shortcut fails to launch.

## 4. Scheduled nightly restart (Task Scheduler)

A nightly restart clears memory growth and guarantees the kiosk is
running the latest deployed build, since the SPA tab won't self-update on
its own. 04:00 local matches standard signage practice — pick a time with
no expected shack activity.

Task Scheduler → Create Task:

- **General**: Run whether user is logged on or not is *not* needed here
  since you want it to run as the logged-in kiosk session; instead check
  "Run only when user is logged on"
- **Triggers**: New → Daily → 04:00
- **Actions**: New → Start a program:
  - Program: `shutdown.exe`
  - Arguments: `/r /t 60 /c "Nightly PropPulse kiosk restart"`

A full OS restart (rather than just killing the browser) is the more
reliable reset on Windows — it also clears any accumulated driver/GPU
state from a long-running session, which matters more here than on Linux
given how Windows handles long-uptime display driver leaks.

If a full restart is undesirable (e.g. shared machine, slow boot), the
lighter alternative is a scheduled task that just kills and relaunches
the browser process instead of rebooting:

- Action: Start a program
  - Program: `taskkill.exe`
  - Arguments: `/IM msedge.exe /F` (or `chrome.exe`)

Combine this with the watchdog task in §5, which will bring the browser
back up within a minute of it being killed.

## 5. Recovery watchdog (relaunch browser if it crashes)

Task Scheduler → Create Task:

- **Triggers**: New → **On a schedule** → Repeat task every **1 minute**,
  indefinitely (set the repeat duration to a long value, e.g. "Indefinitely")
- **Conditions**: uncheck "Start the task only if the computer is on AC
  power" if this is a plugged-in mini PC (it is) — otherwise the task can
  silently stop firing
- **Actions**: New → Start a program:
  - Program: `powershell.exe`
  - Arguments:
    ```
    -WindowStyle Hidden -Command "if (-not (Get-Process msedge -ErrorAction SilentlyContinue)) { Start-Process 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--kiosk','https://propulse.vercel.app/kiosk?start=1','--edge-kiosk-type=fullscreen','--noerrdialogs','--disable-session-crashed-bubble','--disable-restore-session-state' }"
    ```

This checks once a minute whether the browser process is running and
relaunches it only if it's gone — it won't fight with or duplicate an
already-running instance. Swap `msedge` / the Edge path for Chrome's
process name (`chrome`) and install path if using Chrome instead.

## 6. Verifying the setup

- Reboot the machine cold and confirm it reaches the fullscreen kiosk
  with no login prompt and no restore-session dialog
- Kill the browser via Task Manager and confirm the watchdog task brings
  it back within ~1 minute
- Leave it running overnight and confirm the display is still live and
  current the next morning (catches both sleep-setting gaps and the
  nightly restart/reload actually firing)
