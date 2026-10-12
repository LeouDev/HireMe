import { createClient } from '@supabase/supabase-js';
import type { Database, Tables } from './database.types';
import { env } from './env';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export type { Tables };
export type Profile = Tables<'profiles'>;
export type ProfessionalProfile = Tables<'professional_profiles'>;
export type Service = Tables<'services'>;
export type Category = Tables<'service_categories'>;
export type PortfolioItem = Tables<'portfolio_items'>;
export type ServiceRequest = Tables<'service_requests'>;
export type Quotation = Tables<'quotations'>;
export type QuotationItem = Tables<'quotation_items'>;
export type Contract = Tables<'contracts'>;
export type ContractVersion = Tables<'contract_versions'>;
export type ContractSignature = Tables<'contract_signatures'>;
export type Booking = Tables<'bookings'>;
export type PaymentRecord = Tables<'payment_records'>;
export type Refund = Tables<'refunds'>;
export type Dispute = Tables<'disputes'>;
export type Review = Tables<'reviews'>;
export type Notification = Tables<'notifications'>;
export type Message = Tables<'messages'>;
export type AuditLog = Tables<'audit_logs'>;
export type VerificationSubmission = Tables<'verification_submissions'>;
export type SearchResult = Database['public']['Functions']['search_professionals']['Returns'][number];
export type ConversationSummary = Database['public']['Functions']['my_conversations']['Returns'][number];

/** Throws the Supabase error so TanStack Query can surface it; returns data otherwise (non-null for lists/single). */
export function unwrap<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

/** For `.maybeSingle()` lookups, where "no row" is a valid answer. */
export function unwrapMaybe<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}
