import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "BunMediaStudio",
    identifier: "com.wonglok.bun-media",
    version: "0.0.1",
  },
  build: {
    // Vite builds to dist/, we copy from there
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      "python-src": "python-src",
      "python-src/images/lambobo.png": "views/mainview/images/lambobo.png",
    },
    // Ignore Vite output in watch mode — HMR handles view rebuilds separately
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig;
