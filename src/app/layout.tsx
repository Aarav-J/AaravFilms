import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'The Film Room — A personal cinema journal', description: 'A little room full of films, memories, and thoughts.', icons: { icon: '/favicon.png', apple: '/favicon.png' } };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html> }
