/* ============================================
   ADMIN DASHBOARD — admin.js
   Real Supabase Auth + server-enforced admin check
   (public.is_admin() / admin_users table, see schema.sql),
   full CRUD for every section, safe uploads.

   Database text is never written with innerHTML:
   everything uses createElement + textContent.
   ============================================ */
(function () {
  'use strict';

  const THEMES = ['midnight-dark', 'minimal-light', 'cyber-neon', 'ocean-blue', 'emerald-green', 'sunset', 'glass', 'monochrome'];
  const LEGACY_THEMES = { 'sunset-gradient': 'sunset', 'glassmorphism': 'glass' };
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };

  // ──────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const val = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
  const setVal = (id, v) => { const el = $('#' + id); if (el) el.value = v === null || v === undefined ? '' : v; };

  function h(tag, props, children) {
    const el = document.createElement(tag);
    if (props) Object.keys(props).forEach((k) => {
      const v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    (children || []).forEach((c) => { if (c) el.appendChild(c); });
    return el;
  }
  const icon = (cls) => h('i', { class: cls, 'aria-hidden': 'true' });

  function safeUrl(u) {
    if (!u || typeof u !== 'string') return '';
    try { const x = new URL(u.trim()); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; }
    catch (e) { return ''; }
  }
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;

  function fmtDate(d) {
    if (!d) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (!m) return '—';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function toast(message, type) {
    const box = $('#toastContainer');
    if (!box) return;
    const t = type || 'info';
    const el = h('div', { class: 'toast ' + t }, [
      icon('fas ' + (t === 'success' ? 'fa-check-circle' : t === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle')),
      h('span', { text: ' ' + message })
    ]);
    box.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  /** Show/clear a message in a .form-status element. */
  function status(el, type, msg) {
    if (!el) return;
    if (!msg) { el.className = 'form-status'; el.textContent = ''; return; }
    el.className = 'form-status ' + type;
    el.textContent = msg;
  }

  /** Disable a button + show its spinner while an async job runs. ALWAYS restores. */
  async function busy(btn, job) {
    if (!btn) return job();
    const text = $('.btn-text', btn), loader = $('.btn-loader', btn);
    if (btn.disabled) return;
    btn.disabled = true; btn.classList.add('is-busy');
    if (text) text.style.display = 'none';
    if (loader) loader.style.display = 'inline-flex';
    try { return await job(); }
    finally {
      btn.disabled = false; btn.classList.remove('is-busy');
      if (text) text.style.display = '';
      if (loader) loader.style.display = 'none';
    }
  }

  function normalizeTheme(t) {
    const m = LEGACY_THEMES[t] || t;
    return THEMES.indexOf(m) !== -1 ? m : null;
  }

  // ──────────────────────────────────────────
  // STATE
  // ──────────────────────────────────────────
  const S = {
    user: null, dashboardReady: false, recovery: false,
    settings: null,            // the single site_settings row
    projects: [], skills: [], timeline: [], certs: [], achievements: [], messages: [],
    msgFilter: 'all', openMessage: null, activePanel: 'overview',
    pending: {}                // per-form pending files / removals
  };

  const client = () => (typeof _supabase !== 'undefined' ? _supabase : null);

  // ──────────────────────────────────────────
  // SESSION / DB ERROR HANDLING
  // ──────────────────────────────────────────
  function isAuthError(err) {
    if (!err) return false;
    const msg = String(err.message || '');
    return err.status === 401 || err.code === 'PGRST301' || /jwt (expired|invalid)|invalid jwt|not authenticated/i.test(msg);
  }

  function dbMessage(err) {
    const msg = String((err && err.message) || err || '');
    if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network problem — please check your connection and try again.';
    if (err && (err.code === '42501' || /row-level security|permission denied/i.test(msg))) return 'Permission denied. Your account is not an authorized administrator (see README).';
    if (err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(msg))) return 'A database table or column is missing. Run the latest schema.sql in Supabase.';
    if (err && err.code === '23514') return 'The database rejected a value as invalid. Please check your input.';
    return msg || 'Something went wrong.';
  }

  /** Run a Supabase call; on an expired session send the user to login. Returns {data,error}. */
  async function run(promise) {
    let res;
    try { res = await promise; } catch (error) { res = { data: null, error }; }
    if (res && res.error && isAuthError(res.error)) { expireSession(); }
    return res;
  }

  function expireSession() {
    if (!S.user) return;
    S.user = null; S.dashboardReady = false;
    showLogin('Your session has expired. Please sign in again.');
  }

  // ──────────────────────────────────────────
  // VIEWS
  // ──────────────────────────────────────────
  function showOnly(which) {
    $('#bootScreen').hidden = true;
    $('#loginPage').hidden = which !== 'login';
    $('#dashboardPage').hidden = which !== 'dashboard';
  }
  function showLoginForm(which) {
    $('#loginForm').hidden = which !== 'login';
    $('#forgotPasswordForm').hidden = which !== 'forgot';
    $('#updatePasswordForm').hidden = which !== 'update';
  }
  function showLogin(banner, type) {
    showOnly('login');
    showLoginForm('login');
    status($('#loginBanner'), type || 'error', banner || '');
  }

  let entering = false;
  async function enterDashboard(user) {
    if (entering) return;
    entering = true;
    try { await enterDashboardInner(user); } finally { entering = false; }
  }
  async function enterDashboardInner(user) {
    // Server-enforced authorization: is this user in admin_users?
    const { data, error } = await run(client().rpc('is_admin'));
    if (error) {
      await client().auth.signOut();
      const missing = error.code === 'PGRST202' || /is_admin/.test(error.message || '');
      showLogin(missing ? 'The database is not set up yet. Run schema.sql in Supabase (see README).' : dbMessage(error));
      return;
    }
    if (data !== true) {
      await client().auth.signOut();
      showLogin('This account is signed in but is not authorized as an administrator. Add it to the admin_users table (README, step “Authorize your admin account”).');
      return;
    }
    S.user = user;
    showOnly('dashboard');
    status($('#loginBanner'), '', '');
    $('#adminEmail').textContent = user.email || '';
    if (!S.dashboardReady) {
      S.dashboardReady = true;
      const saved = localStorage.getItem('adminActivePanel');
      showPanel($('#panel-' + saved) ? saved : 'overview');
    } else {
      showPanel(S.activePanel);
    }
  }

  // ──────────────────────────────────────────
  // AUTH
  // ──────────────────────────────────────────
  async function init() {
    wireStatic();
    initThemeSelect();

    const c = client();
    if (!c || (typeof SUPABASE_CONFIGURED !== 'undefined' && !SUPABASE_CONFIGURED)) {
      showLogin('Supabase is not configured. Check supabase-config.js (see README).');
      $('#loginSubmitBtn').disabled = true;
      return;
    }

    // Error coming back from an email link (expired / already used)
    const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const linkError = hashParams.get('error_description');
    const isRecovery = hashParams.get('type') === 'recovery';

    c.auth.onAuthStateChange((event, session) => {
      // NOTE: no awaited Supabase calls directly inside this callback (can dead-lock) — defer.
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') { S.recovery = true; showOnly('login'); showLoginForm('update'); return; }
        if (event === 'SIGNED_OUT') {
          if (S.user) { S.user = null; S.dashboardReady = false; showLogin('You have been signed out.', 'success'); }
          return;
        }
        if (event === 'SIGNED_IN' && session && !S.recovery && (!S.user || S.user.id !== session.user.id)) {
          enterDashboard(session.user);
        }
      }, 0);
    });

    if (linkError) {
      history.replaceState(null, '', location.pathname);
      showLogin(decodeURIComponent(linkError.replace(/\+/g, ' ')) + ' — please request a new link.');
      return;
    }
    if (isRecovery) { S.recovery = true; showOnly('login'); showLoginForm('update'); return; }

    const { data: { session } } = await c.auth.getSession();
    if (session && session.user) await enterDashboard(session.user);
    else showLogin('');

    // If the tab sat idle and the session is gone, go back to login.
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible' || !S.user) return;
      const { data } = await c.auth.getSession();
      if (!data.session) expireSession();
    });
  }

  function loginErrorText(error) {
    const m = String(error.message || '');
    if (/invalid login credentials/i.test(m)) return 'Incorrect email or password.';
    if (/email not confirmed/i.test(m)) return 'Your email address is not confirmed yet.';
    if (/rate limit|too many/i.test(m) || error.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (/failed to fetch|network/i.test(m)) return 'Network problem — please check your connection.';
    return m || 'Sign-in failed.';
  }

  function wireAuthForms() {
    const toggle = (btnId, inputId) => {
      const btn = $('#' + btnId); if (!btn) return;
      btn.addEventListener('click', () => {
        const input = $('#' + inputId);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        $('i', btn).className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
      });
    };
    toggle('togglePassword', 'loginPassword');
    toggle('toggleNewPassword', 'newPassword');

    $('#showForgotPassword').addEventListener('click', () => { status($('#loginBanner'), '', ''); showLoginForm('forgot'); $('#resetEmail').value = val('loginEmail'); $('#resetEmail').focus(); });
    $('#backToLogin').addEventListener('click', () => { showLoginForm('login'); $('#loginEmail').focus(); });

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = val('loginEmail'), password = $('#loginPassword').value;
      $('#loginEmailError').textContent = ''; $('#loginPasswordError').textContent = '';
      status($('#loginError'), '', ''); status($('#loginBanner'), '', '');
      let bad = false;
      if (!email) { $('#loginEmailError').textContent = 'Email is required.'; bad = true; }
      else if (!isEmail(email)) { $('#loginEmailError').textContent = 'Enter a valid email address.'; bad = true; }
      if (!password) { $('#loginPasswordError').textContent = 'Password is required.'; bad = true; }
      if (bad) return;
      await busy($('#loginSubmitBtn'), async () => {
        const { data, error } = await signIn(email, password);
        if (error) { status($('#loginError'), 'error', loginErrorText(error)); return; }
        $('#loginPassword').value = '';
        // onAuthStateChange(SIGNED_IN) opens the dashboard; if it was already fired, make sure:
        if (data && data.user && !S.user) await enterDashboard(data.user);
      });
    });

    $('#forgotPasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = val('resetEmail');
      $('#resetEmailError').textContent = '';
      if (!isEmail(email)) { $('#resetEmailError').textContent = 'Enter a valid email address.'; return; }
      await busy($('#resetSubmitBtn'), async () => {
        const { error } = await resetPassword(email);
        if (error) status($('#resetStatus'), 'error', loginErrorText(error));
        else status($('#resetStatus'), 'success', 'If that email belongs to an account, a reset link has been sent. Check your inbox (and spam folder).');
      });
    });

    $('#updatePasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = $('#newPassword').value, p2 = $('#confirmNewPassword').value;
      $('#newPasswordError').textContent = ''; $('#confirmNewPasswordError').textContent = '';
      let bad = false;
      if (p1.length < 8) { $('#newPasswordError').textContent = 'Password must be at least 8 characters.'; bad = true; }
      if (p1 !== p2) { $('#confirmNewPasswordError').textContent = 'Passwords do not match.'; bad = true; }
      if (bad) return;
      await busy($('#updatePasswordBtn'), async () => {
        const { error } = await updatePassword(p1);
        if (error) { status($('#updatePasswordStatus'), 'error', loginErrorText(error)); return; }
        status($('#updatePasswordStatus'), 'success', 'Password updated. Opening the dashboard…');
        S.recovery = false;
        history.replaceState(null, '', location.pathname);
        $('#newPassword').value = ''; $('#confirmNewPassword').value = '';
        const { data: { session } } = await client().auth.getSession();
        if (session) await enterDashboard(session.user); else showLogin('Password updated. Please sign in.', 'success');
      });
    });

    $('#logoutBtn').addEventListener('click', async () => {
      await signOut();
      S.user = null; S.dashboardReady = false;
      showLogin('You have been signed out.', 'success');
    });
  }

  // ──────────────────────────────────────────
  // NAVIGATION
  // ──────────────────────────────────────────
  const LOADERS = {
    overview: loadOverview, profile: loadProfile, projects: loadProjects, skills: loadSkills,
    timeline: loadTimeline, certificates: loadCerts, achievements: loadAchievements,
    resume: loadResume, settings: loadSettingsPanel, messages: loadMessages
  };

  function showPanel(id) {
    if (!LOADERS[id]) id = 'overview';
    S.activePanel = id;
    try { localStorage.setItem('adminActivePanel', id); } catch (e) { /* ignore */ }
    $$('.sidebar-link[data-panel]').forEach((b) => b.classList.toggle('active', b.dataset.panel === id));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + id));
    closeSidebar();
    status($('#globalError'), '', '');
    LOADERS[id]();
    window.scrollTo(0, 0);
  }

  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarOverlay').hidden = false; $('#sidebarToggle').setAttribute('aria-expanded', 'true'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarOverlay').hidden = true; $('#sidebarToggle').setAttribute('aria-expanded', 'false'); }

  function initThemeSelect() {
    const sel = $('#adminThemeSelect');
    sel.value = normalizeTheme(document.documentElement.getAttribute('data-theme')) || THEMES[0];
    sel.addEventListener('change', () => {
      const t = normalizeTheme(sel.value); if (!t) return;
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('portfolio-theme', t); } catch (e) { /* ignore */ }
    });
  }

  // ──────────────────────────────────────────
  // MODALS + CONFIRM
  // ──────────────────────────────────────────
  let modalOpener = null;
  function openModal(id) {
    const m = $('#' + id);
    modalOpener = document.activeElement;
    m.hidden = false;
    document.body.classList.add('no-scroll');
    const first = $('input:not([type=hidden]):not([type=file]), select, textarea, button', $('.modal-content', m));
    first && setTimeout(() => first.focus(), 30);
  }
  function closeModal(id) {
    const m = $('#' + id);
    m.hidden = true;
    if (!$$('.modal').some((x) => !x.hidden)) document.body.classList.remove('no-scroll');
    if (modalOpener && modalOpener.focus && document.contains(modalOpener)) modalOpener.focus();
  }

  function confirmAction(message, okText, title) {
    return new Promise((resolve) => {
      const dlg = $('#confirmDialog');
      $('#confirmTitle').textContent = title || 'Confirm action';
      $('#confirmMessage').textContent = message;
      $('#confirmOk').textContent = okText || 'Delete';
      const opener = document.activeElement;
      const done = (v) => {
        dlg.hidden = true;
        $('#confirmOk').onclick = null; $('#confirmCancel').onclick = null;
        if (!$$('.modal').some((x) => !x.hidden)) document.body.classList.remove('no-scroll');
        if (opener && opener.focus && document.contains(opener)) opener.focus();
        resolve(v);
      };
      $('#confirmOk').onclick = () => done(true);
      $('#confirmCancel').onclick = () => done(false);
      dlg.hidden = false;
      document.body.classList.add('no-scroll');
      $('#confirmCancel').focus();
    });
  }

  // ──────────────────────────────────────────
  // FILE UPLOADS (validated by type, size AND file signature)
  // ──────────────────────────────────────────
  async function sniff(file) {
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const hex = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
    if (hex.startsWith('89504e47')) return 'image/png';
    if (hex.startsWith('ffd8ff')) return 'image/jpeg';
    if (hex.startsWith('47494638')) return 'image/gif';
    if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
    if (hex.startsWith('25504446')) return 'application/pdf';
    return '';
  }

  /** Returns an error string, or '' when the file is acceptable. */
  async function checkFile(file, kind) {
    const allowed = kind === 'pdf' ? ['application/pdf'] : IMAGE_TYPES;
    if (!file) return 'No file selected.';
    if (allowed.indexOf(file.type) === -1) return kind === 'pdf' ? 'Please choose a PDF file.' : 'Please choose a JPG, PNG, WebP or GIF image.';
    if (file.size > MAX_FILE_BYTES) return 'File is too large (maximum 5 MB).';
    if (file.size === 0) return 'The file is empty.';
    const real = await sniff(file);
    if (real !== file.type) return 'The file content does not match its type. Please choose a genuine ' + (kind === 'pdf' ? 'PDF.' : 'image.');
    return '';
  }

  async function uploadAsset(file, folder) {
    const rand = Math.random().toString(36).slice(2, 8);
    const path = folder + '/' + Date.now() + '-' + rand + '.' + EXT[file.type];
    const { error } = await run(uploadFile(STORAGE_BUCKET, path, file));
    if (error) throw error;
    return { path, url: getPublicUrl(STORAGE_BUCKET, path) };
  }

  /** Public URL -> storage path (only for files in OUR bucket). */
  function pathFromUrl(url) {
    if (!url) return '';
    const marker = '/storage/v1/object/public/' + STORAGE_BUCKET + '/';
    const i = url.indexOf(marker);
    return i === -1 ? '' : decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  }
  async function deleteAsset(url) {
    const p = pathFromUrl(url);
    if (!p) return;
    const { error } = await run(removeFile(STORAGE_BUCKET, [p]));
    if (error) toast('Saved, but the old file could not be deleted from storage.', 'info');
  }

  /**
   * Wire a file input + preview + remove button.
   * S.pending[key] = { file, remove } is read by the form's save handler.
   */
  function wireImageField(key, fileId, previewId, removeId) {
    const input = $('#' + fileId), preview = $('#' + previewId), rm = $('#' + removeId);
    S.pending[key] = { file: null, remove: false, current: '' };
    let objUrl = null;
    const show = (src) => {
      if (objUrl && src !== objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
      preview.hidden = !src; if (src) preview.src = src;
      rm.hidden = !src;
    };
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const err = await checkFile(f, 'image');
      if (err) { toast(err, 'error'); input.value = ''; return; }
      S.pending[key].file = f; S.pending[key].remove = false;
      objUrl = URL.createObjectURL(f); show(objUrl);
    });
    rm.addEventListener('click', () => {
      S.pending[key].file = null; S.pending[key].remove = true;
      input.value = ''; show('');
    });
    S.pending[key].reset = (currentUrl) => {
      S.pending[key].file = null; S.pending[key].remove = false; S.pending[key].current = currentUrl || '';
      input.value = ''; show(safeUrl(currentUrl));
    };
  }

  /** Apply a pending image change: returns {url, uploaded, oldToDelete}. Throws on upload failure. */
  async function resolveImage(key, folder) {
    const p = S.pending[key];
    if (p.file) { const up = await uploadAsset(p.file, folder); return { url: up.url, uploaded: up.url, oldToDelete: p.current }; }
    if (p.remove) return { url: null, uploaded: null, oldToDelete: p.current };
    return { url: p.current || null, uploaded: null, oldToDelete: '' };
  }

  // ──────────────────────────────────────────
  // GENERIC LIST + REORDER HELPERS
  // ──────────────────────────────────────────
  function listError(container, err, retry) {
    container.replaceChildren(h('p', { class: 'empty-state error', text: dbMessage(err) }));
    if (retry) { const b = h('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Try again' }); b.addEventListener('click', retry); container.firstChild.appendChild(document.createElement('br')); container.firstChild.appendChild(b); }
  }

  function actionButtons(opts) {
    const wrap = h('div', { class: 'admin-item-actions' });
    if (opts.move) {
      const up = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', title: 'Move up', disabled: opts.first }, [icon('fas fa-arrow-up')]);
      const down = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', title: 'Move down', disabled: opts.last }, [icon('fas fa-arrow-down')]);
      up.addEventListener('click', () => opts.move(-1)); down.addEventListener('click', () => opts.move(1));
      wrap.appendChild(up); wrap.appendChild(down);
    }
    const edit = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Edit', title: 'Edit' }, [icon('fas fa-pen')]);
    const del = h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Delete', title: 'Delete' }, [icon('fas fa-trash')]);
    edit.addEventListener('click', opts.edit); del.addEventListener('click', opts.del);
    wrap.appendChild(edit); wrap.appendChild(del);
    return wrap;
  }

  /** Swap an item with its neighbour and renumber sort_order (10, 20, 30 …). */
  async function moveRow(table, rows, index, dir, reload) {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const order = rows.slice();
    const tmp = order[index]; order[index] = order[j]; order[j] = tmp;
    const updates = [];
    order.forEach((r, i) => { const want = (i + 1) * 10; if (r.sort_order !== want) updates.push({ id: r.id, sort_order: want }); });
    const results = await Promise.all(updates.map((u) => run(client().from(table).update({ sort_order: u.sort_order }).eq('id', u.id))));
    const failed = results.find((r) => r.error);
    if (failed) toast('Could not reorder: ' + dbMessage(failed.error), 'error');
    reload();
  }

  const nextOrder = (rows) => rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 10;

  async function deleteRow(table, id, label, reload, afterDeleteUrls) {
    const ok = await confirmAction('Delete “' + label + '”? This cannot be undone.');
    if (!ok) return;
    const { error } = await run(client().from(table).delete().eq('id', id));
    if (error) { toast('Delete failed: ' + dbMessage(error), 'error'); return; }
    (afterDeleteUrls || []).forEach((u) => u && deleteAsset(u));
    toast('Deleted', 'success');
    reload(); refreshCounts();
  }

  function showFormErrors(form, errors) {
    $$('.field-error', form).forEach((e) => e.remove());
    $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
    errors.forEach((er) => {
      const input = $('#' + er.id); if (!input) return;
      input.setAttribute('aria-invalid', 'true');
      input.parentNode.insertBefore(h('span', { class: 'field-error', text: er.msg }), input.nextSibling);
    });
    if (errors.length) { const f = $('#' + errors[0].id); f && f.focus(); }
    return errors.length > 0;
  }

  const urlRule = (id, label) => (val(id) && !safeUrl(val(id)) ? { id, msg: label + ' must start with http:// or https://' } : null);
  const clean = (list) => list.filter(Boolean);

  // ──────────────────────────────────────────
  // OVERVIEW
  // ──────────────────────────────────────────
  async function refreshCounts() {
    const c = client();
    const count = (q) => run(q);
    const [p, s, ce, a, m, u] = await Promise.all([
      count(c.from('projects').select('id', { count: 'exact', head: true })),
      count(c.from('skills').select('id', { count: 'exact', head: true })),
      count(c.from('certificates').select('id', { count: 'exact', head: true })),
      count(c.from('achievements').select('id', { count: 'exact', head: true })),
      count(c.from('messages').select('id', { count: 'exact', head: true })),
      count(c.from('messages').select('id', { count: 'exact', head: true }).eq('read', false))
    ]);
    const put = (id, r) => { $('#' + id).textContent = r.error ? '!' : String(r.count || 0); };
    put('statProjects', p); put('statSkills', s); put('statCerts', ce);
    put('statAchievements', a); put('statMessages', m); put('statUnread', u);
    const unread = u.error ? 0 : (u.count || 0);
    const badge = $('#msgCount');
    badge.textContent = String(unread); badge.hidden = unread === 0;
    const firstErr = [p, s, ce, a, m, u].find((r) => r.error);
    status($('#globalError'), 'error', firstErr ? dbMessage(firstErr.error) : '');
  }

  async function loadOverview() {
    refreshCounts();
    const box = $('#recentMessages');
    const { data, error } = await run(client().from('messages').select('*').order('created_at', { ascending: false }).limit(5));
    if (error) { listError(box, error, loadOverview); return; }
    if (!data.length) { box.replaceChildren(h('p', { class: 'empty-state', text: 'No messages yet.' })); return; }
    box.replaceChildren();
    data.forEach((m) => box.appendChild(messageRow(m)));
  }

  // ──────────────────────────────────────────
  // SITE SETTINGS ROW (profile + website settings share ONE row)
  // ──────────────────────────────────────────
  async function fetchSettings() {
    const { data, error } = await run(client().from('site_settings').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle());
    if (error) throw error;
    S.settings = data || null;
    return S.settings;
  }

  /** Update the single row (or create it if the table is empty). Returns the saved row. */
  async function saveSettings(patch) {
    if (!S.settings) await fetchSettings();
    let res;
    if (S.settings) res = await run(client().from('site_settings').update(patch).eq('id', S.settings.id).select().single());
    else res = await run(client().from('site_settings').insert(patch).select().single());
    if (res.error) throw res.error;
    S.settings = res.data;
    return res.data;
  }

  // ──────────────────────────────────────────
  // PROFILE
  // ──────────────────────────────────────────
  async function loadProfile() {
    try { await fetchSettings(); } catch (err) { status($('#profileForm .form-status'), 'error', dbMessage(err)); return; }
    const s = S.settings || {};
    setVal('profileName', s.full_name); setVal('profileTitle', s.job_title);
    setVal('profileRoles', (s.typing_roles || []).join(', '));
    setVal('profileHeroIntro', s.hero_intro); setVal('profileBio', s.bio);
    setVal('profileEducation', s.education_summary); setVal('profileLocation', s.location);
    setVal('profileInterests', s.interests); setVal('profileGoals', s.career_goals);
    setVal('profileEmail', s.contact_email); setVal('profilePhone', s.phone); setVal('profileYears', s.years_coding);
    setVal('socialGithub', s.github_url); setVal('socialLinkedin', s.linkedin_url); setVal('socialTwitter', s.twitter_url);
    setVal('socialInstagram', s.instagram_url); setVal('socialWebsite', s.website_url);
    S.pending.avatar.reset(s.avatar_url); S.pending.about.reset(s.about_image_url);
    status($('#profileForm .form-status'), '', '');
  }

  function wireProfileForm() {
    wireImageField('avatar', 'profilePhotoFile', 'profilePhotoPreview', 'profilePhotoRemove');
    wireImageField('about', 'aboutPhotoFile', 'aboutPhotoPreview', 'aboutPhotoRemove');
    const form = $('#profileForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('.form-status', form);
      const years = val('profileYears');
      const roles = val('profileRoles').split(',').map((r) => r.trim()).filter(Boolean);
      const errors = clean([
        !val('profileName') ? { id: 'profileName', msg: 'Full name is required.' } : null,
        val('profileEmail') && !isEmail(val('profileEmail')) ? { id: 'profileEmail', msg: 'Enter a valid email address.' } : null,
        val('profilePhone') && !/^[+()\d\s.-]{5,25}$/.test(val('profilePhone')) ? { id: 'profilePhone', msg: 'Use digits, spaces, + ( ) - only.' } : null,
        years && (!/^\d+$/.test(years) || +years > 60) ? { id: 'profileYears', msg: 'Enter a whole number from 0 to 60.' } : null,
        roles.length > 8 || roles.some((r) => r.length > 40) ? { id: 'profileRoles', msg: 'Use at most 8 roles, each up to 40 characters.' } : null,
        urlRule('socialGithub', 'GitHub URL'), urlRule('socialLinkedin', 'LinkedIn URL'), urlRule('socialTwitter', 'Twitter/X URL'),
        urlRule('socialInstagram', 'Instagram URL'), urlRule('socialWebsite', 'Website URL')
      ]);
      if (showFormErrors(form, errors)) { status(st, 'error', 'Please fix the highlighted fields.'); return; }
      status(st, '', '');

      await busy($('#profileSaveBtn'), async () => {
        const uploaded = [];
        try {
          const av = await resolveImage('avatar', 'profile'); if (av.uploaded) uploaded.push(av.uploaded);
          const ab = await resolveImage('about', 'profile'); if (ab.uploaded) uploaded.push(ab.uploaded);
          await saveSettings({
            full_name: val('profileName'), job_title: val('profileTitle') || null, typing_roles: roles,
            hero_intro: val('profileHeroIntro') || null, bio: val('profileBio') || null,
            education_summary: val('profileEducation') || null, location: val('profileLocation') || null,
            interests: val('profileInterests') || null, career_goals: val('profileGoals') || null,
            contact_email: val('profileEmail') || null, phone: val('profilePhone') || null,
            years_coding: years ? parseInt(years, 10) : null,
            github_url: val('socialGithub') || null, linkedin_url: val('socialLinkedin') || null,
            twitter_url: val('socialTwitter') || null, instagram_url: val('socialInstagram') || null,
            website_url: val('socialWebsite') || null,
            avatar_url: av.url, about_image_url: ab.url
          });
          [av.oldToDelete, ab.oldToDelete].forEach((u) => u && deleteAsset(u));   // only after the DB save worked
          S.pending.avatar.reset(av.url); S.pending.about.reset(ab.url);
          status(st, 'success', 'Profile saved. Your public portfolio shows the changes on next load.');
          toast('Profile saved', 'success');
        } catch (err) {
          uploaded.forEach((u) => deleteAsset(u));          // don't leave orphan uploads behind
          status(st, 'error', 'Could not save: ' + dbMessage(err));
        }
      });
    });
  }

  // ──────────────────────────────────────────
  // PROJECTS
  // ──────────────────────────────────────────
  async function loadProjects() {
    const box = $('#projectsList');
    const { data, error } = await run(client().from('projects').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }));
    if (error) { listError(box, error, loadProjects); return; }
    S.projects = data;
    if (!data.length) { box.replaceChildren(h('p', { class: 'empty-state', text: 'No projects yet. Click “Add Project”.' })); return; }
    box.replaceChildren();
    data.forEach((p, i) => {
      const thumb = safeUrl(p.image_url);
      box.appendChild(h('div', { class: 'admin-item' }, [
        h('div', { class: 'admin-item-info' }, [
          thumb ? h('img', { class: 'admin-item-thumb', src: thumb, alt: '', loading: 'lazy' }) : null,
          h('div', { class: 'admin-item-text' }, [
            h('div', { class: 'admin-item-title' }, [document.createTextNode(p.title),
              p.featured ? h('span', { class: 'badge', text: 'Featured' }) : null,
              !p.published ? h('span', { class: 'badge badge-gray', text: 'Draft' }) : null]),
            h('div', { class: 'admin-item-meta', text: [p.category, (p.tech_stack || []).join(', ')].filter(Boolean).join(' · ') })
          ])
        ]),
        actionButtons({
          first: i === 0, last: i === data.length - 1,
          move: (d) => moveRow('projects', S.projects, i, d, loadProjects),
          edit: () => openProjectForm(p),
          del: () => deleteRow('projects', p.id, p.title, loadProjects, [p.image_url])
        })
      ]));
    });
  }

  let editingProject = null;
  function openProjectForm(p) {
    editingProject = p || null;
    $('#projectModalTitle').textContent = p ? 'Edit Project' : 'Add Project';
    const form = $('#projectForm'); showFormErrors(form, []); status($('.form-status', form), '', '');
    setVal('projectTitle', p && p.title); setVal('projectDesc', p && p.description);
    setVal('projectCategory', (p && p.category) || 'web'); setVal('projectDate', p && p.project_date);
    setVal('projectTech', p && (p.tech_stack || []).join(', '));
    setVal('projectGithub', p && p.github_url); setVal('projectLive', p && p.live_url);
    $('#projectFeatured').checked = !!(p && p.featured);
    $('#projectPublished').checked = p ? !!p.published : true;
    S.pending.project.reset(p && p.image_url);
    openModal('projectModal');
  }

  function wireProjectForm() {
    wireImageField('project', 'projectImageFile', 'projectImagePreview', 'projectImageRemove');
    $('#addProjectBtn').addEventListener('click', () => openProjectForm(null));
    const form = $('#projectForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('.form-status', form);
      const tech = Array.from(new Set(val('projectTech').split(',').map((t) => t.trim()).filter(Boolean)));
      const errors = clean([
        !val('projectTitle') ? { id: 'projectTitle', msg: 'Title is required.' } : null,
        tech.length > 20 || tech.some((t) => t.length > 40) ? { id: 'projectTech', msg: 'Use at most 20 technologies, each up to 40 characters.' } : null,
        urlRule('projectGithub', 'GitHub URL'), urlRule('projectLive', 'Live demo URL')
      ]);
      if (showFormErrors(form, errors)) { status(st, 'error', 'Please fix the highlighted fields.'); return; }
      status(st, '', '');
      await busy($('button[type=submit]', form), async () => {
        let uploaded = null;
        try {
          const img = await resolveImage('project', 'projects'); uploaded = img.uploaded;
          const payload = {
            title: val('projectTitle'), description: val('projectDesc') || null, category: val('projectCategory'),
            project_date: val('projectDate') || null, tech_stack: tech,
            github_url: val('projectGithub') || null, live_url: val('projectLive') || null,
            featured: $('#projectFeatured').checked, published: $('#projectPublished').checked, image_url: img.url
          };
          let res;
          if (editingProject) res = await run(client().from('projects').update(payload).eq('id', editingProject.id));
          else { payload.sort_order = nextOrder(S.projects); res = await run(client().from('projects').insert(payload)); }
          if (res.error) throw res.error;
          if (img.oldToDelete) deleteAsset(img.oldToDelete);
          toast(editingProject ? 'Project updated' : 'Project added', 'success');
          closeModal('projectModal'); loadProjects(); refreshCounts();
        } catch (err) {
          if (uploaded) deleteAsset(uploaded);
          status(st, 'error', 'Could not save: ' + dbMessage(err));
        }
      });
    });
  }

  // ──────────────────────────────────────────
  // SKILLS
  // ──────────────────────────────────────────
  async function loadSkills() {
    const box = $('#skillsList');
    const { data, error } = await run(client().from('skills').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }));
    if (error) { listError(box, error, loadSkills); return; }
    S.skills = data;
    const cats = Array.from(new Set(data.map((s) => s.category).filter(Boolean)));
    $('#skillCategoryList').replaceChildren(...cats.map((c) => h('option', { value: c })));
    if (!data.length) { box.replaceChildren(h('p', { class: 'empty-state', text: 'No skills yet. Click “Add Skill”.' })); return; }
    box.replaceChildren();
    data.forEach((s, i) => box.appendChild(h('div', { class: 'admin-item' }, [
      h('div', { class: 'admin-item-info' }, [
        h('div', { class: 'admin-item-text' }, [
          h('div', { class: 'admin-item-title' }, [document.createTextNode(s.name), h('span', { class: 'badge badge-gray', text: s.category || 'Uncategorized' })]),
          h('div', { class: 'admin-item-meta', text: 'Proficiency ' + (s.level || 0) + '/10' })
        ])
      ]),
      actionButtons({
        first: i === 0, last: i === data.length - 1,
        move: (d) => moveRow('skills', S.skills, i, d, loadSkills),
        edit: () => openSkillForm(s), del: () => deleteRow('skills', s.id, s.name, loadSkills)
      })
    ])));
  }

  let editingSkill = null;
  function openSkillForm(s) {
    editingSkill = s || null;
    $('#skillModalTitle').textContent = s ? 'Edit Skill' : 'Add Skill';
    const form = $('#skillForm'); showFormErrors(form, []); status($('.form-status', form), '', '');
    setVal('skillName', s && s.name); setVal('skillCategory', s && s.category);
    const sel = $('#skillIcon'), ic = (s && s.icon_class) || '';
    if (ic && !$$('option', sel).some((o) => o.value === ic)) sel.appendChild(h('option', { value: ic, text: ic }));
    sel.value = ic;
    setVal('skillLevel', (s && s.level) || 5); $('#skillLevelOut').textContent = (s && s.level) || 5;
    openModal('skillModal');
  }

  function wireSkillForm() {
    $('#addSkillBtn').addEventListener('click', () => openSkillForm(null));
    $('#skillLevel').addEventListener('input', () => { $('#skillLevelOut').textContent = $('#skillLevel').value; });
    const form = $('#skillForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('.form-status', form);
      const errors = clean([
        !val('skillName') ? { id: 'skillName', msg: 'Skill name is required.' } : null,
        !val('skillCategory') ? { id: 'skillCategory', msg: 'Category is required.' } : null
      ]);
      if (showFormErrors(form, errors)) return;
      await busy($('button[type=submit]', form), async () => {
        const payload = { name: val('skillName'), category: val('skillCategory'), icon_class: val('skillIcon') || null, level: parseInt(val('skillLevel'), 10) || 5 };
        let res;
        if (editingSkill) res = await run(client().from('skills').update(payload).eq('id', editingSkill.id));
        else { payload.sort_order = nextOrder(S.skills); res = await run(client().from('skills').insert(payload)); }
        if (res.error) { status(st, 'error', 'Could not save: ' + dbMessage(res.error)); return; }
        toast(editingSkill ? 'Skill updated' : 'Skill added', 'success');
        closeModal('skillModal'); loadSkills(); refreshCounts();
      });
    });
  }

  // ──────────────────────────────────────────
  // TIMELINE
  // ──────────────────────────────────────────
  const TYPE_LABEL = { education: 'Education', experience: 'Experience', internship: 'Internship', activity: 'Activity' };

  async function loadTimeline() {
    const box = $('#timelineList');
    const { data, error } = await run(client().from('timeline').select('*').order('sort_order', { ascending: true }).order('start_date', { ascending: false, nullsFirst: false }));
    if (error) { listError(box, error, loadTimeline); return; }
    S.timeline = data;
    if (!data.length) { box.replaceChildren(h('p', { class: 'empty-state', text: 'No entries yet. Click “Add Entry”.' })); return; }
    box.replaceChildren();
    data.forEach((t, i) => box.appendChild(h('div', { class: 'admin-item' }, [
      h('div', { class: 'admin-item-info' }, [h('div', { class: 'admin-item-text' }, [
        h('div', { class: 'admin-item-title' }, [document.createTextNode(t.title),
          h('span', { class: t.type === 'education' ? 'badge' : 'badge badge-green', text: TYPE_LABEL[t.type] || t.type })]),
        h('div', { class: 'admin-item-meta', text: [t.organization, t.location, fmtDate(t.start_date) + ' – ' + (t.current ? 'Present' : fmtDate(t.end_date))].filter(Boolean).join(' · ') })
      ])]),
      actionButtons({
        first: i === 0, last: i === data.length - 1,
        move: (d) => moveRow('timeline', S.timeline, i, d, loadTimeline),
        edit: () => openTimelineForm(t), del: () => deleteRow('timeline', t.id, t.title, loadTimeline)
      })
    ])));
  }

  let editingTimeline = null;
  function syncCurrent() { const cur = $('#timelineCurrent').checked; $('#timelineEnd').disabled = cur; if (cur) $('#timelineEnd').value = ''; }
  function openTimelineForm(t) {
    editingTimeline = t || null;
    $('#timelineModalTitle').textContent = t ? 'Edit Entry' : 'Add Entry';
    const form = $('#timelineForm'); showFormErrors(form, []); status($('.form-status', form), '', '');
    setVal('timelineType', (t && t.type) || 'education'); setVal('timelineTitle', t && t.title);
    setVal('timelineOrg', t && t.organization); setVal('timelineLocation', t && t.location);
    setVal('timelineStart', t && t.start_date); setVal('timelineEnd', t && t.end_date);
    $('#timelineCurrent').checked = !!(t && t.current); syncCurrent();
    setVal('timelineDesc', t && t.description);
    openModal('timelineModal');
  }
  function wireTimelineForm() {
    $('#addTimelineBtn').addEventListener('click', () => openTimelineForm(null));
    $('#timelineCurrent').addEventListener('change', syncCurrent);
    const form = $('#timelineForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('.form-status', form);
      const start = val('timelineStart'), end = val('timelineEnd'), cur = $('#timelineCurrent').checked;
      const errors = clean([
        !val('timelineTitle') ? { id: 'timelineTitle', msg: 'Title is required.' } : null,
        !cur && start && end && end < start ? { id: 'timelineEnd', msg: 'End date cannot be before the start date.' } : null
      ]);
      if (showFormErrors(form, errors)) return;
      await busy($('button[type=submit]', form), async () => {
        const payload = {
          type: val('timelineType'), title: val('timelineTitle'), organization: val('timelineOrg') || null,
          location: val('timelineLocation') || null, start_date: start || null, end_date: cur ? null : (end || null),
          current: cur, description: val('timelineDesc') || null
        };
        let res;
        if (editingTimeline) res = await run(client().from('timeline').update(payload).eq('id', editingTimeline.id));
        else { payload.sort_order = nextOrder(S.timeline); res = await run(client().from('timeline').insert(payload)); }
        if (res.error) { status(st, 'error', 'Could not save: ' + dbMessage(res.error)); return; }
        toast(editingTimeline ? 'Entry updated' : 'Entry added', 'success');
        closeModal('timelineModal'); loadTimeline();
      });
    });
  }

  // ──────────────────────────────────────────
  // CERTIFICATES
  // ──────────────────────────────────────────
  async function loadCerts() {
    const box = $('#certsList');
    const { data, error } = await run(client().from('certificates').select('*').order('sort_order', { ascending: true }).order('date_issued', { ascending: false, nullsFirst: false }));
    if (error) { listError(box, error, loadCerts); return; }
    S.certs = data;
    if (!data.length) { box.replaceChildren(h('p', { class: 'empty-state', text: 'No certificates yet. Click “Add Certificate”.' })); return; }
    box.replaceChildren();
    data.forEach((c, i) => {
      const thumb = safeUrl(c.image_url);
      box.appendChild(h('div', { class: 'admin-item' }, [
        h('div', { class: 'admin-item-info' }, [
          thumb ? h('img', { class: 'admin-item-thumb', src: thumb, alt: '', loading: 'lazy' }) : null,
          h('div', { class: 'admin-item-text' }, [
            h('div', { class: 'admin-item-title', text: c.title }),
            h('div', { class: 'admin-item-meta', text: [c.issuer, fmtDate(c.date_issued)].filter((x) => x && x !== '—').join(' · ') })
          ])
        ]),
        actionButtons({
          first: i === 0, last: i === data.length - 1,
          move: (d) => moveRow('certificates', S.certs, i, d, loadCerts),
          edit: () => openCertForm(c), del: () => deleteRow('certificates', c.id, c.title, loadCerts, [c.image_url])
        })
      ]));
    });
  }

  let editingCert = null;
  function openCertForm(c) {
    editingCert = c || null;
    $('#certModalTitle').textContent = c ? 'Edit Certificate' : 'Add Certificate';
    const form = $('#certForm'); showFormErrors(form, []); status($('.form-status', form), '', '');
    setVal('certTitle', c && c.title); setVal('certIssuer', c && c.issuer); setVal('certDate', c && c.date_issued);
    setVal('certUrl', c && c.credential_url); setVal('certDesc', c && c.description);
    S.pending.cert.reset(c && c.image_url);
    openModal('certModal');
  }
  function wireCertForm() {
    wireImageField('cert', 'certImageFile', 'certImagePreview', 'certImageRemove');
    $('#addCertBtn').addEventListener('click', () => openCertForm(null));
    const form = $('#certForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('.form-status', form);
      const errors = clean([!val('certTitle') ? { id: 'certTitle', msg: 'Title is required.' } : null, urlRule('certUrl', 'Verification URL')]);
      if (showFormErrors(form, errors)) return;
      await busy($('button[type=submit]', form), async () => {
        let uploaded = null;
        try {
          const img = await resolveImage('cert', 'certificates'); uploaded = img.uploaded;
          const payload = {
            title: val('certTitle'), issuer: val('certIssuer') || null, date_issued: val('certDate') || null,
            credential_url: val('certUrl') || null, description: val('certDesc') || null, image_url: img.url
          };
          let res;
          if (editingCert) res = await run(client().from('certificates').update(payload).eq('id', editingCert.id));
          else { payload.sort_order = nextOrder(S.certs); res = await run(client().from('certificates').insert(payload)); }
          if (res.error) throw res.error;
          if (img.oldToDelete) deleteAsset(img.oldToDelete);
          toast(editingCert ? 'Certificate updated' : 'Certificate added', 'success');
          closeModal('certModal'); loadCerts(); refreshCounts();
        } catch (err) {
          if (uploaded) deleteAsset(uploaded);
          status(st, 'error', 'Could not save: ' + dbMessage(err));
        }
      });
    });
  }

  // ──────────────────────────────────────────
  // ACHIEVEMENTS
  // ──────────────────────────────────────────
  async function loadAchievements() {
    const box = $('#achievementsList');
    const { data, error } = await run(client().from('achievements').select('*').order('sort_order', { ascending: true }).order('date', { ascending: false, nullsFirst: false }));
    if (error) { listError(box, error, loadAchievements); return; }
    S.achievements = data;
    if (!data.length) { box.replaceChildren(h('p', { class: 'empty-state', text: 'No achievements yet. Click “Add Achievement”.' })); return; }
    box.replaceChildren();
    data.forEach((a, i) => {
      const ic = /^fa[srbl]? fa-[a-z0-9-]+$/.test(a.icon || '') ? a.icon : 'fas fa-trophy';
      box.appendChild(h('div', { class: 'admin-item' }, [
        h('div', { class: 'admin-item-info' }, [
          h('div', { class: 'stat-widget-icon' }, [icon(ic)]),
          h('div', { class: 'admin-item-text' }, [
            h('div', { class: 'admin-item-title', text: a.title }),
            h('div', { class: 'admin-item-meta', text: fmtDate(a.date) === '—' ? '' : fmtDate(a.date) })
          ])
        ]),
        actionButtons({
          first: i === 0, last: i === data.length - 1,
          move: (d) => moveRow('achievements', S.achievements, i, d, loadAchievements),
          edit: () => openAchievementForm(a), del: () => deleteRow('achievements', a.id, a.title, loadAchievements)
        })
      ]));
    });
  }

  let editingAch = null;
  function openAchievementForm(a) {
    editingAch = a || null;
    $('#achievementModalTitle').textContent = a ? 'Edit Achievement' : 'Add Achievement';
    const form = $('#achievementForm'); showFormErrors(form, []); status($('.form-status', form), '', '');
    setVal('achTitle', a && a.title); setVal('achDate', a && a.date); setVal('achDesc', a && a.description);
    const sel = $('#achIcon'), ic = (a && a.icon) || 'fas fa-trophy';
    if (!$$('option', sel).some((o) => o.value === ic)) sel.appendChild(h('option', { value: ic, text: ic }));
    sel.value = ic;
    openModal('achievementModal');
  }
  function wireAchievementForm() {
    $('#addAchievementBtn').addEventListener('click', () => openAchievementForm(null));
    const form = $('#achievementForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('.form-status', form);
      if (showFormErrors(form, clean([!val('achTitle') ? { id: 'achTitle', msg: 'Title is required.' } : null]))) return;
      await busy($('button[type=submit]', form), async () => {
        const payload = { title: val('achTitle'), date: val('achDate') || null, icon: val('achIcon') || 'fas fa-trophy', description: val('achDesc') || null };
        let res;
        if (editingAch) res = await run(client().from('achievements').update(payload).eq('id', editingAch.id));
        else { payload.sort_order = nextOrder(S.achievements); res = await run(client().from('achievements').insert(payload)); }
        if (res.error) { status(st, 'error', 'Could not save: ' + dbMessage(res.error)); return; }
        toast(editingAch ? 'Achievement updated' : 'Achievement added', 'success');
        closeModal('achievementModal'); loadAchievements(); refreshCounts();
      });
    });
  }

  // ──────────────────────────────────────────
  // RESUME
  // ──────────────────────────────────────────
  let adminBlobUrl = null;
  async function loadResume() {
    const info = $('#currentResumeInfo'), actions = $('#resumeCurrentActions'), prev = $('#resumePreviewAdmin');
    prev.replaceChildren();
    try { await fetchSettings(); } catch (err) { info.textContent = dbMessage(err); actions.hidden = true; return; }
    const url = safeUrl(S.settings && S.settings.resume_url);
    status($('#resumeForm .form-status'), '', '');
    if (!url) { info.textContent = 'No resume uploaded yet. Visitors will not see a download button until you upload one.'; actions.hidden = true; return; }
    info.textContent = 'A resume is live on your portfolio.' + (S.settings.updated_at ? ' Last settings update: ' + fmtDateTime(S.settings.updated_at) : '');
    actions.hidden = false;
    $('#resumeOpenLink').href = url; $('#resumeDownloadLink').href = url;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (adminBlobUrl) URL.revokeObjectURL(adminBlobUrl);
      adminBlobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      prev.appendChild(h('iframe', { src: adminBlobUrl, title: 'Resume preview' }));
    } catch (err) {
      info.textContent += ' (The file could not be loaded for preview — it may have been deleted from Storage. Upload it again.)';
    }
  }

  function wireResume() {
    $('#resumeDownloadLink').addEventListener('click', async (e) => {
      e.preventDefault();
      const url = safeUrl(S.settings && S.settings.resume_url); if (!url) return;
      try {
        const blob = await (await fetch(url)).blob();
        const a = h('a', { href: URL.createObjectURL(blob), download: 'Resume.pdf' });
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (err) { window.open(url, '_blank', 'noopener'); }
    });

    const form = $('#resumeForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('.form-status', form);
      const f = $('#resumeFile').files[0];
      const err = f ? await checkFile(f, 'pdf') : 'Choose a PDF file first.';
      if (err) { status(st, 'error', err); return; }
      await busy($('#resumeUploadBtn'), async () => {
        let uploaded = null;
        try {
          await fetchSettings();
          const old = S.settings && S.settings.resume_url;
          const up = await uploadAsset(f, 'resume'); uploaded = up.url;
          await saveSettings({ resume_url: up.url });
          if (old) deleteAsset(old);
          $('#resumeFile').value = '';
          status(st, 'success', 'Resume uploaded. It is now live on your portfolio.');
          toast('Resume uploaded', 'success');
          loadResume();
        } catch (e2) {
          if (uploaded) deleteAsset(uploaded);
          status(st, 'error', 'Upload failed: ' + dbMessage(e2));
        }
      });
    });

    $('#resumeRemoveBtn').addEventListener('click', async () => {
      const ok = await confirmAction('Remove your resume? The download buttons will disappear from your portfolio.', 'Remove');
      if (!ok) return;
      const st = $('#resumeForm .form-status');
      try {
        const old = S.settings && S.settings.resume_url;
        await saveSettings({ resume_url: null });
        if (old) deleteAsset(old);
        toast('Resume removed', 'success'); loadResume();
      } catch (err) { status(st, 'error', 'Could not remove: ' + dbMessage(err)); }
    });
  }

  // ──────────────────────────────────────────
  // WEBSITE SETTINGS
  // ──────────────────────────────────────────
  async function loadSettingsPanel() {
    const st = $('#settingsForm .form-status');
    try { await fetchSettings(); } catch (err) { status(st, 'error', dbMessage(err)); return; }
    const s = S.settings || {};
    setVal('settingSiteTitle', s.site_title); setVal('settingTagline', s.tagline);
    setVal('settingDefaultTheme', normalizeTheme(s.default_theme) || 'midnight-dark');
    setVal('settingSeoTitle', s.seo_title); setVal('settingSeoDesc', s.seo_description);
    setVal('settingFooterText', s.footer_text); setVal('settingCopyright', s.copyright_text);
    status(st, '', '');
  }
  function wireSettings() {
    const form = $('#settingsForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('.form-status', form);
      const theme = normalizeTheme(val('settingDefaultTheme'));
      if (!theme) { status(st, 'error', 'Choose a valid theme.'); return; }
      await busy($('#settingsSaveBtn'), async () => {
        try {
          await saveSettings({
            site_title: val('settingSiteTitle') || null, tagline: val('settingTagline') || null, default_theme: theme,
            seo_title: val('settingSeoTitle') || null, seo_description: val('settingSeoDesc') || null,
            footer_text: val('settingFooterText') || null, copyright_text: val('settingCopyright') || null
          });
          status(st, 'success', 'Settings saved.'); toast('Settings saved', 'success');
        } catch (err) { status(st, 'error', 'Could not save: ' + dbMessage(err)); }
      });
    });
  }

  // ──────────────────────────────────────────
  // MESSAGES
  // ──────────────────────────────────────────
  function messageRow(m) {
    const row = h('div', { class: 'admin-item' + (m.read ? '' : ' unread') }, [
      h('div', { class: 'admin-item-info' }, [h('div', { class: 'admin-item-text' }, [
        h('div', { class: 'admin-item-title' }, [document.createTextNode(m.name), !m.read ? h('span', { class: 'badge badge-new', text: 'New' }) : null]),
        h('div', { class: 'admin-item-meta', text: (m.subject || '(No subject)') + ' · ' + m.email + ' · ' + fmtDateTime(m.created_at) })
      ])])
    ]);
    const open = h('button', { type: 'button', class: 'btn btn-outline btn-sm' }, [icon('fas fa-eye'), document.createTextNode(' View')]);
    open.addEventListener('click', () => openMessage(m));
    row.appendChild(h('div', { class: 'admin-item-actions' }, [open]));
    return row;
  }

  async function loadMessages() {
    const box = $('#messagesList');
    let q = client().from('messages').select('*').order('created_at', { ascending: false });
    if (S.msgFilter === 'unread') q = q.eq('read', false);
    const { data, error } = await run(q);
    if (error) { listError(box, error, loadMessages); return; }
    S.messages = data;
    refreshCounts();
    if (!data.length) { box.replaceChildren(h('p', { class: 'empty-state', text: S.msgFilter === 'unread' ? 'No unread messages.' : 'No messages yet.' })); return; }
    box.replaceChildren(...data.map(messageRow));
  }

  function renderMessageModal() {
    const m = S.openMessage;
    $('#msgFrom').textContent = m.name;
    const mail = isEmail(m.email) ? h('a', { href: 'mailto:' + m.email, text: m.email }) : document.createTextNode(m.email);
    $('#msgEmail').replaceChildren(mail);
    $('#msgSubject').textContent = m.subject || '(No subject)';
    $('#msgDate').textContent = fmtDateTime(m.created_at);
    $('#msgStatus').textContent = m.read ? 'Read' : 'Unread';
    $('#msgBody').textContent = m.message;
    $('#msgToggleRead').replaceChildren(icon(m.read ? 'fas fa-envelope' : 'fas fa-envelope-open'), document.createTextNode(m.read ? ' Mark as unread' : ' Mark as read'));
    const reply = $('#msgReply');
    if (isEmail(m.email)) reply.href = 'mailto:' + m.email + '?subject=' + encodeURIComponent('Re: ' + (m.subject || ''));
    else reply.removeAttribute('href');
  }

  async function setRead(m, read) {
    const { error } = await run(client().from('messages').update({ read }).eq('id', m.id));
    if (error) { toast('Could not update: ' + dbMessage(error), 'error'); return false; }
    m.read = read; return true;
  }

  async function openMessage(m) {
    S.openMessage = m;
    renderMessageModal();
    openModal('messageModal');
    if (!m.read && await setRead(m, true)) { renderMessageModal(); loadMessages(); if (S.activePanel === 'overview') loadOverview(); }
  }

  function wireMessages() {
    $$('[data-msg-filter]').forEach((b) => b.addEventListener('click', () => {
      S.msgFilter = b.dataset.msgFilter;
      $$('[data-msg-filter]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      loadMessages();
    }));
    $('#msgToggleRead').addEventListener('click', async () => {
      const m = S.openMessage; if (!m) return;
      if (await setRead(m, !m.read)) { renderMessageModal(); toast(m.read ? 'Marked as read' : 'Marked as unread', 'success'); loadMessages(); if (S.activePanel === 'overview') loadOverview(); }
    });
    $('#msgDelete').addEventListener('click', async () => {
      const m = S.openMessage; if (!m) return;
      const ok = await confirmAction('Delete the message from “' + m.name + '”? This cannot be undone.');
      if (!ok) return;
      const { error } = await run(client().from('messages').delete().eq('id', m.id));
      if (error) { toast('Delete failed: ' + dbMessage(error), 'error'); return; }
      closeModal('messageModal'); S.openMessage = null;
      toast('Message deleted', 'success'); loadMessages(); if (S.activePanel === 'overview') loadOverview();
    });
  }

  // ──────────────────────────────────────────
  // STATIC WIRING (runs ONCE — never inside login, so no duplicate listeners)
  // ──────────────────────────────────────────
  function wireStatic() {
    wireAuthForms();
    wireProfileForm(); wireProjectForm(); wireSkillForm(); wireTimelineForm();
    wireCertForm(); wireAchievementForm(); wireResume(); wireSettings(); wireMessages();

    $$('.sidebar-link[data-panel]').forEach((b) => b.addEventListener('click', () => showPanel(b.dataset.panel)));
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      showPanel(b.dataset.goto);
      if (b.dataset.action === 'add') {
        const map = { projects: () => openProjectForm(null), skills: () => openSkillForm(null), certificates: () => openCertForm(null) };
        map[b.dataset.goto] && map[b.dataset.goto]();
      }
    }));
    $('#sidebarToggle').addEventListener('click', () => ($('#sidebar').classList.contains('open') ? closeSidebar() : openSidebar()));
    $('#sidebarOverlay').addEventListener('click', closeSidebar);

    // Modal close buttons, backdrop, Escape, focus trap
    $$('.modal').forEach((m) => {
      if (m.id === 'confirmDialog') return;
      $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => closeModal(m.id)));
      m.addEventListener('mousedown', (e) => { if (e.target === m) closeModal(m.id); });
    });
    document.addEventListener('keydown', (e) => {
      const open = $$('.modal').filter((m) => !m.hidden);
      if (!open.length) { if (e.key === 'Escape') closeSidebar(); return; }
      const top = open[open.length - 1];
      if (e.key === 'Escape') { top.id === 'confirmDialog' ? $('#confirmCancel').click() : closeModal(top.id); return; }
      if (e.key === 'Tab') {
        const f = $$('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea', top).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
