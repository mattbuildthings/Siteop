import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, RouteId } from './components/Navbar';
import { AuthScreen } from './components/AuthScreen';
import { CaptureRoute } from './routes/CaptureRoute';
import { DiaryRoute } from './routes/DiaryRoute';
import { DigestRoute } from './routes/DigestRoute';
import { SyncRoute } from './routes/SyncRoute';
import { ProjectsRoute } from './routes/ProjectsRoute';
import { DiaryEntry, Project, UserProfile } from './lib/types';
import { supabase } from './lib/supabase';
import { getOfflineQueue, processOfflineQueue } from './lib/offlineStore';
import {
  fetchAllProfiles,
  fetchOrCreateProfile,
  fetchProjects,
  getStoredProjectId,
  storeProjectId
} from './lib/session';
import { User } from '@supabase/supabase-js';

const ROUTES: RouteId[] = ['capture', 'diary', 'digest', 'projects', 'sync'];
const THEME_KEY = 'siteop_theme_v1';

/**
 * Light is the default. This is used outdoors far more often than at a desk,
 * and the dark palette this app shipped with was unreadable in sunlight.
 */
function readStoredTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* blocked storage — fall through to the default */
  }
  return 'light';
}

export function App() {
  const [currentRoute, setCurrentRouteState] = useState<RouteId>(() => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    return (ROUTES as string[]).includes(hash) ? (hash as RouteId) : 'capture';
  });

  const setCurrentRoute = (route: RouteId) => {
    window.location.hash = `#/${route}`;
    setCurrentRouteState(route);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if ((ROUTES as string[]).includes(hash)) setCurrentRouteState(hash as RouteId);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => getStoredProjectId());
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(readStoredTheme);

  // --- Theme ---------------------------------------------------------------
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#122726' : '#faf9f4');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* blocked storage — theme just won't persist */
    }
  }, [theme]);

  // --- Data ----------------------------------------------------------------
  const fetchEntries = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('diary_entries')
        .select(
          `
          *,
          entry_flags (*),
          entry_meta (*),
          entry_photos (*)
        `
        )
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.warn('Supabase fetch entries error:', error);
        return;
      }

      if (data) {
        // entry_meta is 1:1 (entry_id is its primary key) but PostgREST may
        // still hand it back as a single-element array depending on how the
        // relationship is detected -- normalise both shapes.
        const normalised = (data as any[]).map((row) => ({
          ...row,
          entry_meta: Array.isArray(row.entry_meta) ? row.entry_meta[0] ?? null : row.entry_meta ?? null,
          entry_photos: (row.entry_photos || []).sort(
            (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
          )
        })) as DiaryEntry[];

        setEntries(normalised);
      }
    } catch (err) {
      console.warn('Fetch entries exception:', err);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    const list = await fetchProjects();
    setProjects(list);

    // Keep the stored selection only while it is still visible to this user.
    setActiveProjectId((current) => {
      if (current && list.some((p) => p.id === current)) return current;
      const firstActive = list.find((p) => p.is_active) || list[0];
      const next = firstActive?.id ?? null;
      storeProjectId(next);
      return next;
    });
  }, []);

  const loadWorkspace = useCallback(
    async (currentUser: User) => {
      const [me, all] = await Promise.all([
        fetchOrCreateProfile(currentUser.id, currentUser.email),
        fetchAllProfiles()
      ]);
      setProfile(me);
      setProfiles(all);
      await Promise.all([loadProjects(), fetchEntries()]);
    },
    [loadProjects, fetchEntries]
  );

  const updateOfflineCount = () => setOfflineCount(getOfflineQueue().length);

  // --- Auth ----------------------------------------------------------------
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setAuthChecked(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfiles({});
      setProjects([]);
      setEntries([]);
      return;
    }
    loadWorkspace(user);
  }, [user, loadWorkspace]);

  // --- Connectivity --------------------------------------------------------
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processOfflineQueue().then(() => {
        updateOfflineCount();
        fetchEntries();
      });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    updateOfflineCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchEntries]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleSelectProject = (projectId: string | null) => {
    setActiveProjectId(projectId);
    storeProjectId(projectId);
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // --- Render --------------------------------------------------------------
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-paper text-ink flex items-center justify-center">
        <span className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Every record needs an author, and RLS scopes rows by role and project
  // membership -- there is nothing meaningful to show a signed-out visitor.
  if (!user) {
    return <AuthScreen onSuccess={() => setAuthChecked(true)} />;
  }

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <Navbar
        currentRoute={currentRoute}
        onNavigate={setCurrentRoute}
        isOnline={isOnline}
        offlineCount={offlineCount}
        profile={profile}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
      />

      <main className="flex-1 w-full max-w-lg mx-auto pt-2">
        {currentRoute === 'capture' && (
          <CaptureRoute
            isOnline={isOnline}
            activeProject={activeProject}
            profile={profile}
            onEntrySaved={() => {
              updateOfflineCount();
              fetchEntries();
            }}
            onGoToProjects={() => setCurrentRoute('projects')}
          />
        )}

        {currentRoute === 'diary' && (
          <DiaryRoute
            entries={entries}
            profiles={profiles}
            profile={profile}
            userId={user.id}
            projects={projects}
            activeProject={activeProject}
            onRefresh={fetchEntries}
            onNavigateToSync={() => setCurrentRoute('sync')}
          />
        )}

        {currentRoute === 'digest' && <DigestRoute activeProject={activeProject} onRefresh={fetchEntries} />}

        {currentRoute === 'projects' && (
          <ProjectsRoute
            projects={projects}
            profile={profile}
            profiles={profiles}
            activeProject={activeProject}
            onSelectProject={handleSelectProject}
            onProjectsChanged={() => {
              loadProjects();
              if (user) fetchAllProfiles().then(setProfiles);
            }}
            onNavigateToSync={() => setCurrentRoute('sync')}
          />
        )}

        {currentRoute === 'sync' && (
          <SyncRoute entries={entries} profile={profile} onRefresh={fetchEntries} />
        )}
      </main>
    </div>
  );
}

export default App;
