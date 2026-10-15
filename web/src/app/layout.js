import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata = {
  title: {
    default: 'HotelHub — Hotel Management, Reimagined',
    template: '%s · HotelHub',
  },
  description:
    'HotelHub is the all-in-one SaaS platform for hotels: bookings, front desk, restaurant POS, inventory, accounts and an AI concierge — for one property or a hundred.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
