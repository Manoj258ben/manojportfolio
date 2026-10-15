# Personal Portfolio Website + Admin Dashboard

A responsive portfolio with **8 themes**, a **protected admin dashboard** and a **Supabase** backend.
Built with only HTML5, CSS3, vanilla JavaScript (ES6+) and the Supabase JS client v2 — no frameworks, no build step.

- Public site: `/` (`index.html`)
- Admin dashboard: `/admin.html`

---

## 1. Features

**Public site** — navigation with mobile menu and active-section highlight · hero with typing effect, resume and social buttons · About · Skills (grouped, with proficiency bars) · Projects (category filters, featured badge, safe links) · Education & Experience timeline · Certificates (image preview) · Achievements · Resume (preview + download) · Contact form saved to Supabase · footer · back-to-top · SEO tags · loading / empty / error states.

**Admin** — email/password login · forgot/reset/update password · session restore & expiry handling · **server-enforced admin authorization** · dashboard with real statistics · edit profile · full create / edit / delete / **reorder** for projects, skills, timeline, certificates, achievements · resume upload / replace / remove · website & SEO settings · contact-message inbox (read / unread / delete).

**Themes** (`data-theme` values): `midnight-dark`, `minimal-light`, `cyber-neon`, `ocean-blue`, `emerald-green`, `sunset`, `glass`, `monochrome`. A visitor's choice is saved in `localStorage`; visitors without one get the default you pick in *Settings*.

## 2. Folder structure

```
ag/
├── index.html           Public portfolio
├── style.css            Public styles + the 8 themes (CSS variables)
├── script.js            Public logic (data loading, contact form, themes …)
├── admin.html           Admin login + dashboard
├── admin.css            Admin styles (uses the same theme variables)
├── admin.js             Admin logic (auth, CRUD, uploads)
├── supabase-config.js   Supabase URL + public key + shared helpers
├── schema.sql           Database, security policies, storage  (run once)
├── favicon.svg          Site icon
├── requirements.txt     Python packages — none needed (see section 18)
└── README.md
```

## 3. Software you need

