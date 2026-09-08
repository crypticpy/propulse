/**
 * Notifications section for Settings page.
 * Wraps the existing NotificationSettings component (which includes WatchAlertSettings).
 * Adds Quiet Hours controls for suppressing audible alerts during specified UTC hours.
 */

import { useSettingsStore } from "@/stores/settingsStore";
import { NotificationSettings } from "@/components/settings/NotificationSettings";

export function NotificationsSection() {
  const notifications = useSettingsStore((s) => s.notifications);
  const updateNotifications = useSettingsStore((s) => s.updateNotifications);

  const quietHoursEnabled =
    notifications?.quietHoursStart !== undefined &&
    notifications?.quietHoursEnd !== undefined;

  return (
    <div className="space-y-6">
      <NotificationSettings />

      {/* Quiet Hours */}
      <div className="border-t border-su-line/40 pt-6">
        <h3 className="text-sm font-semibold text-su-muted uppercase tracking-wider mb-3">
          Quiet Hours
        </h3>
        <p className="text-xs text-su-muted mb-4">
          Suppress all audible alerts during specified UTC hours.
        </p>

        <div className="p-3 bg-nebula-blue rounded-lg border border-su-line/40 space-y-3">
          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={quietHoursEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  updateNotifications({
                    quietHoursStart: 22,
                    quietHoursEnd: 6,
                  });
                } else {
                  updateNotifications({
                    quietHoursStart: undefined,
                    quietHoursEnd: undefined,
                  });
                }
              }}
              className="w-4 h-4 rounded accent-plasma-orange"
            />
            <span className="text-sm text-su-muted">Enable quiet hours</span>
          </label>

          {quietHoursEnabled && (
            <div className="flex items-center gap-3 pl-7">
              <div>
                <label className="block text-xs text-su-muted mb-1">
                  Start (UTC)
                </label>
                <select
                  value={notifications?.quietHoursStart ?? 22}
                  onChange={(e) =>
                    updateNotifications({
                      quietHoursStart: Number(e.target.value),
                    })
                  }
                  className="bg-void-black border border-su-line/40 text-su-text rounded-lg px-2 py-1.5 text-sm focus:border-plasma-orange/50 focus:outline-none"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-su-muted mt-5">to</span>
              <div>
                <label className="block text-xs text-su-muted mb-1">
                  End (UTC)
                </label>
                <select
                  value={notifications?.quietHoursEnd ?? 6}
                  onChange={(e) =>
                    updateNotifications({
                      quietHoursEnd: Number(e.target.value),
                    })
                  }
                  className="bg-void-black border border-su-line/40 text-su-text rounded-lg px-2 py-1.5 text-sm focus:border-plasma-orange/50 focus:outline-none"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
