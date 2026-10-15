-- =====================================================================
--  PORTFOLIO DATABASE SCHEMA  —  schema.sql   (Supabase / PostgreSQL)
--
--  HOW TO USE
--    1. Supabase Dashboard -> SQL Editor -> New query
--    2. Paste this ENTIRE file and click Run.
--    3. Then do the one-time "authorize your admin account" step at the
--       very bottom of this file (section 10).
--
--  This script is RE-RUNNABLE. It uses IF NOT EXISTS / DROP POLICY IF
--  EXISTS everywhere, so running it again will not duplicate anything and
--  will not delete your portfolio content.
--
--  UPGRADING FROM THE OLD schema.sql?  Just run this file. It:
--    * keeps your existing rows (site_settings, projects, skills, ...)
--    * ADDS the columns the finished app needs (ALTER TABLE ... IF NOT EXISTS)
--    * REMOVES the old insecure policies that let ANY logged-in user write
--    * keeps the `messages` table (see "Table names" below)
--
--  TABLE NAMES (decided after tracing every query in the code)
--    * site_settings : ONE row holding profile + website settings.
--                      (The old public script asked for a `profile` table
--                      and for key/value rows in site_settings. Neither
--                      existed. The admin panel already used one-row
--                      site_settings, so that is the single model now.)
--    * messages      : contact-form submissions.
--                      (The old public script inserted into
--                      `contact_messages`. The schema and admin panel used
--                      `messages` with the same columns, so `messages` is
--                      kept and the public script was fixed to match.)
-- =====================================================================


-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- ---- site_settings : single row (profile + website settings) --------
CREATE TABLE IF NOT EXISTS public.site_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton        BOOLEAN NOT NULL DEFAULT TRUE,        -- guarantees ONE row
  -- profile
  full_name        TEXT,
  job_title        TEXT,
  hero_intro       TEXT,                                 -- short hero text
  bio              TEXT,                                 -- About section
  education_summary TEXT,
  career_goals     TEXT,
  interests        TEXT,
  location         TEXT,
  contact_email    TEXT,
  phone            TEXT,
  avatar_url       TEXT,                                 -- hero profile photo
  about_image_url  TEXT,                                 -- About section photo
  resume_url       TEXT,                                 -- public URL of the PDF
  years_coding     INTEGER,                              -- optional counter
  typing_roles     TEXT[] DEFAULT '{}',                  -- hero typing effect
  -- social links
  github_url       TEXT,
  linkedin_url     TEXT,
  twitter_url      TEXT,
  instagram_url    TEXT,
  website_url      TEXT,
  -- website settings
  site_title       TEXT DEFAULT 'My Portfolio',
  tagline          TEXT,
  default_theme    TEXT DEFAULT 'midnight-dark',
  seo_title        TEXT,
  seo_description  TEXT,
  footer_text      TEXT,
  copyright_text   TEXT,
  show_hire_me     BOOLEAN DEFAULT TRUE,                 -- kept from old schema
  maintenance_mode BOOLEAN DEFAULT FALSE,                -- kept from old schema
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ---- projects --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT DEFAULT 'web',
  tech_stack   TEXT[] DEFAULT '{}',
  live_url     TEXT,
  github_url   TEXT,
  image_url    TEXT,
  featured     BOOLEAN DEFAULT FALSE,
  published    BOOLEAN NOT NULL DEFAULT TRUE,
  project_date DATE,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ---- skills (one row per skill) --------------------------------------
