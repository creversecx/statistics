import type { Metadata } from 'next';
import { Unbounded } from 'next/font/google';
import './globals.css';
import { PointerField } from '@/components/ui/PointerField';

/** Display face for the service name only; everything else is Pretendard. */
const display = Unbounded({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Learning Stats · Creverse',
  description: '온라인 학습 수강률·완료율 통계',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={display.variable}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <PointerField />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
        <footer className="relative z-10 border-t border-line px-8 py-4 text-center text-xs text-white/60">
          © {new Date().getFullYear()} Creverse. All rights reserved. · Learning Stats ·{' '}
          <span className="text-white/75">Published by CX Team</span>
        </footer>
      </body>
    </html>
  );
}
