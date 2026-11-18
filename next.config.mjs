/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Next.js 14 only runs src/instrumentation.ts (ScienceWerx observability) with this flag.
    // Remove it after upgrading to Next.js 15, where instrumentation is always on.
    instrumentationHook: true,
  },
};

export default nextConfig;