A web browser, a free [Supabase](https://supabase.com) account, and (optional) a code editor such as VS Code. For a local server: Python 3 **or** Node.js.

## 4–5. Run it locally

Open the folder in a terminal and start any static server (opening the file by double-click also works for the public site, but a server is closer to real hosting and needed for password-reset links):

```bash
python -m http.server 8080      # or:  npx serve .
```

Visit `http://localhost:8080/` and `http://localhost:8080/admin.html`.

## 6. Create a Supabase project

1. supabase.com → **New project**, choose a name and a strong database password (keep it private; it is never used in this code).
2. Wait until the project finishes provisioning.

## 7. Configure the URL and public key

Dashboard → **Project Settings → API**. Copy the **Project URL** and the **anon / publishable** key into `supabase-config.js`:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';
```

The file you uploaded already contains a project URL and an `anon` key — keep them if that is your project. The anon key is safe in the browser **because** `schema.sql` locks everything down with Row Level Security. **Never** put the `service_role` key or database password in any file of this project.

## 8. Run `schema.sql`

SQL Editor → New query → paste the whole of `schema.sql` → **Run**.
It is safe to run more than once. It creates the tables, security policies, the `portfolio-assets` storage bucket and its policies.

**Already have the old tables?** Just run the same file. Existing rows are kept, missing columns are added, the old policies (which let *any* logged-in user write) are removed. The old code asked for tables `profile` and `contact_messages` that never existed in the schema; the app now uses `site_settings` (one row for profile + settings) and `messages`, so no data needs to be moved.

## 9. Create and authorize your administrator account

Being logged in is **not** enough — only users listed in the `admin_users` table are administrators, and nobody can add themselves from the browser.

1. Dashboard → **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, tick **Auto Confirm User**.
2. SQL Editor → run (use your email):
   ```sql
   INSERT INTO public.admin_users (user_id, email)
   SELECT id, email FROM auth.users WHERE email = 'you@example.com'
   ON CONFLICT (user_id) DO NOTHING;
   ```
3. Check: `SELECT * FROM public.admin_users;` should show one row.
4. Recommended: **Authentication → Sign In / Providers → Email → turn off “Allow new users to sign up”.**

## 10. Authentication redirect URLs

Authentication → **URL Configuration**:
- **Site URL**: your live address, e.g. `https://yourname.vercel.app`
- **Redirect URLs**: add `https://yourname.vercel.app/admin.html` and `http://localhost:8080/admin.html`

Password-reset emails link back to `/admin.html`, which shows the "choose a new password" form.

## 11–12. Storage bucket and policies

`schema.sql` already creates the public bucket **`portfolio-assets`** (5 MB limit; JPEG, PNG, WebP, GIF, PDF only) and policies so that only administrators can upload, replace or delete. Check: **Storage → portfolio-assets** exists and is *Public*. SVG/HTML uploads are deliberately blocked.

## 13. Test the public portfolio

Open `/`. With an empty database you see friendly "will appear here soon" messages — no fake data. Switch each theme with the palette button, try the mobile menu (narrow the window), and send a test message from the contact form.

## 14. Test the admin dashboard

1. `/admin.html` → sign in. A user who is not in `admin_users` is rejected with a clear message.
2. **Profile** → fill in and save → reload `/`.
3. Add a project (with image), skills, a timeline entry, a certificate, an achievement; use the arrows to reorder.
4. **Resume** → upload a PDF → buttons appear on the public site.
5. **Messages** → the message you sent appears; open, mark unread, delete.
6. Log out; reload — you must see the login page.

## 15. Deploy to Vercel

Push the folder to GitHub → vercel.com → **Add New → Project** → import the repo → Framework **Other**, no build command, output directory = the folder containing `index.html` → Deploy. Then update the URLs in step 10.

## 16. Deploy to Netlify

Netlify → **Add new site → Deploy manually** and drag the folder in (or connect the GitHub repo; no build command, publish directory `.`). Then update step 10.

Both hosts serve `/admin.html` directly as a static file; no rewrite rules are needed.

## 17. Troubleshooting

| Problem | Fix |
|---|---|
| Sections show "database is not set up" | Run `schema.sql`. |
| "not authorized as an administrator" | Do step 9 (insert your user into `admin_users`). |
| Contact form says it is not permitted | `schema.sql` not run, or old policies still present — run it again. |
| "You have sent several messages recently" | Built-in limit: 3 messages / 10 min per email. |
| Upload fails | Bucket must be named `portfolio-assets`; files ≤ 5 MB; JPG/PNG/WebP/GIF/PDF only; you must be an admin. |
| Reset email link shows "expired" | Links are single-use; request a new one. Check the redirect URLs (step 10). |
| Resume preview blank on phone | Mobile browsers can't embed PDFs; use *View Full Screen* / *Download*. |
| Theme not persisting | Browser blocks `localStorage` (private mode). |
| Blank page / `supabase is not defined` | The CDN script was blocked — check your connection/ad-blocker. |

## 18. About `requirements.txt`

It contains only comments: the project needs **no Python packages**. The file exists because it was requested; the app runs on HTML/CSS/JS + Supabase alone. (`python -m http.server` in step 4 uses Python's standard library only.)

---

### Security summary
- Every table has Row Level Security. Visitors can read published content and *insert* messages (always unread, length-limited, rate-limited); only `admin_users` members can write content, read messages, or manage storage.
- Table grants are minimised (anonymous users can't even attempt writes except message insert).
- Database text is rendered with `textContent` / safe DOM building — never `innerHTML`; links must be `http(s)`; icon classes are whitelisted by pattern; uploads are checked by MIME type, size **and file signature**.
- No secrets in the code: only the public anon key.
- Optional hardening: add a CAPTCHA (e.g. Cloudflare Turnstile) before the contact form if you receive spam.
#   m a n o j p o r t f o l i o  
 #   m a n o j p o r t f o l i o  
 #   m a n o j p o r t f o l i o  
 #   m a n o j p o r t f o l i o  
 