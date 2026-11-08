import React, { createContext, useContext, useState, ReactNode } from 'react';

interface UIPreferences {
  showMusicPlayer: boolean;
  setShowMusicPlayer: (v: boolean) => void;
  showChatNav: boolean;
  setShowChatNav: (v: boolean) => void;
}

const UIPreferencesContext = createContext<UIPreferences | undefined>(undefined);

export const useUIPreferences = () => {
  const ctx = useContext(UIPreferencesContext);
  if (!ctx) throw new Error('useUIPreferences must be used within UIPreferencesProvider');
  return ctx;
};

function readBool(key: string, defaultVal: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? defaultVal : v === 'true';
  } catch { return defaultVal; }
}

export const UIPreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [showMusicPlayer, setShowMusicPlayerState] = useState(() => readBool('pref_showMusicPlayer', true));
  const [showChatNav, setShowChatNavState] = useState(() => readBool('pref_showChatNav', true));

  const setShowMusicPlayer = (v: boolean) => {
    setShowMusicPlayerState(v);
    localStorage.setItem('pref_showMusicPlayer', String(v));
  };
  const setShowChatNav = (v: boolean) => {
    setShowChatNavState(v);
    localStorage.setItem('pref_showChatNav', String(v));
  };

  return (
    <UIPreferencesContext.Provider value={{ showMusicPlayer, setShowMusicPlayer, showChatNav, setShowChatNav }}>
      {children}
    </UIPreferencesContext.Provider>
  );
};
