/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [new URL('https://image.tmdb.org/t/p/**')]
  }
};

export default nextConfig;
