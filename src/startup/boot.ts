declare global {
  interface Window {
    __clipBoot?: { preparing: () => void; ready: () => void; fail: () => void };
  }
}
export const completeBoot = () => window.__clipBoot?.ready();
export const failBoot = () => window.__clipBoot?.fail();
export const prepareBoot = () => window.__clipBoot?.preparing();
