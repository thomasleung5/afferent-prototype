# Architecture

This is a Vite + React + TanStack Router SPA, with a small Hono server for the AI extract endpoint. There is no Next.js — do not introduce `next/link`, `next/navigation`, `app/` directory routing, server components, or `"use client"` directives.

- `src/main.tsx` mounts `<RouterProvider/>`; build-model state is read through the persisted Zustand store in `lib/store.ts`.
- File-based routes live in `src/routes/`; page bodies live in `src/pages/`.
- The route tree is generated to `src/routeTree.gen.ts` by `@tanstack/router-plugin/vite` (gitignored).
- The path alias `@/*` resolves to the project root.
- `npm run dev` launches Vite on :3000 (proxied `/api → :8787`) and Hono on :8787 in parallel.