CREATE TABLE IF NOT EXISTS public.skills (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  category   TEXT,
  level      INTEGER DEFAULT 5,                          -- proficiency 1..10
  icon_class TEXT,                                       -- Font Awesome class
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- timeline (education & experience) -------------------------------
CREATE TABLE IF NOT EXISTS public.timeline (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL DEFAULT 'education',
  title        TEXT NOT NULL,
  organization TEXT,
  location     TEXT,
  start_date   DATE,
  end_date     DATE,
  current      BOOLEAN DEFAULT FALSE,
  description  TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ---- certificates ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.certificates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  issuer         TEXT,
  date_issued    DATE,
  credential_url TEXT,
  description    TEXT,
  image_url      TEXT,
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---- achievements ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  date        DATE,
  icon        TEXT,                                      -- Font Awesome class
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---- messages (contact form submissions) -----------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT,
  message    TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- admin_users : who is allowed to manage the portfolio ------------
-- Being logged in is NOT enough. Only users listed here are admins.
-- Rows can only be added from the SQL Editor (see section 10).
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =====================================================================
-- 2. MIGRATION: add any columns missing from an OLDER schema
--    (harmless no-ops on a fresh database)
-- =====================================================================
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS singleton         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hero_intro        TEXT,
  ADD COLUMN IF NOT EXISTS education_summary TEXT,
  ADD COLUMN IF NOT EXISTS career_goals      TEXT,
  ADD COLUMN IF NOT EXISTS interests         TEXT,
  ADD COLUMN IF NOT EXISTS about_image_url   TEXT,
  ADD COLUMN IF NOT EXISTS years_coding      INTEGER,
  ADD COLUMN IF NOT EXISTS typing_roles      TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS instagram_url     TEXT,
  ADD COLUMN IF NOT EXISTS seo_title         TEXT,
  ADD COLUMN IF NOT EXISTS seo_description   TEXT,
  ADD COLUMN IF NOT EXISTS footer_text       TEXT,
  ADD COLUMN IF NOT EXISTS copyright_text    TEXT;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS published    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS project_date DATE,
  ADD COLUMN IF NOT EXISTS sort_order   INTEGER DEFAULT 0;

ALTER TABLE public.skills        ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.timeline      ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.certificates  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.achievements  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- The old schema only allowed type 'education' / 'experience'.
-- The finished app also supports 'internship' and 'activity'.
ALTER TABLE public.timeline DROP CONSTRAINT IF EXISTS timeline_type_check;
UPDATE public.timeline SET type = 'education' WHERE type IS NULL;
ALTER TABLE public.timeline ALTER COLUMN type SET DEFAULT 'education';
ALTER TABLE public.timeline ALTER COLUMN type SET NOT NULL;

-- site_settings must hold exactly ONE row. If an old/broken admin script
-- created duplicates, keep the most recently updated one.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM public.site_settings;
  IF n > 1 THEN
    RAISE NOTICE 'site_settings had % rows; keeping the most recently updated one.', n;
    DELETE FROM public.site_settings
    WHERE id <> (SELECT id FROM public.site_settings
                 ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id LIMIT 1);
  END IF;
END $$;


-- =====================================================================
-- 3. CONSTRAINTS  (added only if missing; NOT VALID = do not reject
--    rows that already exist, only validate new/updated rows)
-- =====================================================================
DO $$
BEGIN
  -- site_settings: single row + valid theme
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_singleton_chk') THEN
    ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_singleton_chk CHECK (singleton) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_singleton_key') THEN
    ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_singleton_key UNIQUE (singleton);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_theme_chk') THEN
    ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_theme_chk CHECK (
      default_theme IS NULL OR default_theme IN
      ('midnight-dark','minimal-light','cyber-neon','ocean-blue',
       'emerald-green','sunset','glass','monochrome')) NOT VALID;
  END IF;

  -- skills: proficiency 1..10
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skills_level_range_chk') THEN
    ALTER TABLE public.skills ADD CONSTRAINT skills_level_range_chk
      CHECK (level IS NULL OR level BETWEEN 1 AND 10) NOT VALID;
  END IF;

  -- timeline: allowed types + sane dates
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timeline_type_chk') THEN
    ALTER TABLE public.timeline ADD CONSTRAINT timeline_type_chk
      CHECK (type IN ('education','experience','internship','activity')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timeline_dates_chk') THEN
    ALTER TABLE public.timeline ADD CONSTRAINT timeline_dates_chk
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date) NOT VALID;
  END IF;

  -- projects: only http(s) links
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_urls_chk') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_urls_chk CHECK (
      (live_url   IS NULL OR live_url   = '' OR live_url   ~* '^https?://') AND
      (github_url IS NULL OR github_url = '' OR github_url ~* '^https?://') AND
      (image_url  IS NULL OR image_url  = '' OR image_url  ~* '^https?://')) NOT VALID;
  END IF;

  -- certificates: only http(s) links
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certificates_urls_chk') THEN
    ALTER TABLE public.certificates ADD CONSTRAINT certificates_urls_chk CHECK (
      (credential_url IS NULL OR credential_url = '' OR credential_url ~* '^https?://') AND
      (image_url      IS NULL OR image_url      = '' OR image_url      ~* '^https?://')) NOT VALID;
  END IF;

  -- site_settings: only http(s) links
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_urls_chk') THEN
    ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_urls_chk CHECK (
      (github_url    IS NULL OR github_url    = '' OR github_url    ~* '^https?://') AND
      (linkedin_url  IS NULL OR linkedin_url  = '' OR linkedin_url  ~* '^https?://') AND
      (twitter_url   IS NULL OR twitter_url   = '' OR twitter_url   ~* '^https?://') AND
      (instagram_url IS NULL OR instagram_url = '' OR instagram_url ~* '^https?://') AND
      (website_url   IS NULL OR website_url   = '' OR website_url   ~* '^https?://') AND
      (avatar_url    IS NULL OR avatar_url    = '' OR avatar_url    ~* '^https?://') AND
      (about_image_url IS NULL OR about_image_url = '' OR about_image_url ~* '^https?://') AND
      (resume_url    IS NULL OR resume_url    = '' OR resume_url    ~* '^https?://')) NOT VALID;
  END IF;

  -- messages: size limits + basic email shape (stops junk/oversized spam)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_limits_chk') THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_limits_chk CHECK (
      char_length(btrim(name))    BETWEEN 1 AND 100 AND
      char_length(btrim(email))   BETWEEN 3 AND 254 AND
      email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND
      (subject IS NULL OR char_length(subject) <= 200) AND
      char_length(btrim(message)) BETWEEN 1 AND 5000) NOT VALID;
  END IF;
