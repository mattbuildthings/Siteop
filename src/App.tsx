import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { CaptureRoute } from './routes/CaptureRoute';
import { DiaryRoute } from './routes/DiaryRoute';
import { DigestRoute } from './routes/DigestRoute';
import { SyncRoute } from './routes/SyncRoute';
import { DiaryEntry } from './lib/types';
import { supabase } from './lib/supabase';
import { getOfflineQueue, processOfflineQueue } from './lib/offlineStore';
import { User } from '@supabase/supabase-js';

export function App() {
  const [currentRoute, setCurrentRouteState] = useState<'capture' | 'diary' | 'digest' | 'sync'>(() => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    if (['capture', 'diary', 'digest', 'sync'].includes(hash)) {
      return hash as any;
    }
    return 'capture';
  });

  const setCurrentRoute = (route: 'capture' | 'diary' | 'digest' | 'sync') => {
    window.location.hash = `#/${route}`;
    setCurrentRouteState(route);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (['capture', 'diary', 'digest', 'sync'].includes(hash)) {
        setCurrentRouteState(hash as any);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Monitor Online / Offline status & update queue count
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processOfflineQueue().then(() => {
        updateOfflineCount();
        fetchEntries();
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updateOfflineCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updateOfflineCount = () => {
    const queue = getOfflineQueue();
    setOfflineCount(queue.length);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const fetchEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('diary_entries')
        .select(`
          *,
          entry_flags (*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase fetch entries error:', error);
      } else if (data) {
        setEntries(data as DiaryEntry[]);
      }
    } catch (err) {
      console.warn('Fetch entries exception:', err);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      {/* Top Navbar & Bottom Navigation (4 Tabs) */}
      <Navbar
        currentRoute={currentRoute}
        onNavigate={setCurrentRoute}
        isOnline={isOnline}
        offlineCount={offlineCount}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-lg mx-auto pt-2">
        {currentRoute === 'capture' && (
          <CaptureRoute
            isOnline={isOnline}
            onEntrySaved={() => {
              updateOfflineCount();
              fetchEntries();
            }}
          />
        )}

        {currentRoute === 'diary' && (
          <DiaryRoute
            entries={entries}
            onRefresh={fetchEntries}
            onNavigateToSync={() => setCurrentRoute('sync')}
          />
        )}

        {currentRoute === 'digest' && (
          <DigestRoute onRefresh={fetchEntries} />
        )}

        {currentRoute === 'sync' && (
          <SyncRoute entries={entries} onRefresh={fetchEntries} />
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => {
          fetchEntries();
        }}
      />
    </div>
  );
}

export default App;
