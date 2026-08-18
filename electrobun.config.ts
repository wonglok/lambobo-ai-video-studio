import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "LamboboStudio",
    identifier: "com.wonglok.lambobo.studio",
    version: "0.0.1",
  },
  build: {
    // Vite builds to dist/, we copy from there
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      "dist/ffmpeg": "views/mainview/ffmpeg",
      "src/mainview/lambobo.png": "views/mainview/lambobo.png",
      "python-src": "python-src",
      "python-src/images/lambobo.png": "views/mainview/images/lambobo.png",
      "prompt": "prompt",
    },
    // Ignore Vite output in watch mode — HMR handles view rebuilds separately
    watchIgnore: ["dist/**"],
    mac: {
      icons: "icons/lamb-icon.iconset",
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
