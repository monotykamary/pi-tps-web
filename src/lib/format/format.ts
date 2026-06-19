export function formatDuration(ms: number): string {
  if (ms < 1000) {
    const rounded = Math.round(ms * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}ms`;
  }
  if (ms < 60000) {
    const s = ms / 1000;
    return `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
  }

  const totalSeconds = Math.round(ms / 1000);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600) % 24;
  const d = Math.floor(totalSeconds / 86400) % 30;
  const mo = Math.floor(totalSeconds / 2592000) % 12;
  const y = Math.floor(totalSeconds / 31536000);

  if (y > 0) return `${y}y ${mo}mo`;
  if (mo > 0) return `${mo}mo ${d}d`;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function formatNumber(n: number | null, decimals = 1): string {
  if (n === null) return '-';
  if (n < 1_000) return String(Math.round(n));

  let value: number;
  let suffix: string;

  if (n >= 1_000_000_000) {
    value = n / 1_000_000_000;
    suffix = 'B';
  } else if (n >= 1_000_000) {
    value = n / 1_000_000;
    suffix = 'M';
  } else {
    value = n / 1_000;
    suffix = 'K';
  }

  const formatted = value.toFixed(decimals);
  if (formatted.endsWith('.0')) {
    return `${value.toFixed(0)}${suffix}`;
  }
  return `${formatted}${suffix}`;
}

export function formatCurrency(n: number | null): string {
  if (n === null) return '-';
  return `$${n.toFixed(4)}`;
}

/** Format a $/M-tokens rate (the pi-tps banner's blended $/M). null → '-'. */
export function formatUsdPerM(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '-';
  return `$${n.toFixed(2)}/M`;
}

export function formatTps(n: number): string {
  if (n >= 1000) return Math.round(n).toString();
  return n.toFixed(1);
}

export function formatEnergy(joules: number): string {
  if (joules === 0) return '0 J';
  if (joules < 3.6) {
    return `${joules.toFixed(2)} J`;
  }
  const mWh = joules / 3_600;
  if (mWh < 1000) {
    return `${mWh.toFixed(2)} mWh`;
  }
  const wh = mWh / 1_000;
  if (wh < 1000) {
    return `${wh.toFixed(2)} Wh`;
  }
  const kWh = wh / 1_000;
  return `${kWh.toFixed(2)} kWh`;
}

export function formatThreshold(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return n.toString();
}

export function formatEnergyParts(joules: number): { value: string; unit: string } {
  if (joules === 0) return { value: '0', unit: 'J' };
  if (joules < 3.6) {
    return { value: joules.toFixed(2), unit: 'J' };
  }
  const mWh = joules / 3_600;
  if (mWh < 1000) {
    return { value: mWh.toFixed(2), unit: 'mWh' };
  }
  const wh = mWh / 1_000;
  if (wh < 1000) {
    return { value: wh.toFixed(2), unit: 'Wh' };
  }
  const kWh = wh / 1_000;
  return { value: kWh.toFixed(2), unit: 'kWh' };
}
