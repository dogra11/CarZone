/**
 * pages/admin/AdminDashboard.jsx - Admin panel (/admin/*).
 *
 * ROLE-BASED ACCESS is enforced three times: <ProtectedRoute role="admin"> in App.jsx,
 * the server refuses to serve /admin pages to non-admins (adminPageGuard), and every
 * /api/admin request checks the role again. The URL picks the section component.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from '../../router/index.jsx';
import { api } from '../../services/api.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import AppShell from '../../components/AppShell.jsx';
import Icon from '../../components/Icon.jsx';
import Overview from './Overview.jsx';
import { Bookings, Slots, Services, Addons } from './WashSections.jsx';
import { Products, Categories, Orders } from './StoreSections.jsx';
import { Offers, Payments, Refunds, Reports } from './FinanceSections.jsx';
import { Users, Reviews, Messages } from './PeopleSections.jsx';

const ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'bookings', label: 'Bookings', icon: 'calendar', group: 'Car wash' },
  { id: 'slots', label: 'Time slots', icon: 'clock', group: 'Car wash' },
  { id: 'services', label: 'Services & prices', icon: 'sparkles', group: 'Car wash' },
  { id: 'addons', label: 'Add-ons', icon: 'layers', group: 'Car wash' },
  { id: 'orders', label: 'Orders', icon: 'package', group: 'Store' },
  { id: 'products', label: 'Products & stock', icon: 'store', group: 'Store' },
  { id: 'categories', label: 'Categories', icon: 'grid', group: 'Store' },
  { id: 'offers', label: 'Offers & coupons', icon: 'tag', group: 'Marketing' },
  { id: 'reviews', label: 'Reviews', icon: 'star', group: 'Marketing' },
  { id: 'payments', label: 'Payments', icon: 'credit-card', group: 'Finance' },
  { id: 'refunds', label: 'Refunds', icon: 'refresh', group: 'Finance' },
  { id: 'reports', label: 'Reports', icon: 'file-text', group: 'Finance' },
  { id: 'users', label: 'Users', icon: 'users', group: 'People' },
  { id: 'messages', label: 'Messages', icon: 'mail', group: 'People' },
];

const SECTIONS = { overview: Overview, bookings: Bookings, slots: Slots, services: Services, addons: Addons, orders: Orders, products: Products, categories: Categories, offers: Offers, reviews: Reviews, payments: Payments, refunds: Refunds, reports: Reports, users: Users, messages: Messages };

export default function AdminDashboard() {
  const params = useParams();
  const section = SECTIONS[params['*']] ? params['*'] : 'overview';
  const [counts, setCounts] = useState({});
  useDocumentTitle(`${ITEMS.find((i) => i.id === section).label} - CarZone Admin`);

  /** Sidebar badges: work waiting for the admin. */
  const refreshCounts = useCallback(async () => {
    try {
      const { totals: t } = await api.get('/api/admin/analytics');
      setCounts({
        bookings: t.pendingPayment + t.inProgress, orders: t.ordersToShip + t.returnRequests, products: t.lowStockCount,
        refunds: t.pendingRefunds, reviews: t.pendingReviews + t.pendingProductReviews, messages: t.newMessages,
      });
    } catch { /* counters are optional */ }
  }, []);
  useEffect(() => { refreshCounts(); }, [refreshCounts, section]);

  const Section = SECTIONS[section];
  return (
    <AppShell base="/admin" items={ITEMS} active={section} roleLabel="Administrator" counts={counts}
      topActions={<a className="btn btn-ghost btn-sm" href="/shop" target="_blank" rel="noopener noreferrer"><Icon name="external" size="sm" /><span>View shop</span></a>}>
      <Section refreshCounts={refreshCounts} />
    </AppShell>
  );
}
