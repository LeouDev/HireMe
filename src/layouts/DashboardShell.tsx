import { LogOut, Menu, Repeat, Shield, X, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Avatar, Logo } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useAuth } from '@/features/auth/AuthProvider';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { supabase } from '@/lib/supabase';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface ShellProps {
  area: 'customer' | 'professional' | 'admin';
  nav: NavItem[];
  /** Number of nav items shown in the mobile bottom bar. */
  mobileItems?: number;
  aside?: ReactNode;
}

export function DashboardShell({ area, nav, mobileItems = 4, aside }: ShellProps) {
  const { profile, pro, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };
  const switchTo =
    area === 'professional'
      ? { to: '/dashboard', label: 'Switch to hiring' }
      : pro
        ? { to: '/pro-dashboard', label: 'Switch to professional' }
        : { to: '/become-a-pro', label: 'Offer your services' };

  const railLink = ({ isActive }: { isActive: boolean }) =>
    `group relative grid size-11 place-items-center rounded-xl transition-colors ${
      isActive ? 'bg-white text-ink-950' : 'text-ink-400 hover:bg-white/8 hover:text-white'
    }`;

  return (
    <div className="dark-surface min-h-dvh bg-ink-950 text-ink-100">
      <Seo title={area === 'admin' ? 'Admin' : 'Dashboard'} noindex />
      <div className="mx-auto flex max-w-[1680px] gap-3 p-0 sm:p-3 lg:gap-4 lg:p-4">
        {/* Icon rail */}
        <nav aria-label="Dashboard" className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-[72px] shrink-0 flex-col items-center rounded-2xl border border-white/5 bg-ink-900 py-5 lg:flex">
          <Link to="/" aria-label="Hire Me! home" className="text-2xl">
            <Logo inverse showWordmark={false} />
          </Link>
          <ul className="mt-8 flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 [scrollbar-width:none]">
            {nav.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={railLink} aria-label={item.label}>
                  <item.icon className="size-[19px]" aria-hidden="true" />
                  <span className="pointer-events-none absolute left-full z-50 ml-3 rounded-md bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ink-950 opacity-0 shadow-pop transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {item.label}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col items-center gap-1.5 border-t border-white/10 pt-4">
            {isAdmin && area !== 'admin' && (
              <NavLink to="/admin" className={railLink} aria-label="Admin">
                <Shield className="size-[19px]" aria-hidden="true" />
                <span className="pointer-events-none absolute left-full ml-3 rounded-md bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ink-950 opacity-0 shadow-pop group-hover:opacity-100">Admin</span>
              </NavLink>
            )}
            <NavLink to={switchTo.to} className={railLink} aria-label={switchTo.label}>
              <Repeat className="size-[19px]" aria-hidden="true" />
              <span className="pointer-events-none absolute left-full ml-3 rounded-md bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ink-950 opacity-0 shadow-pop group-hover:opacity-100">{switchTo.label}</span>
            </NavLink>
            <button type="button" onClick={signOut} className={railLink({ isActive: false })} aria-label="Sign out">
              <LogOut className="size-[19px]" aria-hidden="true" />
              <span className="pointer-events-none absolute left-full ml-3 rounded-md bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ink-950 opacity-0 shadow-pop group-hover:opacity-100">Sign out</span>
            </button>
          </div>
        </nav>

        {/* Main panel */}
        <div className="min-w-0 flex-1 bg-ink-900 sm:rounded-2xl sm:border sm:border-white/5">
          <header className="flex items-center gap-3 px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
            <button type="button" onClick={() => setMenuOpen(true)} className="grid size-10 place-items-center rounded-full bg-white/5 lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <Link to="/" className="text-lg lg:hidden" aria-label="Hire Me! home"><Logo inverse /></Link>
            <p className="hidden text-sm text-ink-400 lg:block">
              {greeting()}, <span className="font-medium text-white">{profile?.full_name?.split(' ')[0] || 'there'}</span>
              <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-ink-300">
                {area === 'professional' ? 'Professional' : area === 'admin' ? 'Administrator' : 'Customer'}
              </span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <Link to={area === 'professional' ? '/pro-dashboard/settings' : '/dashboard/settings'} className="rounded-full" aria-label="Account settings">
                <Avatar name={profile?.full_name} path={profile?.avatar_path} size="md" />
              </Link>
            </div>
          </header>
          <main className="px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-10">
            <Outlet />
          </main>
        </div>

        {aside && <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-[300px] shrink-0 overflow-y-auto rounded-2xl border border-white/5 bg-ink-900 p-4 xl:block">{aside}</aside>}
      </div>

      {/* Mobile bottom bar */}
      <nav aria-label="Dashboard shortcuts" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur lg:hidden">
        <ul className="flex justify-around">
          {nav.slice(0, mobileItems).map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={({ isActive }) => `flex w-16 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] ${isActive ? 'text-white' : 'text-ink-400'}`}>
                <item.icon className="size-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMenuOpen(true)} className="flex w-16 flex-col items-center gap-1 py-1.5 text-[11px] text-ink-400">
              <Menu className="size-5" aria-hidden="true" /> More
            </button>
          </li>
        </ul>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink-950/70" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 flex w-[min(85vw,320px)] flex-col bg-ink-900 p-4">
            <div className="flex items-center justify-between">
              <Logo inverse />
              <button type="button" onClick={() => setMenuOpen(false)} className="grid size-10 place-items-center rounded-full bg-white/5" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <ul className="mt-6 flex-1 space-y-1 overflow-y-auto">
              {nav.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-white text-ink-950' : 'text-ink-300 hover:bg-white/5'}`}>
                    <item.icon className="size-[18px]" aria-hidden="true" /> {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="space-y-1 border-t border-white/10 pt-3 text-sm">
              {isAdmin && area !== 'admin' && <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-ink-300"><Shield className="size-[18px]" /> Admin</Link>}
              <Link to={switchTo.to} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-ink-300"><Repeat className="size-[18px]" /> {switchTo.label}</Link>
              <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-ink-300"><LogOut className="size-[18px]" /> Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}
