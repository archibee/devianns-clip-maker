import { useEffect, useRef, useState } from 'react';

type Choice = { outcome: 'accepted' | 'dismissed' };
type InstallPrompt = Event & { prompt: () => Promise<Choice | void>; userChoice: Promise<Choice> };
export type InstallResult = {
  status: 'accepted' | 'dismissed' | 'unavailable' | 'installed' | 'error' | 'pending';
};
const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

export function usePwaInstall() {
  const [installed, setInstalled] = useState(standalone);
  const [installing, setInstalling] = useState(false);
  const deferred = useRef<InstallPrompt | undefined>(undefined);
  const busy = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const media = window.matchMedia('(display-mode: standalone)');
    const receive = (event: Event) => {
      if (typeof (event as InstallPrompt).prompt !== 'function') return;
      event.preventDefault();
      deferred.current = event as InstallPrompt;
    };
    const complete = () => {
      deferred.current = undefined;
      setInstalled(true);
    };
    const changed = () => {
      if (standalone()) complete();
    };
    window.addEventListener('beforeinstallprompt', receive);
    window.addEventListener('appinstalled', complete);
    media.addEventListener('change', changed);
    return () => {
      alive.current = false;
      deferred.current = undefined;
      window.removeEventListener('beforeinstallprompt', receive);
      window.removeEventListener('appinstalled', complete);
      media.removeEventListener('change', changed);
    };
  }, []);
  async function requestInstall(): Promise<InstallResult> {
    if (installed || standalone()) return { status: 'installed' };
    if (busy.current) return { status: 'pending' };
    const event = deferred.current;
    if (!event) return { status: 'unavailable' };
    deferred.current = undefined;
    busy.current = true;
    setInstalling(true);
    try {
      const response = await event.prompt();
      const choice = response ?? (await event.userChoice);
      return { status: choice.outcome };
    } catch {
      return { status: 'error' };
    } finally {
      busy.current = false;
      if (alive.current) setInstalling(false);
    }
  }
  return { installed, installing, requestInstall };
}
