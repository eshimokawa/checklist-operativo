/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Librerías Node que leen archivos propios en tiempo de ejecución (fuentes AFM, plantillas)
    serverComponentsExternalPackages: ['pdfkit', 'exceljs', '@sendgrid/mail'],
    serverActions: { bodySizeLimit: '10mb' },
  },
};
export default nextConfig;
