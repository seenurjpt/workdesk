import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/schemas";
import { User } from "@/models/User";
import { adminEmailsFromEnv, getRegistrationOpen } from "@/server/settings";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: "user" | "admin" } & DefaultSession["user"];
  }
}

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    ...(googleEnabled ? [Google] : []),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        if (!rateLimit(`login:${email}`, { capacity: 10, refillPerSec: 1 / 30 })) return null;
        await connectDb();
        const user = await User.findOne({ email }).select("+passwordHash").lean();
        if (!user?.passwordHash) return null;
        // A suspended account cannot sign in. (The specific message is given by loginAction.)
        if (user.status === "suspended") return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: String(user._id), name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      const signingIn = Boolean(user || account);
      if (account?.provider === "google" && profile?.email) {
        await connectDb();
        const email = profile.email.toLowerCase();
        let doc = await User.findOne({ email });
        if (!doc) {
          // A new Google account is a sign-up, so it follows the "sign-ups open" switch.
          if (!(await getRegistrationOpen())) return null;
          doc = await User.create({
            email,
            name: profile.name ?? email.split("@")[0],
            image: typeof profile.picture === "string" ? profile.picture : undefined,
          });
        }
        token.uid = String(doc._id);
      } else if (user?.id) {
        token.uid = user.id;
      }

      // Keep the role and the suspended flag current. Checked at sign-in and then at most every
      // 30 seconds, so suspending someone ends their open sessions within half a minute without a
      // database read on every request.
      const now = Date.now();
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      if (typeof token.uid === "string" && (signingIn || now - checkedAt > 30_000)) {
        await connectDb();
        const doc = await User.findById(token.uid).select("email role status").lean();
        if (!doc || doc.status === "suspended") return null; // signed out
        let role = doc.role === "admin" ? "admin" : "user";
        if (signingIn) {
          const update: Record<string, unknown> = { lastLoginAt: new Date() };
          if (role !== "admin" && adminEmailsFromEnv().includes(doc.email)) {
            update.role = "admin";
            role = "admin";
          }
          await User.updateOne({ _id: doc._id }, { $set: update });
        }
        token.role = role;
        token.checkedAt = now;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      session.user.role = token.role === "admin" ? "admin" : "user";
      return session;
    },
  },
});
