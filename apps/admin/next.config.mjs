/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@fullfocus/shared", "@fullfocus/card-renderer"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone"
};

export default nextConfig;
