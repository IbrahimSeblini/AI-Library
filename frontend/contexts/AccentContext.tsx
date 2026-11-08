import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ACCENT_COLORS, DEFAULT_ACCENT_ID, applyAccentColor } from '../lib/accentColors';
import { useTheme } from './ThemeContext';

interface AccentContextType {
  accentId: string;
  setAccentId: (id: string) => void;
}

const AccentContext = createContext<AccentContextType | undefined>(undefined);

export const useAccent = () => {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error('useAccent must be used within AccentProvider');
  return ctx;
};

export const AccentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const [accentId, setAccentIdState] = useState<string>(() => {
    const saved = localStorage.getItem('accentColor');
    return saved && ACCENT_COLORS.find((c) => c.id === saved) ? saved : DEFAULT_ACCENT_ID;
  });

  // Re-apply whenever accent or theme changes
  useEffect(() => {
    applyAccentColor(accentId, theme);
  }, [accentId, theme]);

  const setAccentId = (id: string) => {
    setAccentIdState(id);
    localStorage.setItem('accentColor', id);
  };

  return (
    <AccentContext.Provider value={{ accentId, setAccentId }}>
      {children}
    </AccentContext.Provider>
  );
};
