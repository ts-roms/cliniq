import './global.css';
import { Source_Sans_3 } from 'next/font/google';
import { Providers } from './providers';

// Source Sans Pro (the modern Source Sans 3) — load ExtraLight (200) for
// large display headings, plus Regular and SemiBold for UI text.
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['200', '400', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  title: 'ClinIQ',
  description: 'The clinic management system with a brain.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
