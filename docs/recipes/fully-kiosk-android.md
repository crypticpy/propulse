# Android / Fire Tablet Wall Display (Fully Kiosk Browser)

**What you get:** an Android tablet (or, with caveats below, a Fire
tablet) that boots into a locked-down fullscreen browser pointed at the
PropPulse kiosk, stays awake indefinitely, and reloads on a schedule.
Fully Kiosk Browser is the de facto standard app for this — free tier
covers everything in this recipe.

**You need:**

- An Android tablet, or a Fire tablet (see limitations in §5 before
  committing to Fire hardware for anything beyond casual use)
- [Fully Kiosk Browser](https://www.fully-kiosk.com/) installed —
  available on the Play Store for Android, sideloadable APK for Fire OS
  since it isn't in the Amazon Appstore
- The deployed app URL (example below uses `https://propulse.vercel.app`;
  self-hosters substitute their own)
- Power connected permanently — this is a wall display, not a portable
  device; battery-powered 24/7 operation is a fire-safety concern for
  repurposed tablets, not just a battery-life inconvenience

Fully Kiosk's settings menu has been reorganized across versions; the
setting names below describe *what to configure*, not necessarily the
exact menu path in your installed version — if a label doesn't match,
search the in-app settings search box for the keyword.

## 1. Set the start URL

Fully Kiosk Browser → Settings → **Web Content Settings** → Start URL:

```text
https://propulse.vercel.app/kiosk?start=1
```

The `?start=1` parameter is the app's documented kiosk-autostart contract:
it boots straight into scene rotation without needing a tap (see
`src/pages/KioskPage.tsx`). If you've configured named scenes ahead of
time from the Kiosk page on a desktop browser, add `&scene=<id>` to pin
which one this device starts on.

Also enable, under the same section or **Kiosk Mode**:

- **Enable Kiosk Mode** (or "Lock Kiosk Mode") — hides the browser chrome,
  status bar, and navigation bar, and blocks the user from leaving the app
- **Auto Load Start URL** on boot / on app launch

## 2. Screen always on

Settings → **Motion & Screen** (or **Display Settings**, depending on
version):

- **Keep Screen On** — enable; this is the core setting, keeps the
  display awake indefinitely regardless of Android's own timeout
- **Screen Brightness** — set a fixed value if you don't want Fully Kiosk
  auto-adjusting for ambient light
- Disable Android's own system-level screen timeout too
  (Settings → Display → Screen timeout → Never) — Fully Kiosk's
  keep-awake usually overrides this, but setting both removes any doubt

## 3. Scheduled daily reload

A full page reload once a day clears memory growth and guarantees the
device is running against the latest deployed build, since a
long-lived SPA tab won't self-update.

Settings → **Scheduled Actions** (or **Advanced Web Settings** on older
versions) → add a scheduled action:

- Action: **Reload Start URL** (or **Restart App**, which is a slightly
  harder reset and also fine)
- Time: `04:00` local — matches standard signage practice, pick a time
  with no expected shack activity
- Repeat: daily

If your version doesn't expose a reload action directly, the fallback is
**Restart App** on the same schedule — it's a heavier reset (relaunches
Fully Kiosk itself) but achieves the same "fresh state every day" goal.

## 4. Optional: motion-detection wake

Fully Kiosk can use the front camera to detect motion and wake the screen
when someone approaches, then let it sleep otherwise — useful if you'd
rather not run the display at full brightness 24/7 but still want it
awake whenever someone's in the room.

Settings → **Motion & Screen** → **Motion Detection**:

- Enable **Wake up device on motion**
- Tune sensitivity — front-facing tablet cameras vary a lot in noise
  floor; start conservative and loosen if it's missing real approaches

This is optional and trades a small amount of responsiveness (device is
dim/off until motion triggers wake) for reduced screen burn-in risk and
power draw. Skip it for a display meant to be glanceable at all times.

## 5. Fire tablet limitations

Per community research on this exact use case: Fire OS is not Android
proper, and some Fire tablets **suspend or kill background processes
regardless of Fully Kiosk's keep-awake settings** — the OS-level
aggressive power management on Fire OS can override app-level
"stay awake" requests in ways stock Android tablets don't exhibit. Fire
TV devices are even less consistent for this than Fire tablets.

If you're choosing hardware for a dedicated wall display and don't
already own a Fire tablet, a stock Android tablet is the safer bet for
this use case. If you're repurposing a Fire tablet you already have:

- Test overnight before trusting it — leave it running unattended and
  check in the morning whether it's still displaying, not just powered on
- Sideload the Fully Kiosk APK (not available via Amazon Appstore) and
  grant it "Display over other apps" and battery-optimization-exempt
  status manually in Fire OS settings
- Treat any reload/wake schedule as best-effort, not guaranteed, on this
  hardware

## 6. Remote administration

Fully Kiosk exposes a **Remote Admin** interface (Settings → Remote
Administration) that lets you reload the page, check device status, or
push a new start URL from a browser on the same network without walking
up to the tablet. Enable it if the device isn't easily reachable
(mounted high on a wall, etc.), and set a PIN/password — the remote admin
interface is unauthenticated by default on some versions, which is not
something you want reachable from an untrusted network.

## 7. Exiting kiosk lock

If you need to get back to Android/Fire OS settings, Fully Kiosk's kiosk
lock is normally exited with a configured PIN (Settings → Kiosk Mode →
Kiosk PIN) via a multi-tap gesture in a corner of the screen, or through
Remote Admin. Set a PIN before locking the device down — the default
unlock gesture without one is easy to trigger by accident, and having
none set at all can leave you needing a factory reset to get back in.
