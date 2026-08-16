/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Cloudflare R2 public bucket domain — set once provisioned
      // { protocol: "https", hostname: "<your-bucket>.r2.dev" },
    ],
  },
};

export default nextConfig;
