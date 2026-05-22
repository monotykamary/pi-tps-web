import { SmartTooltip } from '../SmartTooltip';
import { TpsTooltip } from '../tooltips';
import { formatTps } from '../../lib/format/format';

export function PillBody({ icon: Icon, label, value, unit, subLabel, subValue, accent = false }: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-colors ${
        accent
          ? 'bg-accent/5 border-accent/15 dark:bg-accent/10 dark:border-accent/20'
          : 'bg-white/60 border-zinc-200/50 dark:bg-zinc-800/40 dark:border-white/[0.06]'
      }`}
    >
      <div className={`shrink-0 p-1.5 rounded-lg ${
        accent
          ? 'bg-accent/10 text-accent dark:bg-accent/15'
          : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400'
      }`}>
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

export function MetricPill({ icon, label, value, unit, subLabel, subValue, accent = false, tooltip }: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  accent?: boolean;
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
