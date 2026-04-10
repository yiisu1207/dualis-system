import { useEffect } from 'react';

/**
 * Fixes iOS virtual keyboard covering inputs.
 * When the keyboard opens (visualViewport shrinks), auto-scrolls the active
 * element into view so the user can see what they're typing.
 */
export function useKeyboardFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handler = () => {
      const keyboardOpen = vv.height < window.innerHeight * 0.8;
      document.documentElement.classList.toggle('keyboard-open', keyboardOpen);

      if (keyboardOpen) {
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
          setTimeout(() => active.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
        }
      }
    };

    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, []);
}
