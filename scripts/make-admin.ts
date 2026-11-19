/* Makes an existing account an administrator (or removes that).
   Usage: npm run make-admin -- someone@example.com
          npm run make-admin -- someone@example.com --revoke
          npm run make-admin -- new@example.com --create   (new admin account, random password) */
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  if (!email || email.startsWith("--")) {
    console.error("Usage: npm run make-admin -- someone@example.com [--revoke]");
    process.exit(1);
  }
  const { connectDb } = await import("../src/lib/db");
  const { User } = await import("../src/models/User");
  const mongoose = (await import("mongoose")).default;
  await connectDb();
  const user = await User.findOne({ email });
  if (!user && process.argv.includes("--create")) {
    const bcrypt = (await import("bcryptjs")).default;
    const { generatePassword } = await import("../src/server/admin");
    const password = generatePassword(16);
    await User.create({
      name: "Administrator",
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin",
    });
    console.log(`Created administrator ${email}\nPassword: ${password}\nSign in at /admin/login`);
    await mongoose.disconnect();
    return;
  }
  if (!user) {
    console.error(
      `No account with the email ${email}. Create it first (sign up), then run this again.`,
    );
    process.exit(1);
  }
  user.role = revoke ? "user" : "admin";
  await user.save();
  console.log(
    `${email} is now ${revoke ? "a normal user" : "an administrator"}. They may need to sign out and in again.`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
