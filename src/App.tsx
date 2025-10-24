import { useEffect, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { Auth } from './components/Auth';
import { supabase } from './lib/supabaseClient';
import { InvoicePage } from './components/InvoicePage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'landing' | 'auth' | 'dashboard'>('landing');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [publicInvoiceToken, setPublicInvoiceToken] = useState<string | null>(null);

  useEffect(() => {
    // If public token present, render invoice page only
    const url = new URL(window.location.href);
    const t = (url.searchParams.get('t') || '').trim();
    if (t) setPublicInvoiceToken(t);

    // Load current session
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
    });
    // Subscribe to auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  function handleAuthSuccess() {
    setIsAuthenticated(true);
    setCurrentPage('dashboard');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setCurrentPage('landing');
  }

  if (publicInvoiceToken) {
    return <InvoicePage />;
  }

  // Simple router
  if (currentPage === 'dashboard') {
    if (!isAuthenticated) {
      return (
        <Auth
          onAuthSuccess={handleAuthSuccess}
          onNavigateHome={() => setCurrentPage('landing')}
        />
      );
    }
    return (
      <Dashboard
        onNavigateHome={() => setCurrentPage('landing')}
        onLogout={handleLogout}
      />
    );
  }

  if (currentPage === 'auth') {
    return (
      <Auth
        onAuthSuccess={handleAuthSuccess}
        onNavigateHome={() => setCurrentPage('landing')}
      />
    );
  }

  return <LandingPage onNavigateAuth={() => setCurrentPage('auth')} />;
}
