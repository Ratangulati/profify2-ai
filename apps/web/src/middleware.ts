import NextAuth from "next-auth";

import { authConfig } from "./auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run middleware on all routes except static files and images
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
