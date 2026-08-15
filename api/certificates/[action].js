/* =========================================================
   /api/certificates/:action        ADMINISTRATOR ONLY
     POST /api/certificates/create   issue a certificate
     GET  /api/certificates/list     recent certificates
     GET  /api/certificates/find     one record, by id
     POST /api/certificates/revoke   VALID <-> REVOKED
     POST /api/certificates/delete   remove a record entirely

   This file is the real security boundary for certificate
   issuing. Opening certificate-generator.html directly, or
   posting to this endpoint by hand, achieves nothing without a
   valid session cookie: every branch below re-checks it.

   The public verification endpoint lives in a different file
   (/api/verify.js) and shares none of this code, so there is
   no path by which a public request can reach an admin branch.
   ========================================================= */

import { requireAdmin } from "../../lib/auth.js";
import {
  getJSON,
  setJSON,
  setJSONIfAbsent,
  del,
  indexAdd,
  indexRemove,
  indexList,
  indexCount,
  getManyJSON,
  StorageUnavailable
} from "../../lib/store.js";
import { courseById, isCertifiable } from "../../lib/courses.js";
import {
  CERT_ID_PATTERN as ID_PATTERN,
  MAX_ATTEMPTS,
  generateCertificateId,
  exampleCertificateId
} from "../../lib/numbering.js";
import {
  ok,
  badRequest,
  unauthorized,
  notFound,
  methodNotAllowed,
  serverError,
  serviceUnavailable,
  readBody,
  collapse,
  isIsoDate,
  originOf
} from "../../lib/http.js";

export const CERT_ID_PATTERN = ID_PATTERN;
const CERT_INDEX = "cert:index";
const certKey = (id) => `cert:${id}`;

export default async function handler(req, res) {
  /* Nothing below this line runs for an unauthenticated caller. */
  const session = await requireAdmin(req);
  if (!session) return unauthorized(res);

  const action = String(req.query?.action || "");

  try {
    switch (action) {
      case "create":
        return await create(req, res, session);
      case "list":
        return await list(req, res);
      case "find":
        return await find(req, res);
      case "revoke":
        return await revoke(req, res);
      case "delete":
        return await remove(req, res);
      default:
        return notFound(res, "Unknown certificate endpoint.");
    }
  } catch (error) {
    if (error instanceof StorageUnavailable) {
      return serviceUnavailable(
        res,
        error,
        "Certificate storage is unavailable. No certificate was issued."
      );
    }
    return serverError(res, error);
  }
}

/* ---------------------------------------------------------
   Issue a certificate
   --------------------------------------------------------- */
async function create(req, res, session) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const body = await readBody(req);
  if (!body) return badRequest(res, "Invalid request.");

  const studentName = collapse(body.studentName, 80);
  const courseId = collapse(body.courseId, 80);
  const completionDate = collapse(body.completionDate, 10);

  if (studentName.length < 2) {
    return badRequest(res, "Enter the student's full name.");
  }
  if (studentName.length > 80) {
    return badRequest(res, "The student's name is too long for a certificate.");
  }
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'\-,]*$/u.test(studentName)) {
    return badRequest(
      res,
      "The name may contain letters, spaces, hyphens, apostrophes, commas and full stops only."
    );
  }

  /* The course title is never taken from the request. Only a course
     id is accepted, and only one that this deployment recognises as
     certificate-eligible. */
  if (!isCertifiable(courseId)) {
    return badRequest(
      res,
      "Choose a course that is active and eligible for certification."
    );
  }
  const course = courseById(courseId);

  if (!isIsoDate(completionDate)) {
    return badRequest(res, "Enter a valid completion date.");
  }
  const completion = new Date(completionDate + "T00:00:00Z");
  const year = completion.getUTCFullYear();
  if (year < 2000 || year > 2100) {
    return badRequest(res, "The completion date is outside the allowed range.");
  }
  /* A certificate dated well into the future is almost always a typo
     in the year field, and it would sit at the top of the sequence
     for that year forever. */
  if (completion.getTime() > Date.now() + 366 * 86_400_000) {
    return badRequest(
      res,
      "The completion date is more than a year in the future. Check the year."
    );
  }

  const origin = originOf(req);
  const now = new Date();

  /* Claim a random number atomically.

     The record is written with "create only if absent". If the number is
     already taken, the write does not happen, nothing is overwritten, and
     another number is drawn. This is what makes random numbering safe:
     there is no window between checking and writing for a second request
     to slip into. */
  let id = null;
  let record = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateCertificateId(year);

    const draft = {
      certificate_id: candidate,
      student_name: studentName,
      course_id: courseId,
      course_title: course.courseTitle,
      course_level: course.level,
      course_duration: course.duration,
      completion_date: completionDate,
      issue_date: now.toISOString().slice(0, 10),
      issued_by: session.email || null,
      status: "VALID",
      created_at: now.toISOString(),
      verification_url: `${origin}/verify?id=${encodeURIComponent(candidate)}`
    };

    const claimed = await setJSONIfAbsent(certKey(candidate), draft);
    if (claimed) {
      id = candidate;
      record = draft;
      break;
    }
    /* Taken. Draw again. */
  }

  if (!record) {
    return serverError(
      res,
      new Error(`Could not find a free certificate number after ${MAX_ATTEMPTS} attempts`),
      "A certificate number could not be allocated. No certificate was issued. Please try again."
    );
  }

  await indexAdd(CERT_INDEX, id, now.getTime());

  return ok(res, { ok: true, certificate: record });
}

