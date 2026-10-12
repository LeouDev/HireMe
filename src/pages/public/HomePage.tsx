import { ArrowRight, BadgeCheck, CalendarDays, FileSignature, Link2, MapPin, MessageSquare, Search, ShieldCheck, Star, Wallet } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, ButtonLink, EmptyState, Logo } from '@/components/ui';
import { Seo } from '@/components/Seo';
import { useCategories, useProfessionalSearch } from '@/features/catalog/api';
import { CategoryIcon } from '@/features/catalog/CategoryIcon';
import { ProCard, ProCardSkeleton } from '@/features/catalog/ProCard';
import { todayManila } from '@/lib/format';

export function HomePage() {
  return (
    <>
      <Seo title="Hire Me! — Find skilled professionals in the Philippines" path="/"
        description="Discover local plumbers, electricians, carpenters and other skilled professionals in Cebu and across the Philippines. Request quotations and book with confidence." />
      <Hero />
      <Categories />
      <Featured />
      <HowItWorks />
      <ForProfessionals />
      <Trust />
      <FinalCta />
    </>
  );
}

const FIELD = 'flex h-12 items-center gap-2.5 rounded-[14px] bg-white/[0.07] px-3.5 ring-1 ring-white/10 ring-inset transition focus-within:bg-white/[0.11] focus-within:ring-white/35';

function Hero() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (city.trim()) params.set('city', city.trim());
    if (date) params.set('date', date);
    navigate(`/explore?${params}`);
  };

  return (
    <section className="px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="glass relative mx-auto max-w-[1400px] overflow-hidden rounded-[32px] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_45%)]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-10 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-ink-300">
              <MapPin className="size-3.5" aria-hidden="true" /> Now serving Cebu and the Philippines
            </p>
            <h1 className="text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl">
              Find the right professional. Get the job done.
            </h1>
            <p className="mt-5 max-w-xl text-base text-ink-300 sm:text-lg">
              From plumbing and electrical work to carpentry and home repairs, discover local professionals, request quotations, and book services with confidence.
            </p>

            <form onSubmit={submit} className="mt-8 grid gap-2 rounded-[22px] bg-white p-2.5 text-ink-900 shadow-pop sm:grid-cols-2" role="search" aria-label="Find professionals">
              <label className={`${FIELD} sm:col-span-2`}>
                <Search className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                <span className="sr-only">Service or skill</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Service or skill" className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-400" />
              </label>
              <label className={FIELD}>
                <MapPin className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                <span className="sr-only">Location</span>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City or area" className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-400" />
              </label>
              <label className={`${FIELD} relative`}>
                <CalendarDays className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                <span className="sr-only">Preferred date</span>
                {/* The native picker icon is stretched invisibly over the field, so tapping anywhere opens it. */}
                <input type="date" value={date} min={todayManila()} onChange={(e) => setDate(e.target.value)}
                  className={`date-field w-full bg-transparent text-[15px] outline-none ${date ? 'text-ink-900' : 'text-ink-400'}`} />
              </label>
              <Button type="submit" size="lg" className="w-full rounded-[14px] sm:col-span-2">Find Professionals</Button>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <ButtonLink to="/become-a-pro" variant="outline-inverse" icon={<ArrowRight className="size-4" />}>Offer Your Services</ButtonLink>
              <span className="text-ink-400">Free to create your professional page.</span>
            </div>
          </div>

          <ProfilePreview />
        </div>
      </div>
    </section>
  );
}

