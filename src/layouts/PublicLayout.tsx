import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Avatar, ButtonLink, Logo } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';

const links = [
  { to: '/explore', label: 'Explore Professionals' },
  { to: '/categories', label: 'Categories' },
  { to: '/#how-it-works', label: 'How It Works' },
  { to: '/become-a-pro', label: 'Become a Professional' },
];

export function PublicLayout() {
  const { user, profile, pro } = useAuth();
  const location = useLocation();
  // The menu belongs to the page it was opened on, so it closes itself on navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === location.pathname;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenOn((typeof next === 'function' ? next(open) : next) ? location.pathname : null);
  const dashboard = pro ? '/pro-dashboard' : '/dashboard';

  // In-page links such as /#how-it-works: pages load lazily, so wait for the target to exist, then glide to it.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    let frame = 0;
    let tries = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const seek = () => {
      const target = document.getElementById(id);
      if (!target) {
        if (tries++ < 90) frame = requestAnimationFrame(seek);
        return;
      }
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      // Sections above may still be loading and shift the layout; correct once after they settle.
      settle = setTimeout(() => {
        const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        if (Math.abs(target.getBoundingClientRect().top - margin) > 12) target.scrollIntoView({ block: 'start' });
      }, 900);
    };
    frame = requestAnimationFrame(seek);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [location.key, location.hash]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-3 z-40 mx-3 mt-3 sm:mx-4">
        <div className="glass-strong mx-auto flex h-14 max-w-[1400px] items-center gap-6 rounded-2xl px-4 sm:px-5">
          <Link to="/" aria-label="Hire Me! home" onClick={() => setOpen(false)}>
            <Logo inverse />
          </Link>
          <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm transition-colors ${isActive && !l.to.includes('#') ? 'bg-white/10 text-white' : 'text-ink-300 hover:text-white'}`}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 lg:flex">
            {user ? (
              <Link to={dashboard} className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-white hover:bg-white/10">
                <Avatar name={profile?.full_name} path={profile?.avatar_path} size="sm" /> Dashboard
              </Link>
            ) : (
              <>
                <ButtonLink to="/login" variant="outline-inverse" className="border-transparent" state={{ from: location.pathname }}>Log in</ButtonLink>
                <ButtonLink to="/register">Get Started</ButtonLink>
              </>
            )}
          </div>
          <button type="button" className="ml-auto rounded-md p-2 text-white lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" className="glass-strong mt-2 rounded-2xl px-3 pt-2 pb-3 lg:hidden" aria-label="Mobile">
            {links.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-[15px] text-ink-100 hover:bg-white/10">
                {l.label}
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {user ? (
                <ButtonLink to={dashboard} onClick={() => setOpen(false)} className="col-span-2">Go to dashboard</ButtonLink>
              ) : (
                <>
                  <ButtonLink to="/login" variant="outline-inverse" onClick={() => setOpen(false)}>Log in</ButtonLink>
                  <ButtonLink to="/register" onClick={() => setOpen(false)}>Get Started</ButtonLink>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="glass mx-3 mt-20 mb-3 rounded-[28px] text-ink-300 sm:mx-4">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-4">
          <div>
            <Logo inverse />
            <p className="mt-4 max-w-xs text-sm text-ink-400">
              Find skilled professionals. Get a quote. Book with confidence. Built for the Philippines, starting in Cebu.
            </p>
          </div>
          <FooterColumn title="For customers" links={[['Explore professionals', '/explore'], ['Categories', '/categories'], ['How it works', '/#how-it-works']]} />
          <FooterColumn title="For professionals" links={[['Create your page', '/become-a-pro'], ['Plans', '/become-a-pro#plans'], ['Professional dashboard', '/pro-dashboard']]} />
          <FooterColumn title="Support" links={[['Help center', '/help'], ['Terms of service', '/terms'], ['Privacy policy', '/privacy']]} />
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-7xl px-5 py-5 text-xs text-ink-400 sm:px-8">
            © {new Date().getFullYear()} Hire Me!. Prices shown in Philippine pesos (PHP). Professionals are independent and set their own prices.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([label, to]) => (
          <li key={to}>
            <Link to={to} className="text-ink-400 hover:text-white">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
