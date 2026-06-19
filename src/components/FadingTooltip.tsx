import {
  cloneElement, createElement, isValidElement,
  useCallback, useEffect, useRef, useState,
  type ComponentProps, type ReactElement,
} from 'react';
import { Tooltip } from 'recharts';

type RechartsContent = ComponentProps<typeof Tooltip>['content'];

interface FadingTooltipProps extends ComponentProps<typeof Tooltip> {
  /** Fade-in duration for the first tooltip of a hover session (ms). Defaults to 140. */
  fadeDurationMs?: number;
}

/**
 * Drop-in replacement for recharts <Tooltip> that fades in the FIRST tooltip of
 * a hover session and snaps every subsequent one instantly as the cursor moves
 * across the chart — the "fade once on enter, skip on move" feel — without
 * re-introducing recharts' default 400ms glide animation.
 *
 * recharts keeps the tooltip wrapper div mounted for the chart's whole lifetime
 * and just toggles `visibility: hidden↔'visible'` (see TooltipBoundingBox), so a
 * CSS keyframe wouldn't refire between sessions. Instead we drive an `opacity`
 * transition on the wrapper from here, keyed off the one reliable "just became
 * active" signal recharts gives us: the `content` render prop being called with
 * `active: true` for the first time since the last inactivity.
 *
 *  • First active of a session    → opacity 0 → 1 over `fadeDurationMs` (fade in)
 *  • Subsequent points (active stays true) → no state change, stays at 1 (instant)
 *  • Inactive (mouse left / moved to dead space) → schedule opacity back to 0
 *    after a short debounce, so the NEXT session fades in again. The debounce
 *    guards against scatter charts where `active` can flicker false for a frame
 *    between adjacent points (which would otherwise refade every point).
 *
 * `isAnimationActive` defaults to false — recharts' transform-glide transition is
 * exactly the animation weirdness we removed earlier, so callers don't opt back
 * into it by default (override explicitly if ever needed).
 */
function FadingTooltip({ content, wrapperStyle, fadeDurationMs = 140, ...rest }: FadingTooltipProps) {
  // Tracks whether this hover session has already done its one allowed fade-in.
  const fadedRef = useRef(false);
  // Pending inactivity-hide timer (the debounce described above).
  const hideTimerRef = useRef<number | null>(null);
  // opacity lives on the wrapper via wrapperStyle; 0 at rest (recharts hides the
  // wrapper via visibility when inactive, so 0 is invisible anyway, and it means
  // the next fade-in always starts from 0).
  const [opacity, setOpacity] = useState(0);

  const show = useCallback(() => setOpacity(1), []);
  const hide = useCallback(() => setOpacity(0), []);

  // Wrap in a render FUNCTION (not a pre-built element). Recharts 3.x calls the
  // `content` prop differently depending on its type (see Tooltip.js renderContent):
  //   • element   → cloneElement(content, props)  — but the element was built once at
  //                  outer render and gets re-cloned; if it carries state/effects that
  //                  depend on recharts' per-render `props` (like our active watcher)
  //                  that path silently drops them and renders nothing.
  //   • function → createElement(content, props)  — recharts re-invokes every
  //                  render with the live props. That's the faithful contract we need,
  //                  so we pass a function.
  // The function returns FadingTooltipContent, which runs the active-transition
  // side-effects in its OWN effect (not during the render of FadingTooltip) so we
  // don't trip React's "cannot update a component while rendering a different
  // component" guard when calling setOpacity.
  const renderContent = useCallback(
    (props: Record<string, unknown>) =>
      createElement(FadingTooltipContent, {
        ...props,
        content,
        fadedRef,
        show,
        hide,
        hideTimerRef,
      }),
    [content, show, hide],
  );

  // Cancel any pending hide timer on unmount.
  useEffect(() => () => {
    if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current);
  }, []);

  const merged = { transition: `opacity ${fadeDurationMs}ms ease-out`, opacity, ...(wrapperStyle ?? {}) };

  return (
    <Tooltip
      content={renderContent as RechartsContent}
      isAnimationActive={false}
      wrapperStyle={merged}
      {...rest}
    />
  );
}

interface FadingTooltipContentProps extends Record<string, unknown> {
  active?: boolean;
  content: RechartsContent;
  fadedRef: React.RefObject<boolean>;
  show: () => void;
  hide: () => void;
  hideTimerRef: React.RefObject<number | null>;
}

function FadingTooltipContent(props: FadingTooltipContentProps) {
  const { active, content, fadedRef, show, hide, hideTimerRef, ...rechartsProps } = props;
  // Forward `active` (and the rest of recharts' injected props) to the caller's
  // content element. Every custom tooltip checks `if (!active || ...) return null`
  // at the top, so stripping `active` here — which the earlier version did by
  // only forwarding `...rechartsProps` — made every tooltip render null. Keep
  // `active` in the forwarded bag; we only destructured it out to read it in
  // the effect below.

  useEffect(() => {
    if (active) {
      // Cancel any pending inactivity-hide — the tooltip came back, keep the
      // current session alive so we don't fade in again on the next point.
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // First active since the last inactivity → the one allowed fade-in.
      if (!fadedRef.current) {
        fadedRef.current = true;
        show();
      }
    } else {
      // Debounce the reset-to-0 so a single-frame `active:false` flicker
      // (common when a scatter cursor passes between two adjacent points)
      // doesn't tear the tooltip down and refade it on the next point.
      if (fadedRef.current && hideTimerRef.current == null) {
        hideTimerRef.current = window.setTimeout(() => {
          hideTimerRef.current = null;
          fadedRef.current = false;
          hide();
        }, 80);
      }
    }
    // show/hide/fadedRef/hideTimerRef are stable refs/closures; `active` is the
    // only value that actually changes between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Render the caller's content element (or function), forwarding recharts'
  // injected props — exactly what recharts would do itself via cloneElement.
  const forwarded = { ...rechartsProps, active };
  if (isValidElement(content)) {
    return cloneElement(content as ReactElement, forwarded);
  }
  if (typeof content === 'function') {
    return (content as (p: Record<string, unknown>) => ReactElement | null)(forwarded);
  }
  return null;
}

export default FadingTooltip;
