import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@pm-yc/db";
import NextAuth from "next-auth";
import type { DefaultSession, NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";

import { verifyPassword } from "@pm-yc/auth/password";

import { authConfig } from "./auth.config";

/**
 * Extend the default session types to include our custom fields.
 */
interface WorkspaceMembership {
  workspaceId: string;
  role: string;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    workspaces: WorkspaceMembership[];
  }
}

const nextAuth: NextAuthResult = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    /**
     * Google OAuth
     */
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),

    /**
     * Magic link via email (Nodemailer)
     */
    ...(process.env.EMAIL_SERVER
      ? [
          Nodemailer({
            server: process.env.EMAIL_SERVER,
            from: process.env.EMAIL_FROM ?? "noreply@pm-yc.com",
          }),
        ]
      : []),

    /**
     * Email/password credentials
     */
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user?.passwordHash) return null;

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? user.avatarUrl,
        };
      },
    }),

    /**
     * SAML SSO via BoxyHQ SAML Jackson (placeholder)
     *
     * Requires a running SAML Jackson instance.
     * Configure JACKSON_URL, SAML_ISSUER, SAML_ACS_URL in env.
     * This is a custom OIDC provider pointing to the Jackson OIDC endpoint.
     */
    ...(process.env.JACKSON_URL
      ? [
          {
            id: "saml-jackson" as const,
            name: "SSO",
            type: "oauth" as const,
            issuer: process.env.JACKSON_URL,
            wellKnown: `${process.env.JACKSON_URL}/.well-known/openid-configuration`,
            authorization: { params: { scope: "openid email profile" } },
            clientId: "dummy", // Jackson uses tenant/product in the request
            clientSecret: "dummy",
            profile(profile: Record<string, string>) {
              return {
                id: profile.sub ?? profile.id,
                email: profile.email,
                name: profile.name ?? profile.email,
                image: profile.picture ?? null,
              };
            },
          },
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account }) {
      const t = token as Record<string, unknown>;

      // On initial sign-in, persist user id and provider
      if (user) {
        token.sub = user.id;
      }
      if (account) {
        t.provider = account.provider;
      }

      // Fetch workspace memberships on sign-in or refresh
      if (token.sub && !t.workspaces) {
        const memberships = await db.workspaceMembership.findMany({
          where: { userId: token.sub },
          select: { workspaceId: true, role: true },
        });
        t.workspaces = memberships.map((m) => ({
          workspaceId: m.workspaceId,
          role: m.role,
        }));
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      // Attach workspace memberships to session
      const t = token as Record<string, unknown>;
      (session as unknown as Record<string, unknown>).workspaces =
        (t.workspaces as WorkspaceMembership[]) ?? [];
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // When a new user is created via OAuth or magic link,
      // record an audit log or send welcome email here
      console.log(`[Auth] New user created: ${user.email}`);
    },
  },
});

export const handlers: NextAuthResult["handlers"] = nextAuth.handlers;
export const auth: NextAuthResult["auth"] = nextAuth.auth;
export const signIn: NextAuthResult["signIn"] = nextAuth.signIn;
export const signOut: NextAuthResult["signOut"] = nextAuth.signOut;
