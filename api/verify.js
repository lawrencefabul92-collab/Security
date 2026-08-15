/* =========================================================
   GET /api/verify?id=SEC-ACADEMY-2026-000001
   PUBLIC. READ ONLY.

   This is the only certificate endpoint an anonymous visitor
   can reach, and it is the only one that does not import the
   admin modules. It answers one question about one certificate
   at a time.

   It cannot be used to:
     - list certificates (no listing branch exists here)
     - discover which IDs exist (a malformed ID and a missing
       one produce the same answer)
     - see who issued a certificate, when it was created, or
       any other internal field (the response is assembled
       field by field, never spread from the stored record)
     - change anything (GET only; nothing here writes)
   ========================================================= */

import { getJSON, StorageUnavailable } from "../lib/store.js";
import {
  ok,
  methodNotAllowed,
  serviceUnavailable,
  collapse,
  rateLimit
} from "../lib/http.js";

import { CERT_ID_PATTERN as ID_PATTERN } from "../lib/numbering.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return methodNotAllowed(res);
  }

  if (!rateLimit(req, "verify", 60, 60_000)) {
    return ok(res, { found: false, status: "RATE_LIMITED" });
  }

  const id = collapse(req.query?.id, 40).toUpperCase().replace(/\s+/g, "");

  /* A badly formed ID is answered exactly like an ID that does not
     exist, and without touching storage. Someone probing the endpoint
     learns nothing from the difference in timing or wording. */
  if (!ID_PATTERN.test(id)) {
    return ok(res, { found: false, status: "NOT_FOUND" });
  }

  let record;
  try {
    record = await getJSON(`cert:${id}`);
  } catch (error) {
    return serviceUnavailable(
      res,
      error,
      "Verification is temporarily unavailable. This is a problem on our side, not a judgement about the certificate."
    );
  }

  if (!record) {
    return ok(res, { found: false, status: "NOT_FOUND" });
  }

  if (record.status === "REVOKED") {
    return ok(res, {
      found: true,
      status: "REVOKED",
      certificate_id: record.certificate_id,
      revoked_on: record.revoked_on || null,
      issuing_organisation: "Philippine Security and Safety Professional"
    });
  }

  /* Deliberately narrow. Every field is named explicitly so that a
     new internal field added to the stored record in future cannot
     start appearing in public responses by accident. */
  return ok(res, {
    found: true,
    status: "VALID",
    certificate_id: record.certificate_id,
    student_name: record.student_name,
    course_title: record.course_title,
    completion_date: record.completion_date,
    issuing_organisation: "Philippine Security and Safety Professional",
    academy: "Security Training Academy"
  });
}
