// Human labels and visual tones for every workflow status. Tones map to Badge styles.
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'dark';

type StatusMap = Record<string, [label: string, tone: Tone]>;

const maps = {
  request: {
    draft: ['Draft', 'neutral'], submitted: ['Submitted', 'info'], viewed: ['Viewed', 'info'],
    awaiting_info: ['Needs info', 'warning'], accepted: ['Accepted', 'success'], declined: ['Declined', 'danger'],
    quoted: ['Quoted', 'dark'], cancelled: ['Cancelled', 'neutral'], expired: ['Expired', 'neutral'],
  },
  quote: {
    draft: ['Draft', 'neutral'], sent: ['Sent', 'info'], viewed: ['Viewed', 'info'],
    revision_requested: ['Revision requested', 'warning'], accepted: ['Accepted', 'success'], rejected: ['Rejected', 'danger'],
    expired: ['Expired', 'neutral'], withdrawn: ['Withdrawn', 'neutral'], superseded: ['Superseded', 'neutral'],
  },
  contract: {
    pending_signatures: ['Awaiting signatures', 'warning'], partially_signed: ['Partially signed', 'info'],
    signed: ['Signed', 'success'], void: ['Void', 'neutral'],
  },
  booking: {
    requested: ['Requested', 'info'], awaiting_professional: ['Awaiting professional', 'warning'],
    awaiting_quote: ['Awaiting quote', 'warning'], awaiting_customer_acceptance: ['Awaiting acceptance', 'warning'],
    awaiting_contract: ['Awaiting contract', 'warning'], awaiting_payment: ['Awaiting payment', 'warning'],
    confirmed: ['Confirmed', 'success'], in_progress: ['In progress', 'dark'], completed: ['Completed', 'success'],
    cancellation_requested: ['Cancellation requested', 'warning'], cancelled: ['Cancelled', 'neutral'],
    disputed: ['Disputed', 'danger'], expired: ['Expired', 'neutral'],
  },
  payment: {
    not_required: ['No online payment', 'neutral'], unpaid: ['Unpaid', 'neutral'], pending: ['Payment pending', 'info'],
    deposit_paid: ['Deposit paid', 'success'], paid: ['Paid', 'success'], failed: ['Payment failed', 'danger'],
    partially_refunded: ['Partially refunded', 'info'], refunded: ['Refunded', 'info'],
    expired: ['Expired', 'neutral'], cancelled: ['Cancelled', 'neutral'],
  },
  refund: {
    pending_review: ['Pending review', 'warning'], approved: ['Approved', 'info'], processing: ['Processing', 'info'],
    succeeded: ['Refunded', 'success'], failed: ['Failed', 'danger'], rejected: ['Rejected', 'neutral'],
  },
  dispute: {
    open: ['Open', 'danger'], under_review: ['Under review', 'warning'], resolved: ['Resolved', 'success'], dismissed: ['Dismissed', 'neutral'],
  },
  verification: {
    unverified: ['Unverified', 'neutral'], pending: ['Pending review', 'warning'], verified: ['Verified', 'success'],
    rejected: ['Not approved', 'danger'], suspended: ['Suspended', 'danger'], approved: ['Approved', 'success'],
  },
  profile: { draft: ['Draft', 'neutral'], published: ['Published', 'success'], suspended: ['Suspended', 'danger'] },
  service: { draft: ['Draft', 'neutral'], active: ['Active', 'success'], inactive: ['Inactive', 'neutral'], archived: ['Archived', 'neutral'] },
  report: { open: ['Open', 'warning'], resolved: ['Resolved', 'success'], dismissed: ['Dismissed', 'neutral'] },
  review: { published: ['Published', 'success'], hidden: ['Hidden', 'neutral'] },
} satisfies Record<string, StatusMap>;

export type StatusDomain = keyof typeof maps;

export function statusInfo(domain: StatusDomain, status: string | null | undefined): [string, Tone] {
  const map: StatusMap = maps[domain];
  return (status && map[status]) || [status ? status.replace(/_/g, ' ') : '—', 'neutral'];
}

export const PRICING_LABELS: Record<string, string> = {
  fixed: 'Fixed price', starting: 'Starting price', hourly: 'Hourly rate', quote: 'Custom quotation',
};
export const VERIFICATION_KIND_LABELS: Record<string, string> = {
  identity: 'Identity', business: 'Business', qualification: 'Qualification', license: 'License',
};
