import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LoginView from './components/LoginView';
import * as AuthService from './services/authService';

const Main: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false); 

  const handleLogin = useCallback(async (email: string, pass: string) => {
    await AuthService.login(email, pass);
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await AuthService.logout();
    setIsAuthenticated(false);
  }, []);

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
  }

  return <App onLogout={handleLogout} />;
};


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Main />
  </React.StrictMode>
);
