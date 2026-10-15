import {
  LayoutDashboard,
  CalendarCheck,
  DoorOpen,
  ConciergeBell,
  BedDouble,
  Sparkles,
  Users,
  UserCog,
  Luggage,
  Boxes,
  Truck,
  UtensilsCrossed,
  Wallet,
  BarChart3,
  Settings,
  CalendarRange,
  Package,
  ShoppingBag,
  Wrench,
  CalendarClock,
  Star,
  Bell,
} from 'lucide-react';

export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' }],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Front Desk', href: '/dashboard/frontdesk', icon: ConciergeBell, module: 'frontdesk', badge: 'frontdesk' },
      { label: 'Bookings', href: '/dashboard/bookings', icon: CalendarCheck, module: 'bookings' },
      { label: 'Availability', href: '/dashboard/availability', icon: CalendarRange, module: 'rooms' },
      { label: 'Rooms', href: '/dashboard/rooms', icon: BedDouble, module: 'rooms' },
      { label: 'Housekeeping', href: '/dashboard/housekeeping', icon: Sparkles, module: 'housekeeping' },
      { label: 'Maintenance', href: '/dashboard/maintenance', icon: Wrench, module: 'maintenance' },
      { label: 'Guests', href: '/dashboard/guests', icon: Users, module: 'guests' },
      { label: 'Found & Lost', href: '/dashboard/found-lost', icon: Luggage, module: 'found_lost' },
      { label: 'Events', href: '/dashboard/events', icon: CalendarClock, module: 'events' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { label: 'Restaurant & POS', href: '/dashboard/restaurant', icon: UtensilsCrossed, module: 'restaurant' },
      { label: 'Sales', href: '/dashboard/sales', icon: ShoppingBag, module: 'sales' },
      { label: 'Inventory', href: '/dashboard/inventory', icon: Boxes, module: 'inventory' },
      { label: 'Purchases', href: '/dashboard/purchases', icon: Truck, module: 'purchases' },
    ],
  },
  {
    label: 'Back Office',
    items: [
      { label: 'Accounts', href: '/dashboard/accounts', icon: Wallet, module: 'accounts' },
      { label: 'Staff & HR', href: '/dashboard/staff', icon: UserCog, module: 'staff' },
      { label: 'Reports', href: '/dashboard/reports', icon: BarChart3, module: 'reports' },
      { label: 'Reviews', href: '/dashboard/reviews', icon: Star, module: 'reviews' },
      { label: 'Settings', href: '/dashboard/settings', icon: Settings, module: 'settings' },
    ],
  },
];

export const SUPER_NAV = [
  { label: 'Overview', href: '/superadmin', icon: LayoutDashboard },
  { label: 'Hotels', href: '/superadmin/hotels', icon: Package },
  { label: 'Plans & Billing', href: '/superadmin/plans', icon: Wallet },
  { label: 'Support', href: '/superadmin/support', icon: ConciergeBell },
  { label: 'Platform Logs', href: '/superadmin/logs', icon: BarChart3 },
];

export const MODULE_HOME = {
  dashboard: '/dashboard',
  frontdesk: '/dashboard/frontdesk',
  bookings: '/dashboard/bookings',
  rooms: '/dashboard/availability',
  housekeeping: '/dashboard/housekeeping',
  maintenance: '/dashboard/maintenance',
  guests: '/dashboard/guests',
  found_lost: '/dashboard/found-lost',
  events: '/dashboard/events',
  restaurant: '/dashboard/restaurant',
  pos: '/dashboard/restaurant',
  sales: '/dashboard/sales',
  inventory: '/dashboard/inventory',
  purchases: '/dashboard/purchases',
  accounts: '/dashboard/accounts',
  staff: '/dashboard/staff',
  reports: '/dashboard/reports',
  reviews: '/dashboard/reviews',
  settings: '/dashboard/settings',
  notifications: '/dashboard',
  ai: '/dashboard',
};

export { Bell };