/** Schematic of a professional page. Deliberately generic: it illustrates the product, not a real person. */
function ProfilePreview() {
  return (
    <div className="relative hidden lg:block" aria-hidden="true">
      <div className="rounded-3xl border border-white/10 bg-black/45 p-5 shadow-pop backdrop-blur-xl">
        <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-ink-400">
          <Link2 className="size-3.5" /> hireme.ph/pro/<span className="text-white">your-business</span>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-white text-2xl text-ink-950"><Logo showWordmark={false} /></div>
          <div className="space-y-2">
            <div className="h-3.5 w-40 rounded bg-white/80" />
            <div className="h-2.5 w-28 rounded bg-white/25" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {['Message', 'Request a quote', 'Book'].map((label, i) => (
            <div key={label} className={`rounded-lg py-2 text-center text-xs font-medium ${i === 1 ? 'bg-[#fff] text-[#0e1218]' : 'bg-white/5 text-ink-300'}`}>{label}</div>
          ))}
        </div>
        <div className="mt-5 space-y-2">
          {['Faucet installation', 'Leak repair', 'Water heater service'].map((s, i) => (
            <div key={s} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-3">
              <span className="text-sm text-ink-200">{s}</span>
              <span className="text-xs text-ink-400">{i === 1 ? 'Quote required' : 'Your price'}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] rounded-lg bg-white/[0.06]" />)}
        </div>
      </div>
      <div className="absolute -bottom-5 -left-6 rounded-xl bg-white px-4 py-3 text-ink-950 shadow-pop">
        <p className="text-xs text-ink-500">Quotation</p>
        <p className="font-display text-sm font-semibold">Sent · awaiting customer</p>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-2 text-[13px] font-medium tracking-wide text-ink-400 uppercase">{eyebrow}</p>}
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 text-ink-300">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function Categories() {
  const { data, isPending } = useCategories();
  return (
    <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
      <SectionHeading eyebrow="Popular categories" title="What do you need done?"
        action={<Link to="/categories" className="inline-flex items-center gap-1 text-sm font-medium text-white hover:underline">All categories <ArrowRight className="size-4" /></Link>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {isPending && Array.from({ length: 10 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/10" />)}
        {data?.slice(0, 10).map((c) => (
          <Link key={c.id} to={`/category/${c.slug}`} className="group flex flex-col justify-between gap-6 rounded-2xl bg-white p-4 shadow-card transition-transform hover:-translate-y-0.5">
            <span className="grid size-10 place-items-center rounded-lg bg-ink-100 text-ink-900 transition-colors group-hover:bg-[#fff] group-hover:text-[#0e1218]">
              <CategoryIcon name={c.icon} />
            </span>
            <span className="font-medium text-ink-900">{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Featured() {
  const { data, isPending, isError } = useProfessionalSearch({ sort: 'rating', pageSize: 8 });
  return (
    <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
      <SectionHeading eyebrow="Professionals" title="Featured professionals"
        description="Published professionals on Hire Me!. Ratings come only from customers with completed bookings."
        action={<ButtonLink to="/explore" variant="outline-inverse">Explore all</ButtonLink>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isPending && Array.from({ length: 4 }, (_, i) => <ProCardSkeleton key={i} />)}
        {data?.rows.map((p) => <ProCard key={p.id} pro={p} />)}
      </div>
      {!isPending && (isError || !data?.rows.length) && (
        <div className="card">
          <EmptyState title="Professionals are setting up their pages" description="Be one of the first skilled professionals in your city on Hire Me!."
            action={<ButtonLink to="/become-a-pro">Create your professional page</ButtonLink>} />
        </div>
      )}
    </section>
  );
}

function HowItWorks() {
  const customer = ['Find a professional.', 'Explain your project.', 'Receive a quotation.', 'Agree on the terms.', 'Book your service.'];
  const pro = ['Create your profile.', 'List your services.', 'Receive customer inquiries.', 'Send quotations and contracts.', 'Manage your bookings.'];
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
      {/* Anchor sits on the heading (not the padded section) so the jump lands just below the floating header. */}
      <span id="how-it-works" className="block scroll-mt-24" aria-hidden="true" />
      <SectionHeading eyebrow="How it works" title="One place from first message to finished job" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Steps title="For customers" steps={customer} cta={<ButtonLink to="/explore">Find professionals</ButtonLink>} />
        <Steps title="For professionals" steps={pro} dark cta={<ButtonLink to="/become-a-pro" variant="inverse">Create your page</ButtonLink>} />
      </div>
    </section>
  );
}

function Steps({ title, steps, cta, dark }: { title: string; steps: string[]; cta: ReactNode; dark?: boolean }) {
  return (
    <div className={`rounded-[28px] p-6 sm:p-8 ${dark ? 'glass text-white' : 'bg-white text-ink-950 shadow-card'}`}>
      <h3 className="text-xl font-semibold">{title}</h3>
      <ol className="mt-6 space-y-4">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-4">
            <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${dark ? 'bg-[#fff] text-[#0e1218]' : 'bg-ink-950 text-white'}`}>{i + 1}</span>
            <span className={dark ? 'text-ink-200' : 'text-ink-700'}>{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-8">{cta}</div>
    </div>
  );
}

function ForProfessionals() {
  const benefits = [
    { icon: Link2, title: 'A page you can share anywhere', body: 'Your own link for Facebook, Messenger, WhatsApp, email and business cards.' },
    { icon: MessageSquare, title: 'Inquiries in one inbox', body: 'Customers explain the job and send photos. Reply, ask questions and keep the history.' },
    { icon: FileSignature, title: 'Quotations and contracts', body: 'Itemized quotes with labor and materials, then a contract both sides sign online.' },
    { icon: CalendarDays, title: 'Bookings and availability', body: 'Set your hours, block days off and keep upcoming jobs in one calendar.' },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
      <div className="grid gap-10 rounded-[28px] bg-white p-6 shadow-card sm:p-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="mb-2 text-[13px] font-medium tracking-wide text-ink-500 uppercase">For professionals</p>
          <h2 className="text-2xl font-semibold text-ink-950 sm:text-3xl">Your skills deserve more than a Facebook post.</h2>
          <p className="mt-4 text-ink-600">
            Build your professional page, get customers, send quotations and manage your business online — including for customers you already have.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink to="/become-a-pro" size="lg">Create your free page</ButtonLink>
            <ButtonLink to="/become-a-pro#plans" variant="secondary" size="lg">See plans</ButtonLink>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {benefits.map((b) => (
            <div key={b.title} className="rounded-xl bg-ink-50 p-5">
              <b.icon className="size-5 text-ink-900" aria-hidden="true" />
              <h3 className="mt-3 font-display font-semibold text-ink-950">{b.title}</h3>
              <p className="mt-1 text-sm text-ink-600">{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const items = [
    { icon: BadgeCheck, title: 'Verification you can read', body: 'Professionals can submit identity, business, qualification and license documents. Our team reviews each one, and profiles show exactly what was verified — identity checks are not presented as proof of skill.' },
    { icon: Star, title: 'Reviews from real bookings', body: 'Only customers whose booking was marked completed can leave a review, once per booking. Ratings are calculated from those reviews.' },
    { icon: FileSignature, title: 'Agreements on record', body: 'Accepted quotations are frozen. Both parties sign the same contract version, and every signature is recorded with a timestamp.' },
    { icon: Wallet, title: 'Payments confirmed by the processor', body: 'Online payments are handled by PayMongo. A booking is only marked paid after the payment is verified on our server — never from a browser redirect.' },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
      <SectionHeading eyebrow="Trust" title="How we keep things clear" description="We don't promise what we can't back up. Here is what actually happens on the platform." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((i) => (
          <div key={i.title} className="rounded-2xl bg-white p-5 shadow-card">
            <i.icon className="size-5 text-ink-900" aria-hidden="true" />
            <h3 className="mt-3 font-display font-semibold text-ink-950">{i.title}</h3>
            <p className="mt-2 text-sm text-ink-600">{i.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-2 text-[13px] text-ink-400">
        <ShieldCheck className="size-4" aria-hidden="true" /> Professionals are independent and responsible for their own work, licenses and pricing.
      </p>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
      <div className="glass flex flex-col items-start justify-between gap-6 rounded-[32px] p-8 text-white sm:flex-row sm:items-center sm:p-12">
        <div>
          <h2 className="text-2xl font-semibold sm:text-3xl">Find skilled professionals. Get a quote. Book with confidence.</h2>
          <p className="mt-2 text-ink-300">Start with a search, or set up your professional page in minutes.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/explore" size="lg">Find Professionals</ButtonLink>
          <ButtonLink to="/register" variant="outline-inverse" size="lg">Get Started</ButtonLink>
        </div>
      </div>
    </section>
  );
}
