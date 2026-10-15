/* ============================================
   PUBLIC PORTFOLIO — script.js
   Visitor-facing behaviour:
   themes, navigation, animations, typing effect,
   data from Supabase, resume, contact form.

   DATABASE TABLES USED (see schema.sql):
     site_settings (1 row) · projects · skills · timeline
     certificates · achievements · messages (insert only)

   SECURITY: database text is NEVER put into innerHTML.
   Everything is built with createElement + textContent,
   and every link/icon/image URL is validated first.
   ============================================ */

(function () {
  'use strict';

  // ──────────────────────────────────────────
  // CONFIGURATION
  // ──────────────────────────────────────────
  const THEMES = [
    'midnight-dark', 'minimal-light', 'cyber-neon', 'ocean-blue',
    'emerald-green', 'sunset', 'glass', 'monochrome'
  ];
  // Older builds saved these names; map them so nobody's saved theme breaks.
  const LEGACY_THEMES = { 'sunset-gradient': 'sunset', 'glassmorphism': 'glass' };
  const THEME_KEY = 'portfolio-theme';                 // visitor's own choice
  const DEFAULT_THEME_KEY = 'portfolio-default-theme'; // cached site default

  const DEFAULT_ROLES = ['Full-Stack Developer', 'AI/ML Enthusiast', 'UI/UX Designer', 'Problem Solver'];
  const TYPEWRITER_SPEED = 80;
  const TYPEWRITER_DELETE_SPEED = 40;
  const TYPEWRITER_PAUSE = 1800;

  const CATEGORY_LABELS = { web: 'Web', ai: 'AI/ML', mobile: 'Mobile', other: 'Other' };
  const EXPERIENCE_TYPES = ['experience', 'internship', 'activity'];
  const TYPE_LABELS = { education: 'Education', experience: 'Experience', internship: 'Internship', activity: 'Activity' };

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ──────────────────────────────────────────
  // SMALL HELPERS
  // ──────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Create an element safely: h('div', {class:'x', text:'hi'}, [children]) */
  function h(tag, props, children) {
    const el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((k) => {
        const v = props[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (children || []).forEach((c) => { if (c) el.appendChild(c); });
    return el;
  }

  /** Only allow http(s) links. Returns the URL string or ''. */
  function safeUrl(u) {
    if (!u || typeof u !== 'string') return '';
    try {
      const url = new URL(u.trim());
      return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
    } catch (e) { return ''; }
  }

  /** Only allow Font Awesome class strings like "fas fa-code". */
  function safeIcon(cls, fallback) {
    if (typeof cls === 'string' && /^fa[srbl]? fa-[a-z0-9-]+( fa-[a-z0-9-]+)*$/.test(cls.trim())) return cls.trim();
    return fallback;
  }

  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254; }

  function icon(cls) { return h('i', { class: cls, 'aria-hidden': 'true' }); }

  /** 'YYYY-MM-DD' -> 'Mar 2024' (no timezone shifting). */
  function fmtMonth(d) {
    if (!d) return '';
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(d);
    if (!m) return '';
    return new Date(+m[1], +m[2] - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  function fmtRange(start, end, current) {
    const a = fmtMonth(start);
    const b = current ? 'Present' : fmtMonth(end);
    if (a && b) return a + ' — ' + b;
    return a || b || '';
  }

  function initialsSvg(name, size) {
    const initials = (String(name || 'Y N').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || 'YN').toUpperCase();
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='" + size + "' height='" + size + "' viewBox='0 0 400 400'>" +
      "<rect fill='#6c63ff' width='400' height='400' rx='200'/>" +
      "<text x='200' y='235' text-anchor='middle' fill='white' font-size='120' font-family='Inter,Arial,sans-serif' font-weight='700'>" +
      initials.replace(/[<>&'\"]/g, '') + '</text></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function placeholderSvg(text) {
    const t = (text || 'P').trim().substring(0, 2).toUpperCase().replace(/[<>&'\"]/g, '');
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#6c63ff'/><stop offset='100%' stop-color='#5a52d9'/></linearGradient></defs>" +
      "<rect fill='url(#g)' width='600' height='400'/>" +
      "<text x='300' y='215' text-anchor='middle' fill='rgba(255,255,255,0.35)' font-size='80' font-family='Inter,Arial,sans-serif' font-weight='700'>" +
      t + '</text></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  /** <img> that falls back to a placeholder if the file is missing or broken. */
  function safeImg(url, alt, fallbackText, extra) {
    const img = h('img', Object.assign({ alt: alt || '', loading: 'lazy', decoding: 'async' }, extra || {}));
    const good = safeUrl(url);
    img.addEventListener('error', () => {
      if (img.dataset.failed) return;
      img.dataset.failed = '1';
      img.src = placeholderSvg(fallbackText);
    });
    img.src = good || placeholderSvg(fallbackText);
    return img;
  }

  function showToast(message, type) {
    const container = $('#toastContainer');
    if (!container) return;
    const t = type || 'info';
    const toast = h('div', { class: 'toast ' + t }, [
      icon('fas ' + (t === 'success' ? 'fa-check-circle' : t === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle')),
      h('span', { text: ' ' + message })
    ]);
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  }

  /** Replace a container's content with a loading / empty / error message. */
  function renderState(container, kind, message, retry) {
    if (!container) return;
    container.replaceChildren();
    const box = h('div', { class: 'state-msg state-' + kind }, [
      icon(kind === 'error' ? 'fas fa-triangle-exclamation' : kind === 'loading' ? 'fas fa-spinner fa-spin' : 'far fa-folder-open'),
      h('span', { text: ' ' + message })
    ]);
    if (retry) {
      const b = h('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Try again' });
      b.addEventListener('click', retry);
      box.appendChild(document.createElement('br'));
      box.appendChild(b);
    }
    container.appendChild(box);
  }

  function setText(sel, value) {
    const el = $(sel);
    if (el && value) el.textContent = value;
  }

  // ──────────────────────────────────────────
  // START-UP
  // ──────────────────────────────────────────
  let siteSettings = null;
  const state = { timeline: [], timelineTab: 'education' };

  function boot() {
    initTheme();
    initNavigation();
    initParticles();
    initTypewriter(DEFAULT_ROLES);
    initScrollAnimations();
    initTimelineTabs();
    initLightbox();
    initContactForm();
    initFooterYear();
    loadPortfolioData();
  }

  // Hide the loading screen after the page loads — with a safety timeout so
  // a slow font/CDN can never leave it stuck on screen.
  function hideLoader() { const l = $('#page-loader'); if (l) l.classList.add('hidden'); }
  window.addEventListener('load', () => setTimeout(hideLoader, 400));
  setTimeout(hideLoader, 4000);

  // ──────────────────────────────────────────
  // THEMES
  // ──────────────────────────────────────────
  function normalizeTheme(t) {
    if (!t) return null;
    const mapped = LEGACY_THEMES[t] || t;
    return THEMES.indexOf(mapped) !== -1 ? mapped : null;
  }

  function getSaved(key) {
    try { return normalizeTheme(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function store(key, value) {
    try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
  }

  function setTheme(theme) {
    const t = normalizeTheme(theme) || THEMES[0];
    document.documentElement.setAttribute('data-theme', t);
    $$('.theme-option').forEach((opt) => {
      const on = opt.dataset.theme === t;
      opt.classList.toggle('active', on);
      opt.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function initTheme() {
    const personal = getSaved(THEME_KEY);
    setTheme(personal || getSaved(DEFAULT_THEME_KEY) || THEMES[0]);

    const toggle = $('#themeToggleBtn');
    const panel = $('#themePanel');
    const closeBtn = $('#closeThemePanel');
    if (!toggle || !panel) return;

    const setOpen = (open) => {
      panel.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { const active = $('.theme-option.active', panel) || $('.theme-option', panel); if (active) active.focus(); }
    };

    toggle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
    closeBtn && closeBtn.addEventListener('click', () => { setOpen(false); toggle.focus(); });
    document.addEventListener('click', (e) => {
      if (panel.classList.contains('open') && !panel.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('open')) { setOpen(false); toggle.focus(); }
    });

    $$('.theme-option').forEach((option) => {
      option.addEventListener('click', () => {
        const theme = normalizeTheme(option.dataset.theme);
        if (!theme) return;
        setTheme(theme);
        store(THEME_KEY, theme);
      });
    });

    // "Use site default" link: forget the visitor's personal choice
    const reset = h('button', { type: 'button', class: 'theme-reset', text: 'Use the site default theme' });
    reset.addEventListener('click', () => {
      store(THEME_KEY, null);
      setTheme((siteSettings && normalizeTheme(siteSettings.default_theme)) || getSaved(DEFAULT_THEME_KEY) || THEMES[0]);
    });
    panel.appendChild(reset);
  }

  /** Called once settings arrive: visitors with no saved choice get the admin's default. */
  function applyDefaultTheme(theme) {
    const def = normalizeTheme(theme);
    if (!def) return;
    store(DEFAULT_THEME_KEY, def);
    if (!getSaved(THEME_KEY)) setTheme(def);
  }

  // ──────────────────────────────────────────
  // NAVIGATION
  // ──────────────────────────────────────────
  function initNavigation() {
    const menuBtn = $('#mobileMenuBtn');
    const menu = $('#navMenu');
    const navbar = $('#navbar');
    const backToTop = $('#backToTop');
    if (!menuBtn || !menu) return;

    const setMenu = (open) => {
      menuBtn.classList.toggle('active', open);
      menu.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    menuBtn.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
    $$('.nav-link', menu).forEach((link) => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('click', (e) => {
      if (menu.classList.contains('open') && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 900) setMenu(false); });

    backToTop && backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });

    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      navbar && navbar.classList.toggle('scrolled', y > 50);
      backToTop && backToTop.classList.toggle('visible', y > 400);

      // Highlight the nav link of the section currently in view
      let current = '';
      $$('.section').forEach((sec) => { if (y >= sec.offsetTop - 140) current = sec.id; });
      if (window.innerHeight + y >= document.documentElement.scrollHeight - 4) current = 'contact';
      $$('.nav-link').forEach((link) => {
        const on = link.dataset.section === current;
        link.classList.toggle('active', on);
        if (on) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
      });
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  // ──────────────────────────────────────────
  // PARTICLES (decorative)
  // ──────────────────────────────────────────
  function initParticles() {
    const box = $('#particles');
    if (!box || reducedMotion) return;
    for (let i = 0; i < 30; i++) {
      const p = h('div', { class: 'particle', 'aria-hidden': 'true' });
      const size = (Math.random() * 4 + 2) + 'px';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (Math.random() * 15 + 10) + 's';
      p.style.animationDelay = Math.random() * 10 + 's';
      p.style.width = size;
      p.style.height = size;
      box.appendChild(p);
    }
  }

  // ──────────────────────────────────────────
  // TYPING EFFECT  (roles come from the admin dashboard)
  // ──────────────────────────────────────────
  let typeTimer = null;
  function initTypewriter(roles) {
    const el = $('#typewriter');
    if (!el) return;
    clearTimeout(typeTimer);
    const words = (roles && roles.length ? roles : DEFAULT_ROLES);

    if (reducedMotion) { el.textContent = words[0]; return; }

    let wordIndex = 0, charIndex = 0, deleting = false;
    function type() {
      const word = words[wordIndex];
      charIndex += deleting ? -1 : 1;
      el.textContent = word.substring(0, charIndex);
      let speed = deleting ? TYPEWRITER_DELETE_SPEED : TYPEWRITER_SPEED;
      if (!deleting && charIndex === word.length) { speed = TYPEWRITER_PAUSE; deleting = true; }
      else if (deleting && charIndex === 0) { deleting = false; wordIndex = (wordIndex + 1) % words.length; speed = 400; }
      typeTimer = setTimeout(type, speed);
    }
    type();
  }

  // ──────────────────────────────────────────
  // SCROLL REVEAL ANIMATIONS
  // ──────────────────────────────────────────
  let revealObserver = null;
  function initScrollAnimations() {
    if (!('IntersectionObserver' in window)) { $$('.animate-on-scroll').forEach((el) => el.classList.add('animated')); return; }
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('animated'); revealObserver.unobserve(entry.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    $$('.animate-on-scroll').forEach((el) => revealObserver.observe(el));
  }
  /** Call after adding new .animate-on-scroll elements. */
  function reveal(root) {
    $$('.animate-on-scroll:not(.animated)', root).forEach((el) => {
      if (revealObserver) revealObserver.observe(el); else el.classList.add('animated');
    });
  }

  // ──────────────────────────────────────────
  // COUNTERS  (real numbers only)
  // ──────────────────────────────────────────
  let counterObserver = null;
  function renderCounters(counts) {
    const wrap = $('#aboutStats');
    if (!wrap) return;
    let any = false;
    const changed = [];
    $$('.stat-card', wrap).forEach((card) => {
      const n = Math.max(0, Math.floor(Number(counts[card.dataset.stat]) || 0));
      card.hidden = n <= 0;
      if (n > 0) {
        any = true;
        const num = $('.stat-number', card);
        if (num.dataset.count !== String(n)) {      // only touch counters whose value changed
          num.dataset.count = String(n);
          num.textContent = reducedMotion ? String(n) : '0';
          changed.push(num);
        }
      }
    });
    wrap.hidden = !any;
    if (!any || reducedMotion) return;

    if (!counterObserver && 'IntersectionObserver' in window) {
      counterObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { animateCount(entry.target); counterObserver.unobserve(entry.target); }
        });
      }, { threshold: 0.5 });
    }
    changed.forEach((n) => {
      counterObserver ? counterObserver.observe(n) : (n.textContent = n.dataset.count);
    });
  }

  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10) || 0;
    const start = performance.now();
    const duration = 1200;
    (function step(now) {
      const p = Math.min((now - start) / duration, 1);
      el.textContent = String(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(step); else el.textContent = String(target);
    })(start);
  }

  // ──────────────────────────────────────────
  // DATA LOADING
  // ──────────────────────────────────────────
  function db() {
    if (typeof _supabase === 'undefined' || !_supabase) return null;
    return _supabase;
  }

  function friendlyError(err) {
    if (!err) return 'Something went wrong.';
    const msg = String(err.message || err);
    if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network problem — please check your connection.';
    if (err.code === '42P01' || /does not exist|schema cache/i.test(msg)) return 'The database is not set up yet (run schema.sql).';
    return 'Could not load this section.';
  }

  async function query(builderFn) {
    const client = db();
    if (!client) return { data: null, error: new Error('Supabase is not available.') };
    try { return await builderFn(client); }
    catch (err) { return { data: null, error: err }; }
  }

  async function loadPortfolioData() {
    if (typeof SUPABASE_CONFIGURED !== 'undefined' && !SUPABASE_CONFIGURED) {
      ['#skillsContainer', '#projectsGrid', '#timelineContainer', '#certificatesGrid', '#achievementsGrid'].forEach((s) =>
        renderState($(s), 'error', 'Supabase is not configured yet — see README.md.'));
      return;
    }
    await Promise.all([
      loadSettings(), loadSkills(), loadProjects(), loadTimeline(), loadCertificates(), loadAchievements()
    ]);
  }

  // ── Site settings (profile + website settings: ONE row) ──
  async function loadSettings() {
    const { data, error } = await query((c) =>
      c.from('site_settings').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle());
    if (error) { console.warn('site_settings:', error.message); setResume(''); return; }
    if (!data) { setResume(''); return; }
    siteSettings = data;
    applySettings(data);
  }

  function applySettings(s) {
    const name = (s.full_name || '').trim();

    if (name) {
      setText('#portfolioOwnerName', name);
      const first = name.split(/\s+/)[0];
      setText('#logoName', first.length > 12 ? first.slice(0, 12) : first);
    }
    setText('#heroDescription', (s.hero_intro || s.tagline || '').trim());
    setText('#aboutBio', (s.bio || '').trim());
    setText('#aboutEducation', (s.education_summary || '').trim());
    setText('#aboutLocation', (s.location || '').trim());
    setText('#contactLocation', (s.location || '').trim());
    setText('#aboutInterests', (s.interests || '').trim());
    setText('#aboutGoal', (s.career_goals || '').trim());

    // Contact details
    const email = (s.contact_email || '').trim();
    const emailEl = $('#contactEmail');
    if (emailEl && isEmail(email)) {
      emailEl.replaceChildren(h('a', { href: 'mailto:' + email, text: email }));
    }
    const phone = (s.phone || '').trim();
    if (phone && /^[+()\d\s.-]{5,25}$/.test(phone)) {
      $('#contactPhoneItem').hidden = false;
      $('#contactPhone').replaceChildren(h('a', { href: 'tel:' + phone.replace(/[^\d+]/g, ''), text: phone }));
    }

    // Photos
    const hero = $('#profilePhoto');
    const aboutImg = $('#aboutPhoto');
    const avatar = safeUrl(s.avatar_url);
    const aboutUrl = safeUrl(s.about_image_url) || avatar;
    if (hero) {
      hero.addEventListener('error', () => { hero.src = initialsSvg(name, 400); }, { once: true });
      hero.src = avatar || initialsSvg(name, 400);
    }
    if (aboutImg && aboutUrl) {
      aboutImg.addEventListener('error', () => { aboutImg.src = initialsSvg(name, 500); }, { once: true });
      aboutImg.src = aboutUrl;
    }

    // Social links
    updateSocialLinks({
      github: s.github_url, linkedin: s.linkedin_url, twitter: s.twitter_url,
      instagram: s.instagram_url, website: s.website_url, email: isEmail(email) ? email : ''
    });

    // Typing effect roles
    const roles = (Array.isArray(s.typing_roles) ? s.typing_roles : []).map((r) => String(r).trim()).filter(Boolean);
    if (roles.length) initTypewriter(roles);
    else if (s.job_title) initTypewriter([String(s.job_title).trim()]);

    // Footer + SEO
    const footerTag = (s.footer_text || s.tagline || '').trim();
    setText('#footerTagline', footerTag);
    const copyright = $('#footerCopyright');
    if (copyright) {
      if ((s.copyright_text || '').trim()) copyright.textContent = s.copyright_text.trim();
      else copyright.textContent = '© ' + new Date().getFullYear() + ' ' + (name || 'Portfolio Owner') + '. All rights reserved.';
    }

    const pageTitle = (s.seo_title || s.site_title || (name ? name + ' — Portfolio' : '')).trim();
    if (pageTitle) {
      document.title = pageTitle;
      setMeta('meta[property="og:title"]', pageTitle);
      setMeta('meta[name="twitter:title"]', pageTitle);
    }
    const desc = (s.seo_description || s.tagline || s.hero_intro || '').trim();
    if (desc) {
      setMeta('meta[name="description"]', desc);
      setMeta('meta[property="og:description"]', desc);
      setMeta('meta[name="twitter:description"]', desc);
    }
    if (name) setMeta('meta[name="author"]', name);
    if (avatar) {
      let og = $('meta[property="og:image"]');
      if (!og) { og = h('meta', { property: 'og:image' }); document.head.appendChild(og); }
      og.setAttribute('content', avatar);
    }

    renderCounters({ years: s.years_coding, projects: counts.projects, certificates: counts.certificates, achievements: counts.achievements });
    applyDefaultTheme(s.default_theme);
    setResume(s.resume_url);
  }
  function setMeta(sel, value) { const m = $(sel); if (m) m.setAttribute('content', value); }

  // counts come from real rows; kept here so counters can refresh as data arrives
  const counts = { projects: 0, certificates: 0, achievements: 0 };
  function refreshCounters() {
    renderCounters({
      years: siteSettings && siteSettings.years_coding,
      projects: counts.projects, certificates: counts.certificates, achievements: counts.achievements
    });
  }

  function updateSocialLinks(map) {
    ['#heroSocials', '#contactSocials', '#footerSocials'].forEach((sel) => {
      const box = $(sel);
      if (!box) return;
      $$('[data-social]', box).forEach((a) => {
        const key = a.dataset.social;
        const val = map[key];
        if (key === 'email') {
          if (val && isEmail(val)) { a.href = 'mailto:' + val; a.hidden = false; } else a.hidden = true;
        } else {
          const url = safeUrl(val);
          if (url) { a.href = url; a.hidden = false; } else a.hidden = true;
        }
      });
    });
  }

  function initFooterYear() {
    const y = $('#footerYear');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  // ── Skills (one row per skill, grouped by category) ──
  function categoryIcon(name) {
    const n = String(name || '').toLowerCase();
    if (/language|programming|coding/.test(n)) return 'fas fa-code';
    if (/web|frontend|front-end|backend|back-end/.test(n)) return 'fas fa-globe';
    if (/data|sql|db/.test(n)) return 'fas fa-database';
    if (/ai|ml|machine|deep/.test(n)) return 'fas fa-brain';
    if (/ui|ux|design/.test(n)) return 'fas fa-paint-brush';
    if (/tool|software|platform|devops/.test(n)) return 'fas fa-tools';
    if (/cloud/.test(n)) return 'fas fa-cloud';
    if (/mobile|android|ios/.test(n)) return 'fas fa-mobile-alt';
    return 'fas fa-layer-group';
  }

  async function loadSkills() {
    const box = $('#skillsContainer');
    const { data, error } = await query((c) =>
      c.from('skills').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }));
    if (error) { renderState(box, 'error', friendlyError(error), loadSkills); return; }
    if (!data || !data.length) { renderState(box, 'empty', 'Skills will appear here soon.'); return; }

    const groups = new Map();
    data.forEach((s) => {
      const key = (s.category || 'Other').trim() || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    });

    box.replaceChildren();
    groups.forEach((skills, category) => {
      const list = h('ul', { class: 'skill-list' });
      skills.forEach((s) => {
        const level = Math.min(10, Math.max(1, parseInt(s.level, 10) || 5));
        const meter = h('div', {
          class: 'skill-meter', role: 'meter', 'aria-valuemin': 1, 'aria-valuemax': 10, 'aria-valuenow': level,
          'aria-label': s.name + ' proficiency ' + level + ' out of 10'
        }, [h('span', { class: 'skill-meter-fill' })]);
        meter.firstChild.style.width = level * 10 + '%';
        list.appendChild(h('li', { class: 'skill-item' }, [
          h('div', { class: 'skill-item-head' }, [
            icon(safeIcon(s.icon_class, 'fas fa-check-circle')),
            h('span', { class: 'skill-name', text: s.name }),
            h('span', { class: 'skill-level', text: level + '/10' })
          ]),
          meter
        ]));
      });
      box.appendChild(h('div', { class: 'skill-category animate-on-scroll' }, [
        h('div', { class: 'skill-category-header' }, [icon(categoryIcon(category)), h('h3', { text: category })]),
        list
      ]));
    });
    reveal(box);
  }

  // ── Projects ──
  async function loadProjects() {
    const grid = $('#projectsGrid');
    const { data, error } = await query((c) =>
      c.from('projects').select('*').eq('published', true)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: false }));
    if (error) { renderState(grid, 'error', friendlyError(error), loadProjects); $('#projectFilters').hidden = true; return; }

    counts.projects = data ? data.length : 0;
    refreshCounters();

    if (!data || !data.length) { renderState(grid, 'empty', 'Projects will appear here soon.'); $('#projectFilters').hidden = true; return; }

    grid.replaceChildren();
    data.forEach((p) => grid.appendChild(buildProjectCard(p)));
    buildProjectFilters(data);
    reveal(grid);
  }

  function buildProjectCard(p) {
    const category = (p.category || 'other').toLowerCase();
    const techs = Array.isArray(p.tech_stack) ? p.tech_stack.filter(Boolean) : [];
    const gh = safeUrl(p.github_url);
    const live = safeUrl(p.live_url);
    const date = fmtMonth(p.project_date);

    const links = h('div', { class: 'project-links' });
    if (gh) links.appendChild(h('a', { href: gh, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Source code for ' + p.title }, [icon('fab fa-github'), document.createTextNode(' Code')]));
    if (live) links.appendChild(h('a', { href: live, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Live demo of ' + p.title }, [icon('fas fa-external-link-alt'), document.createTextNode(' Live Demo')]));

    const imageWrap = h('div', { class: 'project-image' }, [safeImg(p.image_url, p.title, p.title)]);
    if (p.featured) imageWrap.appendChild(h('span', { class: 'project-badge' }, [icon('fas fa-star'), document.createTextNode(' Featured')]));

    return h('article', { class: 'project-card animate-on-scroll' + (p.featured ? ' is-featured' : ''), 'data-category': category }, [
      imageWrap,
      h('div', { class: 'project-content' }, [
        h('h3', { class: 'project-title', text: p.title }),
        date ? h('span', { class: 'project-date', text: date }) : null,
        h('p', { class: 'project-description', text: p.description || '' }),
        techs.length ? h('div', { class: 'project-tags' }, techs.map((t) => h('span', { class: 'project-tag', text: t }))) : null,
        (gh || live) ? links : null
      ])
    ]);
  }

  function buildProjectFilters(projects) {
    const bar = $('#projectFilters');
    const cats = Array.from(new Set(projects.map((p) => (p.category || 'other').toLowerCase())));
    bar.replaceChildren();
    const make = (key, label, active) => {
      const b = h('button', { type: 'button', class: 'filter-btn' + (active ? ' active' : ''), 'data-filter': key, 'aria-pressed': active ? 'true' : 'false', text: label });
      b.addEventListener('click', () => applyProjectFilter(key));
      bar.appendChild(b);
    };
    make('all', 'All', true);
    cats.forEach((c) => make(c, CATEGORY_LABELS[c] || (c.charAt(0).toUpperCase() + c.slice(1)), false));
    bar.hidden = cats.length < 2;     // a single category needs no filter
  }

  function applyProjectFilter(filter) {
    $$('#projectFilters .filter-btn').forEach((b) => {
      const on = b.dataset.filter === filter;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('#projectsGrid .project-card').forEach((card) => {
      const show = filter === 'all' || card.dataset.category === filter;
      card.hidden = !show;
      if (show) card.classList.add('animated');
    });
  }

  // ── Education & experience timeline ──
  function initTimelineTabs() {
    const tabs = $$('.timeline-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-pressed', 'false'); });
        tab.classList.add('active');
        tab.setAttribute('aria-pressed', 'true');
        state.timelineTab = tab.dataset.tab;
        renderTimeline();
      });
    });
  }

  async function loadTimeline() {
    const box = $('#timelineContainer');
    const { data, error } = await query((c) =>
      c.from('timeline').select('*').order('sort_order', { ascending: true }).order('start_date', { ascending: false, nullsFirst: false }));
    if (error) { renderState(box, 'error', friendlyError(error), loadTimeline); return; }
    state.timeline = data || [];
    renderTimeline();
  }

  function renderTimeline() {
    const box = $('#timelineContainer');
    const wantEdu = state.timelineTab === 'education';
    const items = state.timeline.filter((t) => wantEdu ? t.type === 'education' : EXPERIENCE_TYPES.indexOf(t.type) !== -1);
    if (!items.length) {
      renderState(box, 'empty', wantEdu ? 'Education details will appear here soon.' : 'Experience will appear here soon.');
      return;
    }
    box.replaceChildren();
    items.forEach((t) => {
      const range = fmtRange(t.start_date, t.end_date, t.current);
      const orgLine = [t.organization, t.location].filter(Boolean).join(' · ');
      box.appendChild(h('div', { class: 'timeline-item animate-on-scroll' }, [
        h('div', { class: 'timeline-dot' }),
        h('div', { class: 'timeline-card' }, [
          range ? h('span', { class: 'timeline-date', text: range }) : null,
          h('h3', { class: 'timeline-title', text: t.title }),
          !wantEdu && TYPE_LABELS[t.type] && t.type !== 'experience' ? h('span', { class: 'timeline-type', text: TYPE_LABELS[t.type] }) : null,
          orgLine ? h('p', { class: 'timeline-org', text: orgLine }) : null,
          t.description ? h('p', { class: 'timeline-desc', text: t.description }) : null
        ])
      ]));
    });
    reveal(box);
  }

  // ── Certificates ──
  async function loadCertificates() {
    const grid = $('#certificatesGrid');
    const { data, error } = await query((c) =>
      c.from('certificates').select('*').order('sort_order', { ascending: true }).order('date_issued', { ascending: false, nullsFirst: false }));
    if (error) { renderState(grid, 'error', friendlyError(error), loadCertificates); return; }
    counts.certificates = data ? data.length : 0;
    refreshCounters();
    if (!data || !data.length) { renderState(grid, 'empty', 'Certificates will appear here soon.'); return; }

    grid.replaceChildren();
    data.forEach((c) => {
      const imgUrl = safeUrl(c.image_url);
      const verify = safeUrl(c.credential_url);
      const date = fmtMonth(c.date_issued);

      let imageEl;
      if (imgUrl) {
        imageEl = h('button', { type: 'button', class: 'cert-image cert-image-btn', 'aria-label': 'Preview certificate: ' + c.title }, [
          safeImg(imgUrl, c.title, c.title), h('span', { class: 'cert-zoom', 'aria-hidden': 'true' }, [icon('fas fa-search-plus')])
        ]);
        imageEl.addEventListener('click', () => openLightbox($('img', imageEl).src, c.title, [c.issuer, date].filter(Boolean).join(' · ')));
      } else {
        imageEl = h('div', { class: 'cert-image' }, [safeImg('', c.title, c.title)]);
      }

      grid.appendChild(h('article', { class: 'cert-card animate-on-scroll' }, [
        imageEl,
        h('div', { class: 'cert-content' }, [
          h('h3', { class: 'cert-title', text: c.title }),
          c.issuer ? h('p', { class: 'cert-org', text: c.issuer }) : null,
          date ? h('p', { class: 'cert-date', text: date }) : null,
          c.description ? h('p', { class: 'cert-desc', text: c.description }) : null,
          verify ? h('a', { href: verify, target: '_blank', rel: 'noopener noreferrer', class: 'cert-link' }, [icon('fas fa-external-link-alt'), document.createTextNode(' Verify')]) : null
        ])
      ]));
    });
    reveal(grid);
  }

  // Image preview (lightbox)
  let lastFocus = null;
  function initLightbox() {
    const box = $('#lightbox');
    if (!box) return;
    $('#lightboxClose').addEventListener('click', closeLightbox);
    box.addEventListener('click', (e) => { if (e.target === box) closeLightbox(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) closeLightbox(); });
  }
  function openLightbox(src, title, caption) {
    const box = $('#lightbox');
    lastFocus = document.activeElement;
    const img = $('#lightboxImg');
    img.src = src;
    img.alt = title + ' certificate';
    $('#lightboxCaption').textContent = [title, caption].filter(Boolean).join(' — ');
    box.hidden = false;
    document.body.classList.add('no-scroll');
    $('#lightboxClose').focus();
  }
  function closeLightbox() {
    const box = $('#lightbox');
    box.hidden = true;
    $('#lightboxImg').src = '';
    document.body.classList.remove('no-scroll');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ── Achievements ──
  async function loadAchievements() {
    const grid = $('#achievementsGrid');
    const { data, error } = await query((c) =>
      c.from('achievements').select('*').order('sort_order', { ascending: true }).order('date', { ascending: false, nullsFirst: false }));
    if (error) { renderState(grid, 'error', friendlyError(error), loadAchievements); return; }
    counts.achievements = data ? data.length : 0;
    refreshCounters();
    if (!data || !data.length) { renderState(grid, 'empty', 'Achievements will appear here soon.'); return; }

    grid.replaceChildren();
    data.forEach((a) => {
      const date = fmtMonth(a.date);
      grid.appendChild(h('article', { class: 'achievement-card animate-on-scroll' }, [
        h('div', { class: 'achievement-icon' }, [icon(safeIcon(a.icon, 'fas fa-trophy'))]),
        h('h3', { class: 'achievement-title', text: a.title }),
        a.description ? h('p', { class: 'achievement-desc', text: a.description }) : null,
        date ? h('span', { class: 'achievement-date', text: date }) : null
      ]));
    });
    reveal(grid);
  }

  // ── Resume ──
  let resumeBlobUrl = null;
  function setResume(rawUrl) {
    const url = safeUrl(rawUrl);
    const heroBtn = $('#heroResumeBtn');
    const navBtn = $('#navResumeBtn');
    const actions = $('#resumeActions');
    const preview = $('#resumePreview');
    const placeholderText = $('#resumePlaceholderText');

    if (!url) {                              // no resume => NO download buttons
      [heroBtn, navBtn, actions].forEach((el) => el && (el.hidden = true));
      if (placeholderText) placeholderText.textContent = 'Resume not available yet.';
      return;
    }

    const filename = ((siteSettings && siteSettings.full_name) || 'Resume').trim().replace(/[^\w-]+/g, '_') + '_Resume.pdf';
    const download = (e) => {
      e.preventDefault();
      downloadResume(url, filename);
    };
    [heroBtn, $('#resumeDownloadBtn')].forEach((a) => {
      if (!a) return;
      a.href = url; a.hidden = false;
      a.onclick = download;
    });
    if (navBtn) { navBtn.hidden = false; }
    $('#resumeViewBtn').href = url;
    actions.hidden = false;

    // Preview: load lazily when the section is near the screen.
    const small = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (small) {
      if (placeholderText) placeholderText.textContent = 'Tap “View Full Screen” to read my resume.';
      return;
    }
    const loadPreview = () => previewResume(url, preview);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); loadPreview(); }
      }, { rootMargin: '300px' });
      io.observe(preview);
    } else loadPreview();
  }

  /** Fetch the PDF into a blob so it previews reliably inside an <iframe>. */
  async function previewResume(url, container) {
    const note = $('#resumePlaceholderText');
    if (note) note.textContent = 'Loading preview…';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (blob.type && blob.type !== 'application/pdf' && !/pdf/i.test(blob.type)) throw new Error('Not a PDF');
      if (resumeBlobUrl) URL.revokeObjectURL(resumeBlobUrl);
      resumeBlobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      container.replaceChildren(h('iframe', { src: resumeBlobUrl, title: 'Resume preview', loading: 'lazy' }));
    } catch (err) {
      if (note) note.textContent = 'Preview unavailable — use the buttons below to open or download the resume.';
    }
  }

  async function downloadResume(url, filename) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const a = h('a', { href: URL.createObjectURL(blob), download: filename });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (err) {
      // Could not fetch (offline / blocked): fall back to opening the file.
      const w = window.open(url, '_blank', 'noopener');
      if (!w) showToast('Could not download the resume. Please try “View Full Screen”.', 'error');
    }
  }

  // ──────────────────────────────────────────
  // CONTACT FORM
  // ──────────────────────────────────────────
  function initContactForm() {
    const form = $('#contactForm');
    if (!form) return;
    const btn = $('#contactSubmitBtn');
    const statusEl = $('#contactFormStatus');
    let sending = false;
    let last = { key: '', at: 0 };

    const fields = {
      name: { input: $('#contactName'), error: $('#nameError') },
      email: { input: $('#contactEmailInput'), error: $('#emailError') },
      subject: { input: $('#contactSubject'), error: $('#subjectError') },
      message: { input: $('#contactMessage'), error: $('#messageError') }
    };

    const setBusy = (busy) => {
      sending = busy;
      btn.disabled = busy;
      $('.btn-text', btn).style.display = busy ? 'none' : 'inline-flex';
      $('.btn-loader', btn).style.display = busy ? 'inline-flex' : 'none';
      btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    };
    const setStatus = (type, msg) => {
      statusEl.className = 'form-status ' + type;
      statusEl.textContent = msg;
      statusEl.style.display = 'block';
    };
    const clearErrors = () => {
      Object.keys(fields).forEach((k) => { fields[k].error.textContent = ''; fields[k].input.removeAttribute('aria-invalid'); });
      statusEl.className = 'form-status';
      statusEl.style.display = 'none';
    };
    const fail = (key, msg) => { fields[key].error.textContent = msg; fields[key].input.setAttribute('aria-invalid', 'true'); };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;                      // duplicate-click protection
      clearErrors();

      // Honeypot: bots fill the hidden field. Pretend it worked, send nothing.
      if ($('#contactWebsite').value) { form.reset(); setStatus('success', 'Message sent successfully!'); return; }

      const v = {
        name: fields.name.input.value.trim(),
        email: fields.email.input.value.trim(),
        subject: fields.subject.input.value.trim(),
        message: fields.message.input.value.trim()
      };

      let bad = false;
      if (!v.name) { fail('name', 'Name is required.'); bad = true; }
      else if (v.name.length > 100) { fail('name', 'Name must be 100 characters or fewer.'); bad = true; }
      if (!v.email) { fail('email', 'Email is required.'); bad = true; }
      else if (!isEmail(v.email)) { fail('email', 'Please enter a valid email address.'); bad = true; }
      if (!v.subject) { fail('subject', 'Subject is required.'); bad = true; }
      else if (v.subject.length > 200) { fail('subject', 'Subject must be 200 characters or fewer.'); bad = true; }
      if (!v.message) { fail('message', 'Message is required.'); bad = true; }
      else if (v.message.length > 5000) { fail('message', 'Message must be 5000 characters or fewer.'); bad = true; }
      if (bad) {
        const first = Object.keys(fields).find((k) => fields[k].error.textContent);
        first && fields[first].input.focus();
        return;
      }

      // Same message sent again within a minute? Don't create a duplicate.
      const key = JSON.stringify(v);
      if (key === last.key && Date.now() - last.at < 60000) {
        setStatus('success', 'This message was already sent — thank you!');
        return;
      }

      const client = db();
      if (!client) { setStatus('error', 'The contact service is unavailable right now. Please email me directly.'); return; }

      setBusy(true);
      try {
        const { error } = await client.from('messages').insert([v]);
        if (error) throw error;
        last = { key, at: Date.now() };
        form.reset();
        setStatus('success', "Message sent successfully! I'll get back to you soon.");
        showToast('Message sent!', 'success');
      } catch (err) {
        const msg = String((err && err.message) || '');
        let text = 'Failed to send your message. Please try again in a moment.';
        if (/rate_limited/i.test(msg)) text = 'You have sent several messages recently. Please wait a few minutes and try again.';
        else if (/failed to fetch|networkerror|load failed/i.test(msg)) text = 'Network problem — your message was NOT sent. Please check your connection and try again.';
        else if (err && (err.code === '42P01' || /does not exist|schema cache/i.test(msg))) text = 'The contact form is not set up yet (the database table is missing).';
        else if (err && (err.code === '42501' || /row-level security|permission denied/i.test(msg))) text = 'The contact form is not permitted by the database settings (see README: run schema.sql).';
        else if (err && err.code === '23514') text = 'Some of your details were rejected as invalid. Please check them and try again.';
        setStatus('error', text);
        showToast('Message not sent', 'error');
      } finally {
        setBusy(false);
      }
    });
  }

  // Start once everything above has been defined.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