/* ---------------------------------------------------------
   Recent certificates
   --------------------------------------------------------- */
async function list(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  const limit = Math.min(
    Math.max(parseInt(req.query?.limit, 10) || 25, 1),
    100
  );
  const offset = Math.max(parseInt(req.query?.offset, 10) || 0, 0);

  const ids = await indexList(CERT_INDEX, limit, offset);
  const records = (await getManyJSON(ids.map(certKey))).filter(Boolean);
  const total = await indexCount(CERT_INDEX);

  return ok(res, {
    ok: true,
    certificates: records,
    total,
    offset,
    limit,
    valid: records.filter((r) => r.status === "VALID").length
  });
}

/* ---------------------------------------------------------
   Find one, for the admin search box
   --------------------------------------------------------- */
async function find(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  const id = collapse(req.query?.id, 40).toUpperCase().replace(/\s+/g, "");
  if (!CERT_ID_PATTERN.test(id)) {
    return badRequest(
      res,
      `Certificate IDs look like ${exampleCertificateId()}.`
    );
  }

  const record = await getJSON(certKey(id));
  if (!record) return notFound(res, "No certificate with that ID.");

  return ok(res, { ok: true, certificate: record });
}

/* ---------------------------------------------------------
   Revoke and restore

   The record is kept. A revoked certificate keeps reporting as
   revoked when verified, which is an audit trail. Deleting it
   instead would make it report NOT FOUND, which is
   indistinguishable from an ID that never existed.
   --------------------------------------------------------- */
async function revoke(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const body = await readBody(req);
  if (!body) return badRequest(res, "Invalid request.");

  const id = collapse(body.id, 40).toUpperCase();
  const status = collapse(body.status, 16).toUpperCase() || "REVOKED";

  if (!CERT_ID_PATTERN.test(id)) {
    return badRequest(res, "Invalid certificate ID.");
  }
  if (status !== "VALID" && status !== "REVOKED") {
    return badRequest(res, "Status must be VALID or REVOKED.");
  }

  const record = await getJSON(certKey(id));
  if (!record) return notFound(res, "No certificate with that ID.");

  record.status = status;
  record.revoked_on =
    status === "REVOKED" ? new Date().toISOString().slice(0, 10) : null;
  record.revocation_reason =
    status === "REVOKED" ? collapse(body.reason, 200) || null : null;

  await setJSON(certKey(id), record);
  return ok(res, { ok: true, certificate: record });
}

/* ---------------------------------------------------------
   Permanent delete — for test records and genuine mistakes
   --------------------------------------------------------- */
async function remove(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const body = await readBody(req);
  if (!body) return badRequest(res, "Invalid request.");

  const id = collapse(body.id, 40).toUpperCase();
  if (!CERT_ID_PATTERN.test(id)) {
    return badRequest(res, "Invalid certificate ID.");
  }

  const record = await getJSON(certKey(id));
  if (!record) return notFound(res, "No certificate with that ID.");

  await del(certKey(id));
  await indexRemove(CERT_INDEX, id);

  /* The per-year counter is deliberately left alone. Winding it back
     would let a future certificate reuse this number, and then two
     different students would hold the same certificate ID. */
  return ok(res, { ok: true, deleted: id });
}
