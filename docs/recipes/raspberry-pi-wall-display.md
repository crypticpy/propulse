# Raspberry Pi Wall Display

**What you get:** a Raspberry Pi that boots straight to a fullscreen Chromium
window running the PropPulse kiosk, survives browser crashes, and reloads
itself once a day to pick up app updates and clear memory. No desktop
environment interaction needed after first boot.

**You need:**

- Raspberry Pi 3B+, 4, or 5 running Raspberry Pi OS Bookworm (or later) —
  the default desktop image uses `labwc` (Wayland) instead of the old X11
  `lxsession`; this recipe targets that stack
- A monitor and network connection
- The deployed app URL (example below uses `https://propulse.vercel.app`;
  self-hosters substitute their own)
- SSH or physical access to run a handful of shell commands

Menu names below (Raspberry Pi Imager options, `raspi-config` labels) may
shift between OS releases — if something's moved, search "raspberry pi
bookworm <setting>" for the current path; the underlying config files are
stable.

## 1. Flash and boot

Flash Raspberry Pi OS (64-bit, with desktop) with Raspberry Pi Imager.
In the imager's advanced options (gear icon / Ctrl+Shift+X), set:

- Hostname (e.g. `propulse-wall`)
- Enable SSH
- Wi-Fi credentials if not wired
- **Enable auto-login to desktop** — this is required; the kiosk can't
  start until something logs into the desktop session automatically

Boot the Pi, confirm it reaches the desktop without a login prompt, and
confirm network access.

## 2. Disable screen blanking

Wayland/labwc ignores the old `xset s off -dpms` tricks. Two things to set:

**Console blanking** (belt-and-suspenders, applies before X/Wayland starts).
Edit `/boot/firmware/cmdline.txt` and append to the single existing line:

```text
consoleblank=0
```

**Compositor idle/DPMS.** labwc has no built-in idle-dimming by default on
recent Bookworm images, but if your image ships `wayfire` instead (some
Pi 3 lite images fall back to it), disable idle timeout in
`~/.config/wayfire.ini`:

```ini
[idle]
dpms_timeout=0
```

If you're unsure which compositor you're running, check with:

```bash
echo $XDG_SESSION_TYPE
ps aux | grep -E 'labwc|wayfire'
```

## 3. Autostart Chromium in kiosk mode

Create the labwc autostart file:

```bash
mkdir -p ~/.config/labwc
```

`~/.config/labwc/autostart`:

```bash
#!/bin/sh
# Give the compositor a moment to settle before launching Chromium —
# without this, Chromium can race the compositor and paint a white/black
# screen that never recovers.
sleep 5

chromium --ozone-platform=wayland \
  --kiosk "https://propulse.vercel.app/kiosk?start=1" \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --disable-infobars \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 &
```

Make it executable:

```bash
chmod +x ~/.config/labwc/autostart
```

Notes on the flags:

- `--kiosk` — fullscreen, no chrome/tabs/address bar
- `--noerrdialogs` / `--disable-session-crashed-bubble` /
  `--disable-restore-session-state` — suppress the "Chromium didn't shut
  down correctly, restore pages?" prompt that appears after a power-loss
  reboot, which would otherwise sit in front of the kiosk waiting for a
  click that never comes
- `?start=1` on the URL is the app's documented kiosk-autostart contract —
  it boots straight into scene rotation without requiring a user gesture
  (see `src/pages/KioskPage.tsx`). Add `&scene=<id>` to pin a starting
  scene if you've configured named scenes from the Kiosk page first.

## 4. Restart the browser if it dies (systemd user service)

Wrapping Chromium in a systemd user service with `Restart=always` means a
renderer crash or OOM-kill brings the kiosk back up in seconds instead of
leaving a black screen until someone notices.

`~/.config/systemd/user/propulse-kiosk.service`:

```ini
[Unit]
Description=PropPulse wall display kiosk
After=graphical-session.target

[Service]
Type=simple
ExecStart=/usr/bin/chromium \
  --ozone-platform=wayland \
  --kiosk https://propulse.vercel.app/kiosk?start=1 \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --disable-infobars
Restart=always
RestartSec=3

[Install]
WantedBy=graphical-session.target
```

