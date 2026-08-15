/* =========================================================
   npm run hash-password

   Prints a scrypt hash for a password, plus a fresh session
   secret, for provisioning the administrator account from
   environment variables instead of the setup page.

   The password is read from stdin so it never appears in your
   shell history or in the process list.
   ========================================================= */

import crypto from "node:crypto";
import readline from "node:readline";
import { hashPassword } from "../lib/auth.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

console.log("\nAdministrator password hash generator");
console.log("The password is not echoed and is not stored anywhere.\n");

/* Suppress echo while typing. */
const write = rl._writeToOutput;
rl._writeToOutput = function () { /* nothing */ };

rl.question("Password (at least 12 characters): ", (password) => {
  rl._writeToOutput = write;
  rl.close();
  console.log("");

  if (String(password).length < 12) {
    console.error("That password is shorter than 12 characters. Nothing generated.");
    process.exit(1);
  }

  console.log("Add these to your Vercel environment variables:\n");
  console.log("ADMIN_EMAIL=you@example.com");
  console.log("ADMIN_PASSWORD_HASH=" + hashPassword(password));
  console.log("SESSION_SECRET=" + crypto.randomBytes(32).toString("hex"));
  console.log("\nChanging SESSION_SECRET signs out every active session.\n");
});
