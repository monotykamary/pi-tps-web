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
    <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl p-1">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`relative flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
            theme === value
              ? 'text-slate-800 dark:text-slate-100'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
          title={label}
        >
          {theme === value && (
            <motion.div
              layoutId="theme-toggle-bg"
              className="absolute inset-0 bg-white dark:bg-slate-700 rounded-lg shadow-sm"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Icon size={14} weight="bold" className="relative z-10" />
          <span className="relative z-10 hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
