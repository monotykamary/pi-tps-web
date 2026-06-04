import { SmartTooltip } from '../SmartTooltip';
import { TpsTooltip } from '../tooltips';
import { formatTps } from '../../lib/format/format';

const COLOR_SCHEMES: Record<string, { bg: string; border: string; iconBg: string; iconText: string }> = {
  moss: {
    bg: 'bg-moss/5 dark:bg-moss/10',
    border: 'border-moss/15 dark:border-moss/20',
    iconBg: 'bg-moss/10 dark:bg-moss/15',
    iconText: 'text-moss',
  },
  accent: {
    bg: 'bg-accent/5 dark:bg-accent/10',
    border: 'border-accent/15 dark:border-accent/20',
    iconBg: 'bg-accent/10 dark:bg-accent/15',
    iconText: 'text-accent',
  },
  amber: {
    bg: 'bg-amber/5 dark:bg-amber/10',
    border: 'border-amber/15 dark:border-amber/20',
    iconBg: 'bg-amber/10 dark:bg-amber/15',
    iconText: 'text-amber',
  },
  ember: {
    bg: 'bg-ember/5 dark:bg-ember/10',
    border: 'border-ember/15 dark:border-ember/20',
    iconBg: 'bg-ember/10 dark:bg-ember/15',
    iconText: 'text-ember',
  },
};

const DEFAULT_SCHEME = {
  bg: 'bg-white/60 dark:bg-zinc-800/40',
  border: 'border-zinc-200/50 dark:border-white/[0.06]',
  iconBg: 'bg-zinc-100 dark:bg-white/[0.04]',
  iconText: 'text-zinc-500 dark:text-zinc-400',
};

const ACCENT_SCHEME = COLOR_SCHEMES.accent;

function getScheme(color?: string, accent?: boolean) {
  if (color && COLOR_SCHEMES[color]) return COLOR_SCHEMES[color];
  if (accent) return ACCENT_SCHEME;
  return DEFAULT_SCHEME;
}

export function PillBody({ icon: Icon, label, value, unit, subLabel, subValue, accent = false, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  accent?: boolean;
  color?: 'moss' | 'accent' | 'amber' | 'ember';
}) {
  const scheme = getScheme(color, accent);
  return (
    <div
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-colors ${scheme.bg} ${scheme.border}`}
    >
      <div className={`shrink-0 p-1.5 rounded-lg ${scheme.iconBg} ${scheme.iconText}`}>
        <Icon weight="bold" size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-400 leading-none">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <p className="metric-mono text-base font-semibold text-zinc-800 dark:text-zinc-300 leading-tight whitespace-nowrap">
            {value}{unit && <span className="text-xs text-zinc-400 dark:text-zinc-400 ml-0.5">{unit}</span>}
          </p>
          {subValue && (
            <span className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-tight">
              {subLabel && <span className="text-zinc-400 dark:text-zinc-500 mr-0.5">{subLabel}</span>}
              <span className="metric-mono font-medium">{subValue}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function MetricPill({ icon, label, value, unit, subLabel, subValue, accent = false, color, tooltip }: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  accent?: boolean;
  color?: 'moss' | 'accent' | 'amber' | 'ember';
  tooltip?: React.ReactNode;
}) {
  if (!tooltip) {
    return (
      <PillBody
        icon={icon}
        label={label}
        value={value}
        unit={unit}
        subLabel={subLabel}
        subValue={subValue}
        accent={accent}
        color={color}
      />
    );
  }
  return (
    <SmartTooltip content={tooltip}>
      <PillBody
        icon={icon}
        label={label}
        value={value}
        unit={unit}
        subLabel={subLabel}
        subValue={subValue}
        accent={accent}
        color={color}
      />
    </SmartTooltip>
  );
}

export function TpsPill({ icon, label, activeTps, wallTps, lossPct, accent = false, mode }: {
  icon: React.ElementType;
  label: string;
  activeTps: number;
  wallTps: number;
  lossPct: number;
  accent?: boolean;
  mode: 'avg' | 'weighted';
}) {
  return (
    <SmartTooltip content={
      <TpsTooltip activeTps={activeTps} wallTps={wallTps} lossPct={lossPct} mode={mode} />
    } preferredPlacement="bottom" gap={10}>
      <PillBody
        icon={icon}
        label={label}
        value={formatTps(activeTps)}
        unit="tok/s"
        accent={accent}
      />
    </SmartTooltip>
  );
}
