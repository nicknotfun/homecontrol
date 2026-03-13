import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HomeControl Layout Planner',
  description: 'Plan multi-floor home layouts and place linked devices.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
