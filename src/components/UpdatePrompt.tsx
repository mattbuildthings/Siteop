import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { Button } from './ui/Button';

/**
 * Tells the user when a new version of the app is available, and reloads on
 * their say-so.
 *
 * Two problems this solves, both seen on the 2026-09-16 preview deploy.
 *
 * 1. The app kept running the OLD bundle from the service-worker cache after a
 *    deploy. The server was serving the new build; the browser served the
 *    previous one and would have carried on doing so indefinitely.
 *    `registerType: 'autoUpdate'` does not mean "check for updates" -- it means
 *    "take over once a new worker has installed", and nothing was prompting an
 *    installation. A phone left open on a site all week may never check at all.
 *    So this polls: on an interval, whenever the app comes back to the
 *    foreground, and when the network returns.
 *
 * 2. It does NOT reload on its own, which is why registerType is 'prompt'
 *    rather than 'autoUpdate'. An automatic reload would throw away whatever is
 *    in the capture form -- a recording that has been made but not yet saved,
 *    a transcript someone has just corrected -- all of which lives in component
 *    state. Losing a site log to a background update is a worse failure than
 *    running yesterday's build for another ten minutes, so the user presses the
 *    button when it suits them.
 *
 * Keeping the app current matters beyond new features: a release that changes
 * database permissions leaves stale clients talking to a schema that no longer
 * agrees with them.
 */

/** How often to ask the server whether there is a new build. Cheap -- it is a
 *  conditional request for one small file -- but not so frequent that a phone
 *  on site data is doing it constantly. */
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export const UpdatePrompt: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateSWRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedRefresh(true),
      onRegisteredSW: (_swUrl, reg) => setRegistration(reg ?? null)
    });
  }, []);

  useEffect(() => {
    if (!registration) return;

    // Offline checks are pointless and noisy in the console -- on a site with
    // no signal this would otherwise fire every 15 minutes regardless.
    const check = () => {
      if (navigator.onLine) registration.update().catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', check);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', check);
    };
  }, [registration]);

  if (!needRefresh) return null;

  return (
    // Sits above the bottom navigation. Positioned with left/right insets
    // rather than `left-1/2 -translate-x-1/2`: Tailwind v4 compiles that to the
    // standalone `translate` property, which composes with any `transform` in
    // play and is exactly what pushed every toast off the left of the screen.
    <div
      className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-sm card p-3 flex items-center gap-3 shadow-lg"
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">Đã có bản cập nhật</p>
        <p className="text-xs text-ink-soft">Tải lại để dùng bản mới nhất.</p>
      </div>

      <Button size="sm" onClick={() => updateSWRef.current?.(true)} icon={<RefreshCw className="w-4 h-4" />}>
        Tải lại
      </Button>
    </div>
  );
};
