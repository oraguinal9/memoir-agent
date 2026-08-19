/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 独立输出模式：Docker 镜像更小，部署更干净
  output: "standalone",
};

export default nextConfig;
