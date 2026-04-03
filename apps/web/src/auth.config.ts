/**
 * Edge-compatible auth config. Used by Next.js middleware.
 * Does not include adapters or Node.js-only imports.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname.startsWith("/auth");
      const isApiRoute = nextUrl.pathname.startsWith("/api");
      const isPublicRoute = nextUrl.pathname === "/" || nextUrl.pathname.startsWith("/public");

      // Allow API routes to handle their own auth
      if (isApiRoute) return true;

      // Redirect logged-in users away from auth pages
      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // Allow auth pages and public routes
      if (isAuthPage || isPublicRoute) return true;

      // Require auth for all other pages
      return isLoggedIn;
    },
  },
  providers: [], // Populated in auth.ts (not edge-compatible)
} satisfies NextAuthConfig;
