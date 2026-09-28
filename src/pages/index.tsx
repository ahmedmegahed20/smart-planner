import React, { Suspense, lazy } from 'react';
import type { PageKey } from '../lib/app';
import { Spinner } from '../components/ui/primitives';

/**
 * Pages are code-split.
 *
 * The app has 26 pages, and a person opens 5 of them. Statically importing
 * every page meant the whole bundle — charts, report tables, the AI panel —
 * had to parse before the first paint, which is the most expensive part of
 * startup on the low-end Android hardware this app targets. Each page is
 * fetched on first visit instead; the assets are local (`https://localhost`),
 * so a later page costs a local read rather than a network round-trip.
 *
 * `Dashboard` is loaded eagerly: it is the launch page on both phone and
 * desktop, so splitting it would only add a Suspense flash to first render.
 */
import Dashboard from './Dashboard';
import Tasks from './Tasks';

const Today = lazy(() => import('./Today'));
const DailyProgress = lazy(() => import('./DailyProgress'));
const MonthlyGoals = lazy(() => import('./MonthlyGoals'));
const Habits = lazy(() => import('./Habits'));
const HabitMatrix = lazy(() => import('./HabitMatrix'));
const Goals = lazy(() => import('./Goals'));
const Projects = lazy(() => import('./Projects'));
const Routines = lazy(() => import('./Routines'));
const CalendarPage = lazy(() => import('./CalendarPage'));
const Focus = lazy(() => import('./Focus'));
const Journal = lazy(() => import('./Journal'));
const Mood = lazy(() => import('./Mood'));
const Analytics = lazy(() => import('./Analytics'));
const Achievements = lazy(() => import('./Achievements'));
const Reports = lazy(() => import('./Reports'));
const Notes = lazy(() => import('./Notes'));
const Inbox = lazy(() => import('./Inbox'));
const Notifications = lazy(() => import('./Notifications'));
const SearchPage = lazy(() => import('./SearchPage'));
const AI = lazy(() => import('./AI'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const AppearancePage = lazy(() => import('./AppearancePage'));
const Statistics = lazy(() => import('./Statistics'));
const University = lazy(() => import('./University'));
const Prayer = lazy(() => import('./Prayer'));

export function PageRouter({ page }: { page: PageKey }) {
  return <Suspense fallback={<Spinner />}>{renderPage(page)}</Suspense>;
}

function renderPage(page: PageKey) {
  switch (page) {
    case 'dashboard': return <Dashboard />;
    case 'today': return <Today />;
    case 'daily-progress': return <DailyProgress />;
    case 'monthly-goals': return <MonthlyGoals />;
    case 'tasks': return <Tasks />;
    case 'habits': return <Habits />;
    case 'habit-matrix': return <HabitMatrix />;
    case 'goals': return <Goals />;
    case 'projects': return <Projects />;
    case 'routines': return <Routines />;
    case 'calendar': return <CalendarPage />;
    case 'focus': return <Focus />;
    case 'journal': return <Journal />;
    case 'mood': return <Mood />;
    case 'analytics': return <Analytics />;
    case 'achievements': return <Achievements />;
    case 'reports': return <Reports />;
    case 'notes': return <Notes />;
    case 'inbox': return <Inbox />;
    case 'notifications': return <Notifications />;
    case 'search': return <SearchPage />;
    case 'ai': return <AI />;
    case 'settings': return <SettingsPage />;
    case 'appearance': return <AppearancePage />;
    case 'statistics': return <Statistics />;
    case 'university': return <University />;
    case 'prayer': return <Prayer />;
    default: return <Dashboard />;
  }
}

export default PageRouter;