Enable it and remove the `autostart` file version to avoid running two
copies (pick one mechanism — the systemd service is preferred since it
gives you `Restart=always` for free):

```bash
systemctl --user enable --now propulse-kiosk.service
rm ~/.config/labwc/autostart   # if you'd created it above
```

Check it's alive:

```bash
systemctl --user status propulse-kiosk.service
```

## 5. Daily reload at 04:00 local

A daily full reload clears any accumulated memory growth and guarantees
the kiosk is running the latest deployed build (the SPA doesn't
self-update a stale tab). 04:00 local is the standard signage convention —
pick a time with no expected shack activity.

**systemd timer approach** (kills Chromium; the `Restart=always` unit
above brings it back within seconds, which forces a fresh page load):

`~/.config/systemd/user/propulse-kiosk-reload.service`:

```ini
[Unit]
Description=Restart PropPulse kiosk browser for daily refresh

[Service]
Type=oneshot
ExecStart=/usr/bin/pkill -f "kiosk https://propulse.vercel.app"
```

`~/.config/systemd/user/propulse-kiosk-reload.timer`:

```ini
[Unit]
Description=Daily 04:00 restart of the PropPulse kiosk browser

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl --user enable --now propulse-kiosk-reload.timer
```

**cron alternative**, if you'd rather not add another systemd unit:

```bash
crontab -e
```

```cron
0 4 * * * pkill -f "kiosk https://propulse.vercel.app"
```

Either way, killing the process is enough — the kiosk service's
`Restart=always` relaunches Chromium fresh, which reloads the app from
scratch (new build, cleared JS heap).

## 6. Cursor

Kiosk mode in newer Chromium still shows the mouse cursor if a USB mouse
is attached and never moves; it fades but doesn't always vanish. If it's
distracting, install `unclutter` and let it hide the cursor after
inactivity:

```bash
sudo apt install unclutter
```

Add `unclutter -idle 0.5 &` to the same startup path as Chromium (the
labwc autostart file, or a second systemd unit if you're using that
route).

## 7. Pi model guidance

- **Pi 3B+**: fine for text/data-heavy scenes (DX cluster tables, solar
  panels, the `hamclock` layout mode). Not recommended for the 3D globe
  scene — WebGL performance on the Pi 3's GPU is poor and will visibly
  stutter.
- **Pi 4 (4GB+) or Pi 5**: needed if any rotation scene includes the 3D
  globe. Also gives Chromium more headroom generally — the research notes
  ~2GB RAM minimum for Chromium alone on Pi 4/5, so a 3B+ (1GB) is tight
  even for lighter scenes.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Black screen on boot, never recovers | Chromium started before the compositor finished initializing | Increase the `sleep` in the autostart script (try 10s); confirm auto-login to desktop is actually enabled |
| Screen goes dark after some minutes | Blanking not fully disabled | Check `consoleblank=0` is in `cmdline.txt`; check whether you're on wayfire vs labwc and set the matching idle/DPMS config; confirm the monitor's own power-saving isn't kicking in independently of the Pi |
| Data looks stale / scene hasn't changed in a long time | Browser tab lost network or the app hung on a stale WebSocket/fetch | Confirm the 04:00 reload timer/cron is actually enabled (`systemctl --user list-timers`); manually `pkill -f kiosk` to force an immediate reload and see if it recovers |
| Mouse cursor visible on screen | No cursor-hiding in place | Install and run `unclutter` per §6, or unplug the mouse/keyboard and rely on SSH for admin |
| Chromium exits and doesn't come back | Kiosk not managed by systemd, or unit isn't enabled | Confirm `systemctl --user status propulse-kiosk.service` shows `active (running)`; check `journalctl --user -u propulse-kiosk.service` for crash logs |
| Stuck on the "restore pages?" dialog after a power loss | Missing session-restore suppression flags | Confirm `--disable-session-crashed-bubble` and `--disable-restore-session-state` are both present in the launch command |
