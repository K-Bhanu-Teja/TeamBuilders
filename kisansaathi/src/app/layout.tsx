import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KisanSaathi — కిసాన్ సాతి | AI Farming Assistant for Guntur',
  description: 'Live AI decision agent for chilli, cotton and paddy farmers in Guntur, Andhra Pradesh. Real-time weather, soil and mandi price data with Telugu advice.',
  keywords: 'farmer, agriculture, Guntur, chilli, cotton, paddy, Telugu, AI, mandi prices, weather',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="te">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌾</text></svg>" />
      </head>
      <body>{children}</body>
    </html>
  );
}
