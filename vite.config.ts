// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig as lovableDefineConfig } from "@lovable.dev/vite-tanstack-config";
import { defineConfig as viteDefineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// BUILD_TARGET=node → Hostinger Node.js server
// sem variável  → Lovable Cloud (Cloudflare Workers, padrão)
const isNode = process.env.BUILD_TARGET === "node";

export default isNode
  ? viteDefineConfig({
      plugins: [
        tsConfigPaths(),
        tailwindcss(),
        tanstackStart({ target: "node-server", router: { autoCodeSplitting: true } }),
        viteReact(),
      ],
      resolve: {
        dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
      },
    })
  : lovableDefineConfig({ tanstackStart: { router: { autoCodeSplitting: true } } });
