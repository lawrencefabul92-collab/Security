# Security Training Academy

Professional security training website for the **Philippine Security and Safety
Professional**, with an administrator-only certificate generator and public
certificate verification. Built for **Vercel**.

---

> ## Read this first
>
> **Run the site with `npm run dev`, then open <http://localhost:3000>.**
> Node.js 20 or newer is all you need; there are no packages to install.
>
> You *can* open `public/index.html` straight from disk and the public
> pages will render correctly — styling, logo, fonts, navigation and
> course cards all work. But certificate verification, the administrator
> pages and the inquiry form talk to server endpoints, so they need the
> server running. Opened from disk they show a plain "service could not
> be reached" message. That is expected.
>
> See `HOW-TO-RUN.txt` for the short version.

## Contents

1. [What this is](#what-this-is)
2. [Deploy it](#deploy-it)
3. [Environment variables](#environment-variables)
4. [Create the administrator account](#create-the-administrator-account)
5. [Issue and verify a certificate](#issue-and-verify-a-certificate)
6. [Add the real signature](#add-the-real-signature)
7. [Manage courses](#manage-courses)
8. [Run it locally](#run-it-locally)
9. [Project structure](#project-structure)
10. [How security works](#how-security-works)
11. [Testing](#testing)
12. [What was verified and what was not](#what-was-verified-and-what-was-not)
13. [Troubleshooting](#troubleshooting)

---

## What this is

A static front end plus four Vercel Functions. No build step, no framework, no
runtime npm dependencies — the deployment is the repository.

| Page | Route | Who can reach it |
|---|---|---|
| Home | `/` | Public |
| Course catalogue | `/courses` | Public |
| Course detail | `/courses/{courseId}` | Public |
| Certificate verification | `/verify` | Public, read-only |
| Administrator sign-in | `/admin` | Public page, no data |
| One-time setup | `/admin-setup.html` | Closes after first use |
| Dashboard | `/admin.html` | Administrator only |
| Certificate generator | `/certificate-generator.html` | Administrator only |

| API | Method | Authorisation |
|---|---|---|
| `/api/admin/setup` | POST | Open only while no account exists |
| `/api/admin/setup-status` | GET | Public, reports a boolean only |
| `/api/admin/login` | POST | Public, rate limited |
| `/api/admin/logout` | POST | Any |
| `/api/admin/session` | GET | Session required |
| `/api/certificates/create` | POST | **Session required** |
| `/api/certificates/list` | GET | **Session required** |
| `/api/certificates/find` | GET | **Session required** |
| `/api/certificates/revoke` | POST | **Session required** |
| `/api/certificates/delete` | POST | **Session required** |
| `/api/verify` | GET | Public, read-only |
| `/api/inquiry` | POST public / GET admin | Mixed |

---

## Deploy it

### 1. Push the project to a Git repository

```bash
git init
git add .
git commit -m "Security Training Academy"
git remote add origin <your repository URL>
git push -u origin main
```

### 2. Import it into Vercel

In the Vercel dashboard: **Add New → Project → Import**. Vercel reads
`vercel.json` and needs no further configuration:

- Framework preset: **Other**
- Build command: none
- Output directory: `public`

### 3. Add persistent storage — do this before issuing any certificate

Certificate records must survive a redeploy. In your Vercel project:

**Storage → Create Database → Upstash for Redis** (Marketplace), then connect it
to the project. Vercel injects the connection variables automatically.

> **This step is not optional.** Without it the deployment has nowhere to keep
> certificates, and the administrator pages will show a red storage warning. The
> certificate generator will refuse to issue rather than pretend to succeed.

### 4. Redeploy, then open `/admin-setup.html`

Create the administrator account. The setup page then closes permanently.

### 5. Set your domain

Once a custom domain is attached, set `PUBLIC_SITE_URL` (below) so the QR code on
every certificate encodes the permanent address instead of the deployment URL it
happened to be generated on.

Also replace `YOUR-DOMAIN.com` in `public/robots.txt`, `public/sitemap.xml`, and
the `canonical` and `og:url` tags in the public HTML pages.

---

## Node.js version

Declared once, in `package.json`:

```json
"engines": { "node": "22.x" }
```

Do not also declare it in `vercel.json` or override it in the Vercel
dashboard — conflicting declarations are a common source of deploy
failures. Vercel reads `engines.node` and reports `nodejs22.x` in its
build output. That output string is a result, not something you set.

---

## Environment variables

Copy `.env.example` to `.env.local` for local work, and set the same names in
**Vercel → Project Settings → Environment Variables**.

| Variable | Required | Purpose |
|---|---|---|
| `KV_REST_API_URL` | Yes | Upstash Redis REST endpoint |
| `KV_REST_API_TOKEN` | Yes | Upstash Redis REST token |
| `UPSTASH_REDIS_REST_URL` | Alternative | Accepted instead of the above |
| `UPSTASH_REDIS_REST_TOKEN` | Alternative | Accepted instead of the above |
| `PUBLIC_SITE_URL` | Recommended | Origin encoded in certificate QR codes. No trailing slash |
| `ADMIN_EMAIL` | Optional | Provision the account from the dashboard instead of the setup page |
| `ADMIN_PASSWORD_HASH` | Optional | scrypt hash — generate with `npm run hash-password` |
| `SESSION_SECRET` | Optional | 32 random bytes — `openssl rand -hex 32` |

Both Upstash naming schemes are accepted; you only need one pair.

Changing `SESSION_SECRET` signs out every active session immediately.

---

## Create the administrator account

**Route A — the setup page (simpler).** Open `/admin-setup.html`, enter an email
and a password of at least 12 characters. The account is written to storage and
setup closes for good.

**Route B — environment variables.** Run `npm run hash-password`, which reads the
password from stdin without echoing it and prints `ADMIN_PASSWORD_HASH` and a
fresh `SESSION_SECRET`. Set those plus `ADMIN_EMAIL` in Vercel and redeploy. The
setup page reports itself closed.

An account created through the setup page always takes precedence over
environment variables.

**There is no self-service password reset, by design.** If the password is lost,
delete the `admin:account` key from the Redis store; the setup page then reopens.

---

## Issue and verify a certificate

1. Sign in at `/admin`.
2. **New certificate**, or go straight to `/certificate-generator.html`.
3. Enter the student's full name, choose a course, set the completion date.
4. **Generate certificate.** The server allocates the next number for that year
   and stores the record before anything appears on screen.
5. **Print / Save as PDF.** Choose **A4**, **Landscape**, margins **None**, and
   turn on **Background graphics** — the navy bands and gold rules are the
   document, not decoration.

Certificate numbers look like `SEC-ACADEMY-2026-000001`: a per-year sequence
allocated with an atomic increment, so two administrators pressing Generate at
the same moment cannot receive the same number. A number is never reused, even
if its certificate is later deleted.

**Verification.** The QR code opens `/verify?id=…` with the result already
loaded. Anyone can also type the number at `/verify`. The public response
contains only the recipient, course, completion date, issuing organisation and
status — never who issued it, when it was created, or any internal field.

**Revoke, do not delete, a certificate that was genuinely issued.** A revoked
certificate keeps its record and reports `REVOKED`, which is an audit trail. A
deleted certificate reports `NOT FOUND`, which looks identical to a number that
never existed. Delete is for test records and genuine mistakes.

---

## Add the real signature

The system **never generates or imitates a handwritten signature.** Until a real
one is supplied, the certificate prints `[ Authorized Signature ]` above the
signature line.

To add the real signature:

1. Save it as a PNG with a transparent background, roughly 1400 × 500 px.
2. Put the file in `public/assets/img/signatures/`.
3. In `public/assets/js/signature-config.js`, set:

   ```js
   image: "assets/img/signatures/authorized-signature.png",
   ```

4. Redeploy.

Certificates already issued keep verifying exactly as before — the signature is
part of the printed rendering, not the stored record. If the configured file is
missing, the certificate falls back to the placeholder rather than printing a
broken image.

The signatory is printed as supplied:

> **Mr. Darryl C. Bautista**
> CSP, CST, SO4, SM
> Authorized Signatory

Do not add titles, offices or affiliations that have not been authorised.

---

## Manage courses

`lib/courses.js` is the single source of truth. Edit it, then run:

```bash
npm run sync:courses
```

That regenerates `public/assets/js/courses.js`, the browser-side copy. **Never
edit the generated file by hand** — the server always wins, and a course the
server does not recognise cannot receive a certificate.

Each course carries `courseId`, `courseTitle`, `category`, `level`, `duration`,
`price`, `format`, `status`, `certificateEligible`, `summary`, `description`,
`learningObjectives`, `modules`, `audience`, `outcomes`, `requirements` and
`benefits`.

| `status` | Listed publicly | Enrollable | Certificates |
|---|---|---|---|
| `ACTIVE` | Yes | Yes | Yes, if `certificateEligible` |
| `COMING_SOON` | Yes | Register interest only | No |
| `INACTIVE` | No | No | No |

`courseId` must be unique and should stay stable once published, because issued
certificate records store it. Changing one does not break an existing
certificate — the course title is copied into the record at the moment of
issue — but it does break the link back to the catalogue.

Adding a course makes it appear on the catalogue page, the home page, the footer,
the inquiry dropdown and the certificate generator with no other change.

---

## Run it locally

```bash
npm run dev
```

Then open <http://localhost:3000>. There is nothing to install — the project has
no runtime dependencies.

The development server mirrors Vercel's routing, clean URLs, dynamic `[action]`
segments, and `req`/`res` shape, so a route that works locally works deployed.

Without Redis variables the server falls back to a JSON file at
`.data/store.json`. **That fallback is for local development only.** It is
git-ignored, and it refuses to start inside a Vercel deployment rather than
silently losing certificates to an ephemeral filesystem.

### Preview the certificate design without deploying

```bash
npm run preview:certificate
```

Writes `preview/certificate-preview.html`, which renders the certificate from the
real markup, stylesheet and rendering module with sample data. Open it in a
browser and use the browser's own print dialog to check the A4 landscape sheet.
It is written outside `public/`, so it is never deployed.

---

## Project structure

```
security-training-academy/
├── api/                          Vercel Functions
│   ├── admin/[action].js         setup · setup-status · login · logout · session
│   ├── certificates/[action].js  create · list · find · revoke · delete
│   ├── verify.js                 public verification, read-only
│   └── inquiry.js                public submit · admin list
│
├── lib/                          Server-only. Never served to a browser.
│   ├── auth.js                   scrypt hashing, HMAC sessions
│   ├── store.js                  storage adapter (Redis / dev file)
│   ├── courses.js                THE course catalogue — edit this
│   └── http.js                   response helpers, validation, rate limiting
│
├── public/                       Everything served to the browser
│   ├── index.html  courses.html  course.html  verify.html
│   ├── admin-login.html  admin-setup.html  admin.html
│   ├── certificate-generator.html  404.html
│   ├── robots.txt  sitemap.xml
│   └── assets/
│       ├── css/    styles · certificate · print · fonts
│       ├── js/     courses (generated) · catalog · home · inquiry
│       │           verify · admin-* · certificate-render
│       │           certificate-generator · signature-config
│       ├── img/    official logo, shield mark, favicons, signatures/
│       ├── fonts/  self-hosted woff2
│       └── vendor/ qrcode.min.js
│
├── scripts/
│   ├── build.mjs                 npm run build
│   ├── dev-server.mjs            npm run dev
│   ├── sync-courses.mjs          npm run sync:courses
│   ├── hash-password.mjs         npm run hash-password
│   ├── preview-certificate.mjs   npm run preview:certificate
│   └── test-system.mjs           npm test
│
├── vercel.json   package.json   .env.example   README.md
```

Because `public/` exists, Vercel serves only that directory statically. `lib/`
and `scripts/` are never reachable over HTTP.

---

## How security works

**The API is the boundary, not the interface.** Admin pages hide themselves until
a session check returns 200, but that is a convenience. Every protected endpoint
re-checks the session cookie on every call. Opening
`certificate-generator.html` directly, or posting to the endpoint by hand,
achieves nothing.

**Passwords.** scrypt with a random 16-byte salt, compared in constant time.
Never stored in plaintext, never returned by any endpoint, never present in any
file under `public/`.

**Sessions.** An HMAC-SHA256 signed token in an `HttpOnly`, `SameSite=Strict`,
`Secure` cookie with an 8-hour expiry. JavaScript cannot read it, and it cannot
be forged without the server-side secret.

**The public verification endpoint** imports none of the admin modules, accepts
`GET` only, and builds its response field by field — so a new internal field
added to the stored record later cannot start appearing publicly by accident. A
malformed number and a non-existent number produce identical answers without
touching storage, so the endpoint cannot be used to discover which numbers exist.

**Input validation is server-side.** The browser-side checks exist so a visitor
is told about a problem before the round trip; they decide nothing. The server
never trusts a course title, certificate number or status sent from a browser —
only a known course id.

**Error handling.** Public messages are generic. Stack traces, storage errors and
internal detail go to the server log, never to the response body.

**Headers.** `vercel.json` sets a Content-Security-Policy with no `unsafe-inline`
for scripts, plus HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` and `Permissions-Policy`. Admin pages and all API routes are
`no-store` and `noindex`.

**Rate limiting** on sign-in, setup, inquiry and verification is a per-instance
speed bump against casual abuse, not a guarantee — serverless instances are
short-lived. It is documented as such in `lib/http.js`. For a hard limit, put
Vercel's WAF or an edge rule in front.

---

## Testing

```bash
npm test
```

Starts the development server against a throwaway data directory and drives the
real handlers over real HTTP: 110 checks covering static routing, refusal of
every admin endpoint to anonymous callers, forged-cookie rejection, setup
open-then-closed, certificate issue and validation, sequence integrity under
concurrent requests, per-year numbering, listing, lookup, public verification and
its field whitelist, revoke and restore, deletion without number reuse, the
inquiry form including its honeypot, and source hygiene (no old branding, no
secrets in `public/`, no Netlify dependencies, no runtime npm dependencies).

---

## What was verified and what was not

Stated plainly, because the difference matters.

**Verified by execution:**

- All 110 API checks pass against the real handler files over real HTTP.
- All 48 browser checks pass in Chromium: full sign-in and generation flow,
  anonymous redirects, revoke reflected in public verification, mobile layout at
  390 px with no horizontal overflow, tap targets, no unexpected console errors.
- The certificate prints to a genuine single-page A4 landscape PDF at
  3512 × 2483 px at 300 dpi, full bleed, backgrounds intact, no clipping.
- **The QR code decodes** from that printed PDF at 300 dpi and still decodes
  after downsampling to phone-camera quality, returning the exact verification
  URL.
- The certificate holds A4 landscape proportions to within 0.01.

**Not verified in the build environment:**

- **Upstash Redis persistence.** No Redis instance was reachable during the
  build, so the production storage driver is verified by code inspection only.
  The development file driver is what the tests exercised. Both sit behind the
  same adapter interface. **Issue one test certificate after your first deploy,
  redeploy, and confirm it still verifies** before issuing anything real.
- **Vercel deployment itself.** The configuration is valid and the routing is
  correct, but no deploy was performed from the build environment.
- Real-world scanning with a physical phone camera against physical printed
  paper, as opposed to a rasterised PDF.

---

## Troubleshooting

**"The account service is temporarily unavailable" on the setup or sign-in
page.**
The application cannot reach Redis. Since the fix, the page itself tells
you which of the three causes it is, and the Vercel function log carries
the detail (Deployments → the deployment → Functions → the log). The
three causes:

- *No Redis variables visible.* The database is connected in Vercel but
  the deployment predates the connection. **Redeploy** — environment
  variables are read at deploy time, not at request time. This is by far
  the most common cause.
- *Variables visible but the endpoint is unreachable or rejects the
  token.* Check that the database in Vercel → Storage is connected to
  **this** project, not another one. If you have more than one Vercel
  project, it is easy to connect the database to one and deploy the site
  as another.
- *Variables visible but none form a usable connection.* The names are
  listed on the page. Open an issue with those names — the application
  accepts `KV_REST_API_URL`/`KV_REST_API_TOKEN`,
  `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, and derives a
  connection from `KV_URL`, `REDIS_URL` or `UPSTASH_REDIS_URL`.

Run `npm run test:storage` to confirm the whole account-creation path
works against a mock Redis endpoint on your own machine.


**Deploy fails with "Function Runtimes must have a valid version, for
example `now-php@1.0.0`".**
Something has added a `runtime` key under `functions` in `vercel.json`.
That key is only for *community* runtimes and must be written as
`package@1.2.3`, because Vercel validates it with
`semver.valid(value.split("@").pop())`. A value like `"nodejs22.x"` is
not valid semver and fails the deploy — confusingly, because that is the
same string Vercel prints in its own build output. Node.js functions
need no `runtime` declaration at all: Vercel detects Node from the `.js`
files under `api/` and takes the version from `engines.node` in
`package.json`. Remove the key. `npm run build` checks for exactly this
and fails before you can deploy.


**The site opens as unstyled text — blue underlined links, Times New
Roman, no layout, no logo.**
Asset paths in this project are relative on purpose, so this should not
happen. If it does, something has reintroduced a leading slash on an
`href` or `src`. Run `npm run build`: it checks every asset reference on
every page and names the offending file and path. A rooted path such as
`/assets/css/styles.css` resolves against the *filesystem root* when the
page is opened from disk, so the browser looks for `C:\assets\css\...`,
finds nothing, and falls back to default browser styling.

**Verification, sign in, or the inquiry form says the service could not
be reached.**
The page was opened from disk rather than through a server. Those pages
call API endpoints, which need one. Run `npm run dev` and use
<http://localhost:3000>. The public pages work either way.


**Red storage warning on the admin pages.** No Redis connection variables are
set. Add the Upstash integration and redeploy. Do not issue certificates until
this clears.

**"Could not reach the authentication service" locally.** Start the site with
`npm run dev` rather than opening the HTML files directly — the API routes need a
server.

**The QR code points at a `*.vercel.app` address.** Set `PUBLIC_SITE_URL` to your
custom domain and redeploy. Certificates already issued keep the old URL stored;
reissue any that matter.

**The printed certificate has white margins or missing colour.** In the print
dialog set margins to **None** and enable **Background graphics**.

**A course is missing from the site.** Check its `status` in `lib/courses.js`,
then run `npm run sync:courses` and redeploy.

**A course is missing from the generator dropdown.** It must be both `ACTIVE`
and `certificateEligible: true`. The server enforces this too, so editing the
dropdown in the browser will not get past it.

**Setup page says setup is closed but no password is known.** Delete the
`admin:account` key from the Redis store. The page reopens.

---

## A note on claims

A Certificate of Completion issued by this system records that a named person
completed a named course of study with this academy. It is **not** a government
licence, a professional accreditation, or a substitute for any credential
required by law or by a regulator. The public site states this on the home page,
the catalogue, every course page and the verification page. Please keep it that
way.
