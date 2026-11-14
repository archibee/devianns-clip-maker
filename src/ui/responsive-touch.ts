/** Small-screen touch policy; editing and media processing remain independent. */
export function installResponsiveTouch(): void {
  const compact = window.matchMedia('(max-width: 1150px)');
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const originalViewport = viewport?.content;
  const updateViewport = () => {
    if (!viewport) return;
    viewport.content = compact.matches
      ? 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
      : (originalViewport ?? 'width=device-width, initial-scale=1');
  };
  const preventPinch = (event: TouchEvent) => {
    if (compact.matches && event.touches.length > 1 && event.cancelable) event.preventDefault();
  };
  const preventGesture = (event: Event) => {
    if (compact.matches && event.cancelable) event.preventDefault();
  };
  updateViewport();
  compact.addEventListener('change', updateViewport);
  document.addEventListener('touchstart', preventPinch, { passive: false });
  document.addEventListener('touchmove', preventPinch, { passive: false });
  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
}
