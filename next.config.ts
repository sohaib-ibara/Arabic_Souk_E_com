import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /*
      Every host a product image may come from.

      next/image REFUSES an unlisted host, and it throws while rendering — so a
      single product from a new supplier takes down the whole category page,
      not just its own card. That is exactly what happened the first time Cult
      Beauty products were listed: their images are on THG's CDN, and
      /category/bath-body returned "Something went wrong".

      ⚠ ADDING A VENDOR? Check where its images are served from and add the
      host here BEFORE listing any of its products. `select images from
      products where source = '<key>' limit 1` answers it in one query.
    */
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      // noon.
      { protocol: "https", hostname: "*.nooncdn.com" },
      // Cult Beauty, which is a THG brand and serves from both of these.
      { protocol: "https", hostname: "*.thcdn.com" },
      { protocol: "https", hostname: "*.thgimages.com" },
    ],
  },
};

export default nextConfig;
