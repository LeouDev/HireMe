import {
  BadgeCheck, CalendarCheck, CalendarClock, ClipboardList, CreditCard, FileSignature, FileText, Flag, FolderTree, Heart,
  Images, LayoutGrid, MessageSquare, ScrollText, Settings, Star, UserRound, Users, Wrench, Scale, Briefcase,
} from 'lucide-react';
import type { NavItem } from '@/layouts/DashboardShell';

export const customerNav: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/dashboard/requests', label: 'Requests', icon: ClipboardList },
  { to: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
  { to: '/dashboard/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/dashboard/quotes', label: 'Quotes', icon: FileText },
  { to: '/dashboard/contracts', label: 'Contracts', icon: FileSignature },
  { to: '/dashboard/payments', label: 'Payments', icon: CreditCard },
  { to: '/dashboard/favorites', label: 'Saved', icon: Heart },
  { to: '/dashboard/reviews', label: 'Reviews', icon: Star },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export const proNav: NavItem[] = [
  { to: '/pro-dashboard', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/pro-dashboard/requests', label: 'Requests', icon: ClipboardList },
  { to: '/pro-dashboard/messages', label: 'Messages', icon: MessageSquare },
  { to: '/pro-dashboard/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/pro-dashboard/quotes', label: 'Quotes', icon: FileText },
  { to: '/pro-dashboard/contracts', label: 'Contracts', icon: FileSignature },
  { to: '/pro-dashboard/profile', label: 'Public page', icon: UserRound },
  { to: '/pro-dashboard/services', label: 'Services', icon: Wrench },
  { to: '/pro-dashboard/portfolio', label: 'Portfolio', icon: Images },
  { to: '/pro-dashboard/availability', label: 'Availability', icon: CalendarClock },
  { to: '/pro-dashboard/customers', label: 'Customers', icon: Users },
  { to: '/pro-dashboard/reviews', label: 'Reviews', icon: Star },
  { to: '/pro-dashboard/verification', label: 'Verification', icon: BadgeCheck },
  { to: '/pro-dashboard/settings', label: 'Settings', icon: Settings },
];

export const adminNav: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/professionals', label: 'Professionals', icon: Briefcase },
  { to: '/admin/verifications', label: 'Verifications', icon: BadgeCheck },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/disputes', label: 'Disputes', icon: Scale },
  { to: '/admin/reviews', label: 'Reviews & reports', icon: Flag },
  { to: '/admin/reports', label: 'Audit log', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];
