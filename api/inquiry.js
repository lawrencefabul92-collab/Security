/* =========================================================
   /api/inquiry
     POST   public   submit an enrollment or course inquiry
     GET    admin    list recent inquiries for the dashboard

   The two methods are unrelated in every way that matters:
   POST writes and returns nothing about anyone else, GET
   refuses outright without a valid admin session.
   ========================================================= */

import { requireAdmin } from "../lib/auth.js";
import {
  setJSON,
  getJSON,
  del,
  incr,
  indexAdd,
  indexRemove,
  indexList,
  indexCount,
  getManyJSON,
  StorageUnavailable
} from "../lib/store.js";
import { courseById } from "../lib/courses.js";
import {
  ok,
  created,
  badRequest,
  unauthorized,
  notFound,
  methodNotAllowed,
  serverError,
  serviceUnavailable,
  readBody,
  collapse,
  str,
  isEmail,
  rateLimit
} from "../lib/http.js";

const INQ_INDEX = "inq:index";
const inqKey = (id) => `inq:${id}`;

export default async function handler(req, res) {
  try {
    if (req.method === "POST") return await submit(req, res);
    if (req.method === "GET") return await listOrManage(req, res);
    return methodNotAllowed(res);
  } catch (error) {
    if (error instanceof StorageUnavailable) {
      return serviceUnavailable(
        res,
        error,
        "We could not record your inquiry just now. Please try again shortly."
      );
    }
    return serverError(res, error);
  }
}

/* ---------------------------------------------------------
   Public submission

   Kept to one short form on purpose: an inquiry should not
   require an account. Everything is validated here on the
   server; the browser-side checks are a courtesy only.
   --------------------------------------------------------- */
async function submit(req, res) {
  if (!rateLimit(req, "inquiry", 5, 10 * 60_000)) {
    return badRequest(
      res,
      "Several inquiries have already been sent from this connection. Please wait a few minutes."
    );
  }

  const body = await readBody(req);
  if (!body) return badRequest(res, "Invalid request.");

  /* Honeypot. A field hidden from people and left empty by them;
     bots fill it in. Answered with a plain success so the sender
     learns nothing, but nothing is stored. */
  if (collapse(body.website, 200)) {
    return created(res, { ok: true, message: "Thank you. Your inquiry has been received." });
  }

  const fullName = collapse(body.fullName, 80);
  const email = collapse(body.email, 160).toLowerCase();
  const mobile = collapse(body.mobile, 32);
  const courseId = collapse(body.courseId, 80);
  const message = str(body.message, 1500);

  const errors = {};

  if (fullName.length < 2) errors.fullName = "Enter your full name.";
  else if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'\-,]*$/u.test(fullName)) {
    errors.fullName = "Use letters, spaces, hyphens and apostrophes only.";
  }

  if (!isEmail(email)) errors.email = "Enter a valid email address.";

  const digits = mobile.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) {
    errors.mobile = "Enter a mobile number we can reach you on.";
  } else if (!/^[\d\s+()\-]+$/.test(mobile)) {
    errors.mobile = "Use digits, spaces and + ( ) - only.";
  }

  const course = courseId ? courseById(courseId) : null;
  if (courseId && (!course || course.status === "INACTIVE")) {
    errors.courseId = "Choose a course from the list.";
  }

  if (message.length > 1500) errors.message = "Please shorten your message.";
  /* Anything that looks like an attempt to smuggle markup or a link
     farm into a record an administrator will later read. */
  if (/<\s*(script|iframe|img|a|style|object|embed)/i.test(message)) {
    errors.message = "Please write your message as plain text.";
  }
  if ((message.match(/https?:\/\//gi) || []).length > 2) {
    errors.message = "Please include no more than two links.";
  }

  if (Object.keys(errors).length) {
    return sendErrors(res, errors);
  }

  const sequence = await incr("inq:seq");
  const now = new Date();
  const id = `INQ-${now.getUTCFullYear()}-${String(sequence).padStart(6, "0")}`;

  const record = {
    inquiry_id: id,
    full_name: fullName,
    email,
    mobile,
    course_id: course ? course.courseId : null,
    course_title: course ? course.courseTitle : null,
    message,
    status: "NEW",
    created_at: now.toISOString()
  };

  await setJSON(inqKey(id), record);
  await indexAdd(INQ_INDEX, id, now.getTime());

  return created(res, {
    ok: true,
    reference: id,
    message:
      "Thank you. Your inquiry has been received and we will reply by email."
  });
}

function sendErrors(res, fields) {
  res.statusCode = 400;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(
    JSON.stringify({
      error: "Please check the highlighted fields.",
      fields
    })
  );
}

/* ---------------------------------------------------------
   Administrator view
     GET /api/inquiry                list
     GET /api/inquiry?mark=ID&status=HANDLED
     GET /api/inquiry?remove=ID
   --------------------------------------------------------- */
async function listOrManage(req, res) {
  const session = await requireAdmin(req);
  if (!session) return unauthorized(res);

  const mark = collapse(req.query?.mark, 40).toUpperCase();
  if (mark) {
    const status = collapse(req.query?.status, 16).toUpperCase();
    if (!["NEW", "HANDLED"].includes(status)) {
      return badRequest(res, "Status must be NEW or HANDLED.");
    }
    const record = await getJSON(inqKey(mark));
    if (!record) return notFound(res, "No inquiry with that reference.");
    record.status = status;
    await setJSON(inqKey(mark), record);
    return ok(res, { ok: true, inquiry: record });
  }

  const remove = collapse(req.query?.remove, 40).toUpperCase();
  if (remove) {
    const record = await getJSON(inqKey(remove));
    if (!record) return notFound(res, "No inquiry with that reference.");
    await del(inqKey(remove));
    await indexRemove(INQ_INDEX, remove);
    return ok(res, { ok: true, deleted: remove });
  }

  const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 25, 1), 100);
  const ids = await indexList(INQ_INDEX, limit, 0);
  const records = (await getManyJSON(ids.map(inqKey))).filter(Boolean);

  return ok(res, {
    ok: true,
    inquiries: records,
    total: await indexCount(INQ_INDEX),
    unhandled: records.filter((r) => r.status === "NEW").length
  });
}
