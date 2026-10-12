import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui';
import { Seo } from '@/components/Seo';

function Doc({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold text-white">{title}</h1>
      {updated && <p className="mt-2 text-sm text-ink-400">Last updated {updated}</p>}
      <div className="card mt-8 space-y-8 rounded-2xl p-6 text-[15px] leading-relaxed text-ink-700 sm:p-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink-950 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </div>
  );
}

const faqs: [string, ReactNode][] = [
  ['How do I hire a professional?', <>Search on <Link to="/explore" className="underline">Explore</Link>, open a professional's page and choose <em>Request a Quote</em> (or <em>Book</em> for fixed-price services that allow instant booking). Describe the job and add photos. The professional replies in your messages.</>],
  ['How does a quotation become a booking?', 'When you accept a quotation, it is frozen and a contract is generated from it. After both of you sign the same contract version, the booking either becomes confirmed or asks for the agreed deposit.'],
  ['How do payments work?', 'Online payments are processed by PayMongo. We mark a booking paid only after PayMongo confirms the payment to our server. Any balance not collected online is paid as agreed in your contract.'],
  ['Can I cancel?', 'Unpaid bookings can be cancelled right away. Confirmed bookings need the other party to approve the cancellation. Refunds are reviewed by our team and depend on how the payment was made — cancelling does not automatically refund.'],
  ['What does "ID verified" mean?', 'The professional submitted identity documents that our team reviewed. It confirms identity only. Business, qualification and license verification are shown separately when approved.'],
  ['Who can leave reviews?', 'Only customers whose booking was marked completed, once per booking.'],
  ['How do I offer my services?', <>Go to <Link to="/become-a-pro" className="underline">Become a Professional</Link>. The same account can hire and offer services.</>],
  ['Something went wrong with a job.', 'Open the booking and choose "Report a problem" to start a dispute. Our administrators review disputes and record every decision.'],
];

export function HelpPage() {
  return (
    <Doc title="Help center">
      <Seo title="Help center" path="/help" description="Answers about requests, quotations, contracts, bookings, payments and verification on Hire Me!." />
      <div className="divide-y divide-ink-200 rounded-xl border border-ink-200/70">
        {faqs.map(([q, a]) => (
          <details key={q} className="p-5">
            <summary className="cursor-pointer font-medium text-ink-950">{q}</summary>
            <div className="mt-2 text-sm text-ink-600">{a}</div>
          </details>
        ))}
      </div>
      <section>
        <h2>Contact support</h2>
        <p>Signed in? Message us from your dashboard notifications, or email the support address listed in your account emails. (A dedicated support inbox will be published before launch.)</p>
      </section>
    </Doc>
  );
}

export function TermsPage() {
  return (
    <Doc title="Terms of Service" updated="October 2026">
      <Seo title="Terms of Service" path="/terms" />
      <Alert tone="warning" title="Draft — pending legal review">
        These terms are a working draft prepared for product development. They have not been reviewed by a lawyer and must be finalized by counsel licensed in the Philippines before public launch.
      </Alert>
      <section><h2>1. The platform</h2><p>Hire Me! connects customers with independent skilled professionals and provides tools for messaging, quotations, contracts, scheduling and payment tracking. Hire Me! is not a party to agreements between customers and professionals and does not perform the services listed.</p></section>
      <section><h2>2. Accounts</h2><ul><li>You must provide accurate information and keep your login secure.</li><li>One account may be used both to hire and to offer services.</li><li>We may suspend accounts that violate these terms or applicable law.</li></ul></section>
      <section><h2>3. Professionals</h2><ul><li>Professionals set their own prices and are responsible for their work, permits, licenses, taxes and insurance.</li><li>Verification badges reflect only the documents our team reviewed and approved.</li></ul></section>
      <section><h2>4. Quotations, contracts and bookings</h2><ul><li>An accepted quotation is fixed; changes require a revision or a new agreement.</li><li>Contracts are formed when both parties accept the same contract version through the platform. Typed-name acceptance is recorded with a timestamp and document fingerprint; whether it satisfies a particular legal requirement depends on the circumstances and applicable law, including the Electronic Commerce Act (RA 8792).</li></ul></section>
      <section><h2>5. Payments, cancellations and refunds</h2><ul><li>Online payments are processed by PayMongo. We do not store card details.</li><li>Cancellation of a confirmed booking requires the other party's approval or an administrator decision.</li><li>Refunds are reviewed case by case and are not automatic. We do not offer escrow or buyer protection.</li></ul></section>
      <section><h2>6. Reviews and content</h2><p>Reviews must be honest and relate to a completed booking. We may hide content that violates these terms.</p></section>
      <section><h2>7. Disputes</h2><p>Parties should first try to resolve disputes in good faith. Our administrators may review disputes raised on the platform; this does not limit remedies available under Philippine law.</p></section>
    </Doc>
  );
}

export function PrivacyPage() {
  return (
    <Doc title="Privacy Policy" updated="October 2026">
      <Seo title="Privacy Policy" path="/privacy" />
      <Alert tone="warning" title="Draft — pending legal review">
        This policy describes how the software handles data today. It is intended to support compliance with the Data Privacy Act of 2012 (RA 10173) but has not yet been reviewed by counsel or a Data Protection Officer.
      </Alert>
      <section><h2>What we collect</h2><ul><li>Account: name, email, password (hashed by our authentication provider).</li><li>Professional pages: the details you choose to publish, including optional public contact details.</li><li>Jobs: requests, messages, attachments, quotations, contracts and bookings between you and the other party.</li><li>Verification: documents professionals submit for review.</li><li>Payments: payment status and references from PayMongo. We never receive or store full card numbers.</li></ul></section>
      <section><h2>Who can see it</h2><ul><li>Published professional pages are public.</li><li>Requests, messages, attachments, contracts and bookings are visible only to the customer and professional involved, and to administrators where needed to resolve disputes or payments (administrators cannot read messages).</li><li>Verification documents are private to the professional and administrators, accessed through time-limited links.</li></ul></section>
      <section><h2>Retention</h2><p>Contracts, signatures, payment and audit records are kept as long as needed for legal and accounting purposes. Verification documents are kept while the professional account is active and are deleted on request where law allows. Final retention periods will be set during legal review.</p></section>
      <section><h2>Your rights</h2><p>You may request access to, correction of, or deletion of your personal data, subject to records we must keep by law. Contact support to make a request.</p></section>
    </Doc>
  );
}
