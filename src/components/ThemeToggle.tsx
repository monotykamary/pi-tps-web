import { Sun, Moon, Desktop } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import type { Theme } from '../hooks/useTheme';

interface Props {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const options: { value: Theme; icon: React.ElementType; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Desktop, label: 'System' },
];

export default function ThemeToggle({ theme, setTheme }: Props) {
  return (
    <div className="flex items-center gap-1 bg-white/60 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/[0.06] rounded-lg p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`relative flex items-center justify-center h-7 px-2 text-[11px] font-medium rounded-md transition-all ${
            theme === value
              ? 'text-zinc-800 dark:text-zinc-300'
              : 'text-zinc-400 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
          }`}
          title={label}
        >
          {theme === value && (
            <motion.div
              layoutId="theme-toggle-bg"
              className="absolute inset-0 bg-white dark:bg-zinc-700/60 rounded-md shadow-sm"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Icon size={14} weight="bold" className="relative z-10" />
        </button>
      ))}
    </div>
  );
}
