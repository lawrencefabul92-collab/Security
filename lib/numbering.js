/* =========================================================
   CERTIFICATE NUMBERING

   The one place to change how certificate numbers are formed.
   Server-only: a browser never sees this file, and a browser
   can never choose a certificate number.

   Format:   SEC-ACADEMY-<year>-<random digits>
   Example:  SEC-ACADEMY-2026-483027

   The year comes from the completion date on the certificate
   — the year the course was actually taken, not the year it
   happens to be printed.

   ---------------------------------------------------------
   WHY RANDOM, AND HOW IT STAYS UNIQUE
   ---------------------------------------------------------
   Sequential numbers leak information. SEC-ACADEMY-2026-000007
   tells anyone holding it that the academy has issued seven
   certificates, and it invites guessing a neighbouring number
   to see whether it exists. Random numbers do neither.

   The cost of random is that two draws could collide. That is
   handled where it must be — at the moment of writing, not by
   checking first and hoping. The record is written with a
   conditional "create only if absent" operation; if the number
   is already taken the draw is discarded and another is made.
   Two administrators pressing Generate at the same instant
   therefore cannot receive the same number, and an existing
   certificate can never be overwritten.

   With 6 digits there are a million numbers per year. At a
   thousand certificates in one year, a single draw has roughly
   a 0.1% chance of colliding, and a collision costs one extra
   attempt and nothing else.

   If the academy ever issues tens of thousands in one year,
   raise DIGITS to 7. Numbers already issued keep working,
   because CERT_ID_PATTERN accepts a range of widths.
   ========================================================= */

import crypto from "node:crypto";

/* Number of random digits after the year. */
export const DIGITS = 6;

/* How many redraws before giving up and reporting a failure, rather than
   ever risking a duplicate. */
export const MAX_ATTEMPTS = 12;

export const PREFIX = "SEC-ACADEMY";

/* Accepts 4 to 8 digits so certificates issued under the earlier
   sequential series — the six-digit 000001 form — continue to verify.
   Never narrow this below a width that has already been issued. */
export const CERT_ID_PATTERN = /^SEC-ACADEMY-\d{4}-\d{4,8}$/;

/**
 * A cryptographically random number of exactly DIGITS digits, zero-padded.
 * crypto.randomInt rather than Math.random: Math.random is predictable
 * from earlier outputs, which would undo the point of not being guessable.
 */
export function randomSuffix() {
  const ceiling = 10 ** DIGITS;
  return String(crypto.randomInt(0, ceiling)).padStart(DIGITS, "0");
}

/** SEC-ACADEMY-2026-483027 */
export function formatCertificateId(year, suffix) {
  return `${PREFIX}-${year}-${suffix}`;
}

/** A fresh candidate certificate number for the given year. */
export function generateCertificateId(year) {
  return formatCertificateId(year, randomSuffix());
}

/** Example used in placeholders and help text, so they follow the config. */
export function exampleCertificateId(year) {
  return formatCertificateId(year || new Date().getFullYear(), "483027");
}

/* A description of the scheme currently running, so it is possible to
   confirm from a browser WHICH version of this file a deployment is
   actually serving. Reveals nothing sensitive — the format of a
   certificate number is printed on every certificate. */
export function describeNumbering() {
  return {
    scheme: "random",
    digits: DIGITS,
    format: `${PREFIX}-<completion year>-<${DIGITS} random digits>`,
    example: exampleCertificateId(),
    sequential: false
  };
}
