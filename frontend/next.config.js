/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Connect to backend API
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*'
      }
    ];
  }
};

module.exports = nextConfig;
