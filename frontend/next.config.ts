import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{source:"/oauth/consent",headers:[
      {key:"Cache-Control",value:"private, no-store"},
      {key:"Referrer-Policy",value:"no-referrer"},
      {key:"X-Frame-Options",value:"DENY"},
      {key:"Content-Security-Policy",value:"frame-ancestors 'none'; base-uri 'self'"},
    ]}];
  },
  // Allow isolated local QA servers without competing for another dev server's lock.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
