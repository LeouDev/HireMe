import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration } from 'react-router';
import { PageSpinner } from '@/components/ui';
import { RequireAuth } from '@/features/auth/guards';
import { ScheduleAside } from '@/features/bookings/ScheduleAside';
import { DashboardShell } from '@/layouts/DashboardShell';
import { PublicLayout } from '@/layouts/PublicLayout';
import { NotFoundPage, RouteError } from '@/pages/RouteError';
import { adminNav, customerNav, proNav } from './navigation';

// Each page is its own chunk. Named exports are adapted to React.lazy here.
function page<T extends Record<string, ComponentType>>(loader: () => Promise<T>, name: keyof T) {
  const Component = lazy(async () => ({ default: (await loader())[name] as ComponentType }));
  return (
    <Suspense fallback={<PageSpinner />}>
      <Component />
    </Suspense>
  );
}

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: page(() => import('@/pages/public/HomePage'), 'HomePage') },
          { path: 'explore', element: page(() => import('@/pages/public/ExplorePage'), 'ExplorePage') },
          { path: 'categories', element: page(() => import('@/pages/public/CategoriesPage'), 'CategoriesPage') },
          { path: 'category/:slug', element: page(() => import('@/pages/public/ExplorePage'), 'ExplorePage') },
          { path: 'pro/:slug', element: page(() => import('@/pages/public/ProProfilePage'), 'ProProfilePage') },
          { path: 'pro/:slug/services/:serviceSlug', element: page(() => import('@/pages/public/ServiceDetailPage'), 'ServiceDetailPage') },
          { path: 'pro/:slug/request', element: <RequireAuth>{page(() => import('@/pages/public/RequestQuotePage'), 'RequestQuotePage')}</RequireAuth> },
          { path: 'pro/:slug/book/:serviceSlug', element: <RequireAuth>{page(() => import('@/pages/public/BookServicePage'), 'BookServicePage')}</RequireAuth> },
          { path: 'login', element: page(() => import('@/pages/auth/AuthPages'), 'LoginPage') },
          { path: 'register', element: page(() => import('@/pages/auth/AuthPages'), 'RegisterPage') },
          { path: 'forgot-password', element: page(() => import('@/pages/auth/AuthPages'), 'ForgotPasswordPage') },
          { path: 'reset-password', element: page(() => import('@/pages/auth/AuthPages'), 'ResetPasswordPage') },
          { path: 'become-a-pro', element: page(() => import('@/pages/public/BecomeProPage'), 'BecomeProPage') },
          { path: 'help', element: page(() => import('@/pages/public/InfoPages'), 'HelpPage') },
          { path: 'terms', element: page(() => import('@/pages/public/InfoPages'), 'TermsPage') },
          { path: 'privacy', element: page(() => import('@/pages/public/InfoPages'), 'PrivacyPage') },
          { path: 'payments/return', element: <RequireAuth>{page(() => import('@/pages/shared/PaymentReturnPage'), 'PaymentReturnPage')}</RequireAuth> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },

      // Role-neutral links used in notifications; they resolve to the right dashboard.
      { path: 'notifications', element: <Navigate to="/dashboard/notifications" replace /> },
      { path: 'messages/:id', element: <RequireAuth>{page(() => import('@/pages/shared/Redirects'), 'MessageRedirect')}</RequireAuth> },
      { path: 'bookings/:id', element: <RequireAuth>{page(() => import('@/pages/shared/Redirects'), 'BookingRedirect')}</RequireAuth> },
      { path: 'contracts/:id', element: <RequireAuth>{page(() => import('@/pages/shared/Redirects'), 'ContractRedirect')}</RequireAuth> },

      {
        path: 'dashboard',
        element: (
          <RequireAuth>
            <DashboardShell area="customer" nav={customerNav} aside={<ScheduleAside scope="customer" />} />
          </RequireAuth>
        ),
        children: [
          { index: true, element: page(() => import('@/pages/customer/CustomerOverviewPage'), 'CustomerOverviewPage') },
          { path: 'requests', element: page(() => import('@/pages/shared/RequestsPage'), 'CustomerRequestsPage') },
          { path: 'requests/:id', element: page(() => import('@/pages/shared/RequestDetailPage'), 'CustomerRequestDetailPage') },
          { path: 'messages', element: page(() => import('@/pages/shared/MessagesPage'), 'CustomerMessagesPage') },
          { path: 'messages/:id', element: page(() => import('@/pages/shared/MessagesPage'), 'CustomerMessagesPage') },
          { path: 'quotes', element: page(() => import('@/pages/shared/QuotesPage'), 'CustomerQuotesPage') },
          { path: 'quotes/:id', element: page(() => import('@/pages/shared/QuoteDetailPage'), 'CustomerQuoteDetailPage') },
          { path: 'contracts', element: page(() => import('@/pages/shared/ContractsPage'), 'CustomerContractsPage') },
          { path: 'contracts/:id', element: page(() => import('@/pages/shared/ContractDetailPage'), 'CustomerContractDetailPage') },
          { path: 'bookings', element: page(() => import('@/pages/shared/BookingsPage'), 'CustomerBookingsPage') },
          { path: 'bookings/:id', element: page(() => import('@/pages/shared/BookingDetailPage'), 'CustomerBookingDetailPage') },
          { path: 'payments', element: page(() => import('@/pages/customer/CustomerPages'), 'PaymentsPage') },
          { path: 'favorites', element: page(() => import('@/pages/customer/CustomerPages'), 'FavoritesPage') },
          { path: 'reviews', element: page(() => import('@/pages/customer/CustomerPages'), 'CustomerReviewsPage') },
          { path: 'notifications', element: page(() => import('@/pages/shared/NotificationsPage'), 'NotificationsPage') },
          { path: 'settings', element: page(() => import('@/pages/shared/AccountSettingsPage'), 'AccountSettingsPage') },
        ],
      },

      {
        path: 'pro-dashboard',
        element: (
          <RequireAuth role="professional">
            <DashboardShell area="professional" nav={proNav} aside={<ScheduleAside scope="professional" />} />
          </RequireAuth>
        ),
        children: [
          { index: true, element: page(() => import('@/pages/pro/ProOverviewPage'), 'ProOverviewPage') },
          { path: 'profile', element: page(() => import('@/pages/pro/ProfileEditorPage'), 'ProfileEditorPage') },
          { path: 'services', element: page(() => import('@/pages/pro/ServicesPage'), 'ServicesPage') },
          { path: 'portfolio', element: page(() => import('@/pages/pro/PortfolioPage'), 'PortfolioPage') },
          { path: 'availability', element: page(() => import('@/pages/pro/AvailabilityPage'), 'AvailabilityPage') },
          { path: 'requests', element: page(() => import('@/pages/shared/RequestsPage'), 'ProRequestsPage') },
          { path: 'requests/:id', element: page(() => import('@/pages/shared/RequestDetailPage'), 'ProRequestDetailPage') },
          { path: 'messages', element: page(() => import('@/pages/shared/MessagesPage'), 'ProMessagesPage') },
          { path: 'messages/:id', element: page(() => import('@/pages/shared/MessagesPage'), 'ProMessagesPage') },
          { path: 'quotes', element: page(() => import('@/pages/shared/QuotesPage'), 'ProQuotesPage') },
          { path: 'quotes/:id', element: page(() => import('@/pages/shared/QuoteDetailPage'), 'ProQuoteDetailPage') },
          { path: 'contracts', element: page(() => import('@/pages/shared/ContractsPage'), 'ProContractsPage') },
          { path: 'contracts/:id', element: page(() => import('@/pages/shared/ContractDetailPage'), 'ProContractDetailPage') },
          { path: 'bookings', element: page(() => import('@/pages/shared/BookingsPage'), 'ProBookingsPage') },
          { path: 'bookings/:id', element: page(() => import('@/pages/shared/BookingDetailPage'), 'ProBookingDetailPage') },
          { path: 'customers', element: page(() => import('@/pages/pro/ProPages'), 'CustomersPage') },
          { path: 'reviews', element: page(() => import('@/pages/pro/ProPages'), 'ProReviewsPage') },
          { path: 'verification', element: page(() => import('@/pages/pro/VerificationPage'), 'VerificationPage') },
          { path: 'notifications', element: page(() => import('@/pages/shared/NotificationsPage'), 'NotificationsPage') },
          { path: 'settings', element: page(() => import('@/pages/pro/ProPages'), 'ProSettingsPage') },
        ],
      },

      {
        path: 'admin',
        element: (
          <RequireAuth role="admin">
            <DashboardShell area="admin" nav={adminNav} mobileItems={4} />
          </RequireAuth>
        ),
        children: [
          { index: true, element: page(() => import('@/pages/admin/AdminPages'), 'AdminOverviewPage') },
          { path: 'users', element: page(() => import('@/pages/admin/AdminPages'), 'AdminUsersPage') },
          { path: 'professionals', element: page(() => import('@/pages/admin/AdminPages'), 'AdminProfessionalsPage') },
          { path: 'verifications', element: page(() => import('@/pages/admin/AdminPages'), 'AdminVerificationsPage') },
          { path: 'categories', element: page(() => import('@/pages/admin/AdminPages'), 'AdminCategoriesPage') },
          { path: 'bookings', element: page(() => import('@/pages/admin/AdminPages'), 'AdminBookingsPage') },
          { path: 'payments', element: page(() => import('@/pages/admin/AdminPages'), 'AdminPaymentsPage') },
          { path: 'disputes', element: page(() => import('@/pages/admin/AdminPages'), 'AdminDisputesPage') },
          { path: 'reviews', element: page(() => import('@/pages/admin/AdminPages'), 'AdminReviewsPage') },
          { path: 'reports', element: page(() => import('@/pages/admin/AdminPages'), 'AdminAuditPage') },
          { path: 'settings', element: page(() => import('@/pages/admin/AdminPages'), 'AdminSettingsPage') },
        ],
      },
    ],
  },
]);
