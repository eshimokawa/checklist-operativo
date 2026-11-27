import './globals.css';

export const metadata = {
  title: 'Check List Operativo',
  description: 'Gestión, ejecución y auditoría de check lists operativos multi-sede',
  icons: { icon: '/icon.png' },
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#870064' };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
