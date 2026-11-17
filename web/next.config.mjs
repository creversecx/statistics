/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Local-only in-process Postgres for development; never bundled.
    serverComponentsExternalPackages: ['@electric-sql/pglite'],
  },
};

export default nextConfig;
