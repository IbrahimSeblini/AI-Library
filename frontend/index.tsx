
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import { AccentProvider } from './contexts/AccentContext';
import { UIPreferencesProvider } from './contexts/UIPreferencesContext';
import './styles/theme.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <AccentProvider>
        <UIPreferencesProvider>
          <App />
        </UIPreferencesProvider>
      </AccentProvider>
    </ThemeProvider>
  </React.StrictMode>
);