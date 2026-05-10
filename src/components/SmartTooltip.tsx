import { useRef, useCallback, useState, useEffect, type CSSProperties, type ReactNode } from 'react';

interface SmartTooltipProps {
  children: ReactNode;
  content: ReactNode;
  preferredPlacement?: 'top' | 'bottom';
  gap?: number;
  minWidth?: number;
  maxWidth?: number;
}

/**
 * Viewport-aware tooltip wrapper.
 *
 * Measures the tooltip on hover and positions it with `position: fixed` so it
 * can never be clipped by an `overflow: hidden` ancestor. Flips vertically if
 * there is not enough room, and nudges horizontally if it would bleed past the
 * left or right edge of the viewport. Hidden on scroll / resize.
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
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0, pointerEvents: 'none' });
  const [arrowDir, setArrowDir] = useState<'up' | 'down'>('up');
  const [arrowOffset, setArrowOffset] = useState(0);

  const measureAndShow = useCallback(() => {
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
  }, [preferredPlacement, gap, minWidth, maxWidth]);

  const hide = useCallback(() => {
    setVisible(false);
    setStyle({ opacity: 0, pointerEvents: 'none' });
  }, []);

  // Hide on scroll / resize so the fixed tooltip doesn't detach from trigger
  useEffect(() => {
    if (!visible) return;
    const handler = () => hide();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [visible, hide]);

  const arrowClasses =
    arrowDir === 'up'
      ? 'top-[-4px] border-l border-t'
      : 'bottom-[-4px] border-r border-b';

  return (
    <div
      ref={triggerRef}
      className="relative inline-block w-full"
      onMouseEnter={measureAndShow}
      onMouseLeave={hide}
      onFocus={measureAndShow}
      onBlur={hide}
    >
      {children}

      {/* Invisible sizer — always rendered so we can read natural size */}
      <div
        data-tooltip-sizer
        className="absolute opacity-0 pointer-events-none"
        style={{ minWidth, maxWidth, visibility: 'hidden' }}
        aria-hidden="true"
      >
        {content}
      </div>

      {/* Real tooltip — `fixed` so it can escape any overflow:hidden ancestor */}
      {visible && (
        <div
          className="z-[100] transition-opacity duration-200"
          style={style}
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={hide}
        >
          {/* Arrow */}
          <div
            className={`absolute h-2 w-2 bg-white dark:bg-zinc-800 border-zinc-200/60 dark:border-white/[0.08] ${arrowClasses}`}
            style={{
              left: arrowOffset,
              transform: 'translateX(-50%) rotate(45deg)',
            }}
          />
          {content}
        </div>
      )}
    </div>
  );
}
