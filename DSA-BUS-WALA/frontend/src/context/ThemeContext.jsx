import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  useEffect(() => {
    // Always light theme
    localStorage.setItem('trackmate-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }, []);

  const value = {
    theme: 'light',
    setTheme: () => {},
    toggleTheme: () => {},
    isDark: false,
    isLight: true
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'light',
      setTheme: () => {},
      toggleTheme: () => {},
      isDark: false,
      isLight: true
    };
  }
  return context;
};

export default ThemeContext;
