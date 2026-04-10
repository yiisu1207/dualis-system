import React from 'react';
import BottomSheet from './BottomSheet';

/**
 * Wrapper that renders as a centered modal on desktop
 * and as a BottomSheet on mobile.
 * Uses the same API as BottomSheet.
 */
export default function ResponsiveModal(props: React.ComponentProps<typeof BottomSheet>) {
  return <BottomSheet {...props} />;
}
