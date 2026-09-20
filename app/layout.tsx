import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReproLab — Evidence, not guesswork',
  description: 'Turn a browser failure into private, inspectable evidence.',
  icons: { icon: '/icon.svg' }
};

export const viewport: Viewport = { themeColor: '#202d43' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
