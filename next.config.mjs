/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PGlite e postgres.js rodam no servidor (Node) e não devem ser empacotados.
  experimental: {
    serverComponentsExternalPackages: ["@electric-sql/pglite", "postgres"],
  },
};

export default nextConfig;
