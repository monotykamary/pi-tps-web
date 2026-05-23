import { useRef, useCallback, useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface SmartTooltipProps {
  children: ReactNode;
  content: ReactNode;
  preferredPlacement?: 'top' | 'bottom';
  gap?: number;
  minWidth?: number;
  maxWidth?: number;
}

const HIDE_DELAY_MS = 120;

/** Holds the hide callback of the currently visible tooltip across instances. */
let activeHide: (() => void) | null = null;

/**
 * Viewport-aware tooltip wrapper.
 *
 * Measures the tooltip on hover and positions it with `position: fixed` so it
 * can never be clipped by an `overflow: hidden` ancestor. Flips vertically if
 * there is not enough room, and nudges horizontally if it would bleed past the
 * left or right edge of the viewport. Hidden on scroll / resize.
 *
 * A short hide-delay lets the user move the cursor from the trigger into the
 * tooltip (across the gap) without the tooltip flickering away.
 *
 * Cross-instance coordination: hovering a new pill immediately dismisses any
 * other visible tooltip, so only one tooltip is ever shown at a time.
 */
export function SmartTooltip({
  children,
  content,
  preferredPlacement = 'bottom',
  gap = 10,
  minWidth = 240,
  maxWidth = 340,
}: SmartTooltipProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ourHideRef = useRef<(() => void) | null>(null);

  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0, pointerEvents: 'none' });
  const [arrowDir, setArrowDir] = useState<'up' | 'down'>('up');
  const [arrowOffset, setArrowOffset] = useState(0);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const doHide = useCallback(() => {
    clearHideTimer();
    if (activeHide === ourHideRef.current) activeHide = null;
    setVisible(false);
    setStyle({ opacity: 0, pointerEvents: 'none' });
  }, [clearHideTimer]);

  useEffect(() => {
    ourHideRef.current = doHide;
  }, [doHide]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => doHide(), HIDE_DELAY_MS);
  }, [clearHideTimer, doHide]);

  const measureAndShow = useCallback(() => {
    clearHideTimer();

    // If another tooltip is active, hide it immediately (bypass delay).
    if (activeHide && activeHide !== ourHideRef.current) {
      activeHide();
    }
    activeHide = ourHideRef.current;

    const trigger = triggerRef.current;
    if (!trigger) return;

    const sizer = trigger.querySelector('[data-tooltip-sizer]') as HTMLElement | null;
    if (!sizer) return;

    const tRect = trigger.getBoundingClientRect();
    const sRect = sizer.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 14;

    const width = Math.max(minWidth, Math.min(sRect.width + 1, maxWidth));

    // ── Vertical placement ──
    const spaceBelow = vh - tRect.bottom;
    const spaceAbove = tRect.top;
    const needed = sRect.height + gap + pad;

    let placement = preferredPlacement;
    if (preferredPlacement === 'bottom' && spaceBelow < needed) {
      if (spaceAbove >= needed) placement = 'top';
    } else if (preferredPlacement === 'top' && spaceAbove < needed) {
      if (spaceBelow >= needed) placement = 'bottom';
    }

    setArrowDir(placement === 'bottom' ? 'up' : 'down');

    const top = placement === 'bottom' ? tRect.bottom + gap : undefined;
    const bottom = placement === 'top' ? vh - tRect.top + gap : undefined;

    // ── Horizontal centre with nudge ──
    const centre = tRect.left + tRect.width / 2;
    let left = centre - width / 2;
    if (left < pad) left = pad;
    if (left + width > vw - pad) left = vw - pad - width;

    setArrowOffset(centre - left);
    setStyle({
      position: 'fixed',
      top,
      bottom,
      left,
      width,
      opacity: 1,
      pointerEvents: 'auto',
    });
    setVisible(true);
  }, [clearHideTimer, preferredPlacement, gap, minWidth, maxWidth]);

  // Hide immediately on scroll / resize so the fixed tooltip never detaches
  useEffect(() => {
    if (!visible) return;
    const handler = () => {
      clearHideTimer();
      doHide();
    };
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [visible, doHide, clearHideTimer]);

  // Cleanup timer and active-hide registry on unmount
  useEffect(() => {
    return () => {
      clearHideTimer();
      if (activeHide === ourHideRef.current) activeHide = null;
    };
  }, [clearHideTimer]);

  const arrowClasses =
    arrowDir === 'up'
      ? 'top-[-4px] border-l border-t'
      : 'bottom-[-4px] border-r border-b';

  return (
    <div
      ref={triggerRef}
      className="relative inline-block w-full"
      onMouseEnter={measureAndShow}
      onMouseLeave={scheduleHide}
      onFocus={measureAndShow}
      onBlur={scheduleHide}
    >
      {children}

      {/* Invisible sizer — fixed off-screen so it never affects scroll width */}
      <div
        data-tooltip-sizer
        className="fixed opacity-0 pointer-events-none"
        style={{ minWidth, maxWidth, visibility: 'hidden', left: -9999, top: -9999 }}
        aria-hidden="true"
      >
        {content}
      </div>

      {/* Real tooltip — `fixed` so it can escape any overflow:hidden ancestor */}
      <AnimatePresence>
        {visible && (
          <motion.div
            key="tooltip"
            initial={{ opacity: 0, scale: 0.96, y: arrowDir === 'up' ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: arrowDir === 'up' ? 4 : -4, pointerEvents: 'none' }}
            transition={{ type: 'spring', stiffness: 400, damping: 28, mass: 0.8 }}
            className="z-[100]"
            style={style}
            onMouseEnter={clearHideTimer}
            onMouseLeave={scheduleHide}
          >
            {/* Arrow — opacity-only so CSS rotate(45deg) stays intact */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={`absolute h-2 w-2 bg-white dark:bg-zinc-800 border-zinc-200/60 dark:border-white/[0.08] ${arrowClasses}`}
              style={{
                left: arrowOffset,
                transform: 'translateX(-50%) rotate(45deg)',
              }}
            />
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
