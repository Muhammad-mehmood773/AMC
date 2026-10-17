let locks = 0;

/**
 * Locks page scrolling while an overlay (modal, drawer, mobile navigation) is open so only the
 * overlay scrolls. Reference-counted for stacked overlays; returns an idempotent release function.
 */
export function lockPageScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  if (locks++ === 0) document.documentElement.classList.add('amc-scroll-locked');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) document.documentElement.classList.remove('amc-scroll-locked');
  };
}
