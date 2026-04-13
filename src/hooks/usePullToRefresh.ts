import { useState, useEffect, useRef, useCallback } from 'react';

const THRESHOLD = 80;

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const dragging = useRef(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPulling(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        dragging.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > THRESHOLD) setPulling(true);
    };

    const onTouchEnd = () => {
      if (pulling && !refreshing) {
        handleRefresh();
      } else {
        setPulling(false);
      }
      dragging.current = false;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [pulling, refreshing, handleRefresh]);

  return { pulling, refreshing };
}