END $$;


-- =====================================================================
-- 4. INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_projects_order       ON public.projects (sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_published   ON public.projects (published);
CREATE INDEX IF NOT EXISTS idx_skills_order         ON public.skills (category, sort_order);
CREATE INDEX IF NOT EXISTS idx_timeline_type_order  ON public.timeline (type, sort_order, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_order   ON public.certificates (sort_order, date_issued DESC);
CREATE INDEX IF NOT EXISTS idx_achievements_order   ON public.achievements (sort_order, date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created     ON public.messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread      ON public.messages (read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_messages_email_time  ON public.messages (lower(email), created_at DESC);


-- =====================================================================
-- 5. FUNCTIONS & TRIGGERS
-- =====================================================================

-- ---- updated_at -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_settings','projects','skills','timeline','certificates','achievements']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- ---- is_admin() : the ONE place that decides who is an administrator ---
-- SECURITY DEFINER so it can read admin_users no matter who asks.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ---- contact-form rate limit: max 3 messages / 10 min per e-mail ------
CREATE OR REPLACE FUNCTION public.messages_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT count(*) FROM public.messages
       WHERE lower(email) = lower(NEW.email)
         AND created_at > NOW() - INTERVAL '10 minutes') >= 3 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.messages_rate_limit() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_messages_rate_limit ON public.messages;
CREATE TRIGGER trg_messages_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_rate_limit();


-- =====================================================================
-- 6. TABLE PRIVILEGES (least privilege, on top of RLS)
-- =====================================================================
REVOKE ALL ON public.site_settings, public.projects, public.skills, public.timeline,
              public.certificates, public.achievements, public.messages, public.admin_users
  FROM anon, authenticated;

-- Visitors may READ portfolio content ...
GRANT SELECT ON public.site_settings, public.projects, public.skills, public.timeline,
                public.certificates, public.achievements TO anon, authenticated;
-- ... and may INSERT a contact message (only these four columns).
GRANT INSERT (name, email, subject, message) ON public.messages TO anon, authenticated;

-- Logged-in users get table privileges, but Row Level Security below only
-- lets users listed in admin_users actually use them.
GRANT INSERT, UPDATE, DELETE ON public.site_settings, public.projects, public.skills,
                                public.timeline, public.certificates, public.achievements
  TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT ON public.admin_users TO authenticated;      -- own row only (RLS)


-- =====================================================================
-- 7. ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users   ENABLE ROW LEVEL SECURITY;

-- ---- remove the OLD insecure policies (any logged-in user = admin) ----
DROP POLICY IF EXISTS "Public read site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "Public read projects"      ON public.projects;
DROP POLICY IF EXISTS "Public read skills"        ON public.skills;
DROP POLICY IF EXISTS "Public read timeline"      ON public.timeline;
DROP POLICY IF EXISTS "Public read certificates"  ON public.certificates;
DROP POLICY IF EXISTS "Public read achievements"  ON public.achievements;
DROP POLICY IF EXISTS "Auth write site_settings"  ON public.site_settings;
DROP POLICY IF EXISTS "Auth write projects"       ON public.projects;
DROP POLICY IF EXISTS "Auth write skills"         ON public.skills;
DROP POLICY IF EXISTS "Auth write timeline"       ON public.timeline;
DROP POLICY IF EXISTS "Auth write certificates"   ON public.certificates;
DROP POLICY IF EXISTS "Auth write achievements"   ON public.achievements;
DROP POLICY IF EXISTS "Auth read messages"        ON public.messages;
DROP POLICY IF EXISTS "Auth write messages"       ON public.messages;
DROP POLICY IF EXISTS "Public insert messages"    ON public.messages;

-- ---- (re)create the new policies ---------------------------------------
-- Public read: visitors can read portfolio content.
DROP POLICY IF EXISTS "public_read" ON public.site_settings;
CREATE POLICY "public_read" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read" ON public.skills;
CREATE POLICY "public_read" ON public.skills        FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read" ON public.timeline;
CREATE POLICY "public_read" ON public.timeline      FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read" ON public.certificates;
CREATE POLICY "public_read" ON public.certificates  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read" ON public.achievements;
CREATE POLICY "public_read" ON public.achievements  FOR SELECT TO anon, authenticated USING (true);

-- Projects: visitors only see PUBLISHED projects (admins see everything).
DROP POLICY IF EXISTS "public_read_published" ON public.projects;
CREATE POLICY "public_read_published" ON public.projects
  FOR SELECT TO anon, authenticated USING (published = TRUE);

-- Admin write: only users listed in admin_users.
DROP POLICY IF EXISTS "admin_all" ON public.site_settings;
CREATE POLICY "admin_all" ON public.site_settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_all" ON public.projects;
CREATE POLICY "admin_all" ON public.projects      FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_all" ON public.skills;
CREATE POLICY "admin_all" ON public.skills        FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_all" ON public.timeline;
CREATE POLICY "admin_all" ON public.timeline      FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_all" ON public.certificates;
CREATE POLICY "admin_all" ON public.certificates  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_all" ON public.achievements;
CREATE POLICY "admin_all" ON public.achievements  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Messages: anyone may SEND (always unread); only admins may read/update/delete.
DROP POLICY IF EXISTS "anyone_can_send" ON public.messages;
CREATE POLICY "anyone_can_send" ON public.messages FOR INSERT TO anon, authenticated
  WITH CHECK (read = FALSE);
DROP POLICY IF EXISTS "admin_select" ON public.messages;
CREATE POLICY "admin_select" ON public.messages FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin_update" ON public.messages;
CREATE POLICY "admin_update" ON public.messages FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_delete" ON public.messages;
CREATE POLICY "admin_delete" ON public.messages FOR DELETE TO authenticated USING (public.is_admin());

-- admin_users: a logged-in user can see ONLY their own row (so the admin
-- page can check "am I an admin?"). There are NO insert/update/delete
-- policies, so nobody can make themselves admin from the browser.
DROP POLICY IF EXISTS "read_own_row" ON public.admin_users;
CREATE POLICY "read_own_row" ON public.admin_users FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- =====================================================================
-- 8. STORAGE  (bucket `portfolio-assets`)
-- =====================================================================
-- Public bucket: image/PDF URLs work for visitors. Only admins can upload,
-- replace or delete. Only these file types, max 5 MB each. (SVG/HTML are
-- deliberately NOT allowed because they can carry scripts.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('portfolio-assets', 'portfolio-assets', TRUE, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = TRUE,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf'];

-- Remove the OLD policies from the previous README (any logged-in user could upload).
DROP POLICY IF EXISTS "Auth upload portfolio-assets"  ON storage.objects;
DROP POLICY IF EXISTS "Public read portfolio-assets"  ON storage.objects;

DROP POLICY IF EXISTS "portfolio_assets_admin_select" ON storage.objects;
CREATE POLICY "portfolio_assets_admin_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'portfolio-assets' AND public.is_admin());
DROP POLICY IF EXISTS "portfolio_assets_admin_insert" ON storage.objects;
CREATE POLICY "portfolio_assets_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'portfolio-assets' AND public.is_admin());
DROP POLICY IF EXISTS "portfolio_assets_admin_update" ON storage.objects;
CREATE POLICY "portfolio_assets_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'portfolio-assets' AND public.is_admin())
  WITH CHECK (bucket_id = 'portfolio-assets' AND public.is_admin());
DROP POLICY IF EXISTS "portfolio_assets_admin_delete" ON storage.objects;
CREATE POLICY "portfolio_assets_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'portfolio-assets' AND public.is_admin());


-- =====================================================================
-- 9. STARTER ROW  (only if the table is empty)
-- =====================================================================
INSERT INTO public.site_settings
  (full_name, job_title, bio, site_title, default_theme, typing_roles, footer_text)
SELECT 'Your Name', 'Computer Science Engineering Student',
       'Write a short biography about yourself in the admin dashboard.',
       'My Portfolio', 'midnight-dark',
       ARRAY['Full-Stack Developer','AI/ML Enthusiast','UI/UX Designer','Problem Solver'],
       'Building the future, one line of code at a time.'
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings);


-- =====================================================================
-- 10. AUTHORIZE YOUR ADMIN ACCOUNT  (ONE-TIME, MANUAL)
-- =====================================================================
-- Step A: Supabase Dashboard -> Authentication -> Users -> "Add user"
--         (create user with your e-mail + password, tick "Auto Confirm User").
--         Public sign-ups are not needed; you may also turn OFF
--         "Allow new users to sign up" under Authentication -> Sign In / Providers.
-- Step B: In the SQL Editor run the statement below with YOUR e-mail.
--         (Remove the leading "--" first.)
--
-- INSERT INTO public.admin_users (user_id, email)
-- SELECT id, email FROM auth.users WHERE email = 'you@example.com'
-- ON CONFLICT (user_id) DO NOTHING;
--
-- Verify:   SELECT * FROM public.admin_users;
-- Revoke:   DELETE FROM public.admin_users WHERE email = 'you@example.com';
-- =====================================================================
