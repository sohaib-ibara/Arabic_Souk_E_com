import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Real product photography is served from Unsplash. Supabase Storage is
    // allowed too, for when product images are uploaded to your own bucket.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
