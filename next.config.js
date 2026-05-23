/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/onboard',
        destination: '/onboard.html',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
