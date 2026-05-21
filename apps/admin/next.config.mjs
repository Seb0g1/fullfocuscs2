/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@fullfocus/shared", "@fullfocus/card-renderer"],
  output: "standalone"
};

export default nextConfig;
