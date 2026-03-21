import "./globals.css";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'hlbw-ai-hub',
  description: 'Master Control Plane for AI orchestrations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
