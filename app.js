
(() => {
  "use strict";

  const config = window.GCC_CONFIG || {};
  const API = String(config.apiBase || "").replace(/\/+$/, "");
  const $ = id => document.getElementById(id);

  const state = {
    token: null,
    user: null,
    version: "—",
    view: "overview"
  };

  const moduleInfo = {
    github: ["GitHub Manager", "GitHub repository and activity integration is not connected yet."],
    websites: ["Website Manager", "Netlify site inventory and deployment integration is not connected yet."],
    monitor: ["Live Monitor", "Uptime monitoring requires backend checks and stored results."],
    analytics: ["Analytics", "Analytics will be connected when a reliable data source is available."],
    maintenance: ["Maintenance", "Maintenance controls require server-side authorization and safe rollback."],
    finance: ["Finance Center", "Finance features require a defined scope and data source."]
  };

  function apiUrl(path) {
    if (!API) {
      throw new Error("Backend-ul nu este configurat. Adaugă URL-ul public HTTPS al GCC în config.js.");
    }
    if (!API.startsWith("https://")) {
      throw new Error("API-ul trebuie publicat prin HTTPS înainte de a conecta interfața.");
    }
    return API + path;
  }

  async function request(path, options = {}) {
    const headers = {
      Accept: "application/json",
      ...(options.headers || {})
    };

    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    if (state.token) {
      headers.Authorization = "Bearer " + state.token;
    }

    const response = await fetch(apiUrl(path), {
      ...options,
      headers
    });

    const raw = await response.text();
    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { message: raw || "Invalid server response." };
    }

    if (!response.ok) {
      const error = new Error(
        data.error || data.message || "Request failed: HTTP " + response.status
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function getToken(data) {
    return data.token ||
      data.accessToken ||
      data.access_token ||
      data.sessionToken ||
      (data.session && data.session.token) ||
      null;
  }

  function getUser(data) {
    return data.user || data.account || data.profile || data.me || data;
  }

  function pick(obj, keys, fallback = "—") {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null) {
        return obj[key];
      }
    }
    return fallback;
  }

  function showError(message, element = $("alertBox")) {
    element.textContent = message;
    element.hidden = false;
  }

  function clearError(element = $("alertBox")) {
    element.textContent = "";
    element.hidden = true;
  }

  function setConnection(online) {
    $("connectionDot").classList.toggle("online", online);
    $("connectionText").textContent = online ? "API connected" : "API unavailable";
    $("apiValue").textContent = online ? "Online" : "Offline";
  }

  async function checkHealth() {
    try {
      const data = await request("/api/health");
      state.version = String(data.version || data.apiVersion || "—");

      const cleanVersion = state.version.replace(/^v/, "");
      document.querySelector(".version").textContent =
        "GLYDEX STUDIO · GCC v" + cleanVersion;

      $("versionValue").textContent = state.version;
      $("transportValue").textContent = "HTTPS";
      setConnection(true);
      return true;
    } catch {
      setConnection(false);
      $("transportValue").textContent = API ? "Not connected" : "Not configured";
      $("versionValue").textContent = state.version;
      return false;
    }
  }

  function showLogin() {
    $("loginView").hidden = false;
    $("appView").hidden = true;
    $("logoutButton").hidden = true;
  }

  function showApp() {
    $("loginView").hidden = true;
    $("appView").hidden = false;
    $("logoutButton").hidden = false;

    const email = pick(state.user, ["email", "username", "name"], "Authenticated user");
    const role = pick(state.user, ["role", "accountRole"], "user");

    $("profileEmail").textContent = email;
    $("profileRole").textContent = role;
    $("roleValue").textContent = role;
    $("authValue").textContent = "Authenticated";
    $("avatar").textContent = String(email).charAt(0).toUpperCase();
    $("profileAvatar").textContent = String(email).charAt(0).toUpperCase();

    renderView(state.view);
  }

  async function login(email, password) {
    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    state.token = getToken(data);
    state.user = getUser(data);

    // Verify the session with the backend instead of trusting the login response alone.
    const me = await request("/api/me");
    state.user = getUser(me);

    showApp();
    await loadOverview();
  }

  async function logout() {
    try {
      await request("/api/auth/logout", {
        method: "POST",
        body: "{}"
      });
    } catch (error) {
      console.warn("Logout request:", error.message);
    }

    state.token = null;
    state.user = null;
    state.view = "overview";

    $("password").value = "";
    $("loginMessage").textContent = "Signed out.";
    clearError();
    showLogin();
  }

  async function loadOverview() {
    clearError();
    await checkHealth();

    const role = String(pick(state.user, ["role", "accountRole"], "user"));

    $("usersValue").textContent = "Restricted";
    $("auditValue").textContent = "Restricted";

    if (role !== "root_admin") return;

    try {
      const dashboard = await request("/api/dashboard");
      const data = dashboard.dashboard || dashboard;
      const total = pick(data, ["totalUsers", "userCount", "usersCount"], null);
      if (total !== null) $("usersValue").textContent = String(total);
    } catch (error) {
      if (error.status !== 403) console.warn("Dashboard:", error.message);
    }

    try {
      const result = await request("/api/admin/users");
      const users = Array.isArray(result) ? result : result.users || result.items || [];
      $("usersValue").textContent = String(users.length);
    } catch (error) {
      if (error.status !== 403) console.warn("Users:", error.message);
    }

    try {
      const result = await request("/api/admin/audit?limit=5");
      const events = Array.isArray(result)
        ? result
        : result.events || result.audit || result.items || [];
      const total = pick(result, ["total", "totalEvents", "count"], events.length);
      $("auditValue").textContent = String(total);
    } catch (error) {
      if (error.status !== 403) console.warn("Audit:", error.message);
    }
  }


  function websiteStatus(check) {
    if (!check) return 'Not checked';
    return check.ok ? 'Online' : (check.error || 'Offline');
  }

  function renderWebsiteCards(sites) {
    const host = $('websiteCards');
    host.replaceChildren();

    if (!sites.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'No websites registered.';
      host.appendChild(p);
      return;
    }

    sites.forEach(site => {
      const card = document.createElement('article');
      card.className = 'website-card';

      const main = document.createElement('div');
      main.className = 'website-card-main';

      const title = document.createElement('div');
      title.className = 'website-card-title';

      const name = document.createElement('b');
      name.textContent = site.name;

      const badge = document.createElement('span');
      badge.className = 'site-state ' +
        (site.latestCheck ? (site.latestCheck.ok ? 'site-online' : 'site-offline') : 'site-unknown');
      badge.textContent = websiteStatus(site.latestCheck);
      title.append(name, badge);

      const link = document.createElement('a');
      link.href = site.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = site.url;

      const details = document.createElement('small');
      details.textContent = site.latestCheck
        ? 'HTTP ' + (site.latestCheck.statusCode ?? '—') +
          ' · ' + (site.latestCheck.latencyMs ?? '—') + ' ms · ' +
          formatDate(site.latestCheck.timestamp)
        : 'No check recorded yet.';

      main.append(title, link, details);

      const actions = document.createElement('div');
      actions.className = 'website-card-actions';

      const button = document.createElement('button');
      button.className = 'secondary-button';
      button.textContent = 'Check now';
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'Checking…';
        try {
          await request('/api/websites/' + encodeURIComponent(site.id) + '/check', {
            method: 'POST', body: '{}'
          });
          await loadWebsites();
        } catch (error) {
          showError(error.message);
        } finally {
          button.disabled = false;
          button.textContent = 'Check now';
        }
      });

      actions.appendChild(button);
      card.append(main, actions);
      host.appendChild(card);
    });
  }

  async function loadWebsites() {
    const host = $('websiteCards');
    host.textContent = 'Loading registered websites…';

    try {
      const data = await request('/api/websites');
      const sites = Array.isArray(data.sites) ? data.sites : [];
      const checks = sites.map(site => site.latestCheck).filter(Boolean);
      $('websiteCount').textContent = String(sites.length);
      $('websiteOnline').textContent = String(checks.filter(item => item.ok).length);
      $('websiteFailed').textContent = String(checks.filter(item => !item.ok).length);
      $('netlifyState').textContent = data.netlifyConfigured ? 'Configured' : 'Not set';
      $('netlifyHint').textContent = data.netlifyConfigured
        ? 'Token detected on backend' : 'Token missing on backend';

      $('websiteSummaryTitle').textContent = sites.length + ' website(s) registered';
      $('websiteSummaryText').textContent = 'Live data from the authenticated GCC API.';

      const newest = checks.map(item => item.timestamp).filter(Boolean).sort().pop();
      $('websiteLastChecked').textContent = newest
        ? 'LAST CHECK ' + formatDate(newest) : 'NOT CHECKED';

      renderWebsiteCards(sites);
      await Promise.all([loadNetlify(), loadWebsiteHistory()]);
    } catch (error) {
      host.replaceChildren();
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = error.message;
      host.appendChild(p);
      showError('Website Manager: ' + error.message);
    }
  }

  async function loadNetlify() {
    const host = $('netlifySites');
    host.replaceChildren();

    try {
      const data = await request('/api/websites/netlify');
      const sites = Array.isArray(data.sites) ? data.sites : [];

      if (!sites.length) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = 'No matching Netlify sites found for registered domains.';
        host.appendChild(p);
        return;
      }

      for (const site of sites) {
        const item = document.createElement('div');
        item.className = 'netlify-item';

        const name = document.createElement('b');
        name.textContent = site.name;

        const state = document.createElement('span');
        state.className = 'site-state ' + (site.foundInNetlify ? 'site-online' : 'site-unknown');
        state.textContent = site.foundInNetlify ? 'FOUND' : 'NOT FOUND';

        const url = document.createElement('small');
        url.textContent = site.url;
        item.append(name, state, url);

        for (const deploy of (site.deploys || []).slice(0, 3)) {
          const line = document.createElement('small');
          line.className = 'deploy-line';
          line.textContent = 'Deploy: ' + (deploy.state || 'unknown') +
            ' · ' + formatDate(deploy.createdAt);
          item.appendChild(line);
        }
        host.appendChild(item);
      }

      $('netlifyState').textContent = 'Connected';
      $('netlifyHint').textContent = 'Inventory loaded from Netlify';
    } catch (error) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = error.status === 503
        ? 'Netlify token is not configured on the backend yet.'
        : error.message;
      host.appendChild(p);
      $('netlifyState').textContent = error.status === 503 ? 'Not set' : 'Unavailable';
      $('netlifyHint').textContent = error.status === 503
        ? 'Configure token on backend' : 'API request failed';
    }
  }

  async function loadWebsiteHistory() {
    const body = $('websiteHistoryRows');
    body.replaceChildren();

    try {
      const data = await request('/api/websites/history?limit=50');
      const records = Array.isArray(data.records) ? data.records : [];
      const sitesData = await request('/api/websites');
      const names = Object.fromEntries((sitesData.sites || []).map(site => [site.id, site.name]));

      if (!records.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = 'No checks yet. Press Check all to create real records.';
        row.appendChild(cell);
        body.appendChild(row);
        return;
      }

      records.forEach(record => {
        const row = document.createElement('tr');
        addCell(row, names[record.siteId] || record.siteId);
        addCell(row, record.ok ? 'Online' : (record.error || 'Offline'));
        addCell(row, record.statusCode ?? '—');
        addCell(row, record.latencyMs == null ? '—' : record.latencyMs + ' ms');
        addCell(row, formatDate(record.timestamp));
        body.appendChild(row);
      });
    } catch (error) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = error.message;
      row.appendChild(cell);
      body.appendChild(row);
    }
  }

  async function checkAllWebsites() {
    const button = $('checkAllWebsites');
    button.disabled = true;
    button.textContent = 'Checking…';
    clearError();

    try {
      const result = await request('/api/websites/check', {
        method: 'POST', body: '{}'
      });
      const results = result.results || [];
      const online = results.filter(item => item.ok).length;
      $('websiteSummaryText').textContent =
        'Latest run: ' + online + ' online out of ' + results.length + '.';
      await loadWebsites();
    } catch (error) {
      showError('Website check failed: ' + error.message);
    } finally {
      button.disabled = false;
      button.textContent = '↻ Check all';
    }
  }

  async function addWebsite(event) {
    event.preventDefault();
    const button = $('addWebsiteButton');
    const message = $('websiteFormMessage');
    button.disabled = true;
    message.textContent = '';

    try {
      const name = $('websiteName').value.trim();
      const url = $('websiteUrl').value.trim();
      const result = await request('/api/websites', {
        method: 'POST', body: JSON.stringify({ name, url })
      });
      message.textContent = 'Added: ' + result.site.name;
      $('addWebsiteForm').reset();
      await loadWebsites();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  function renderView(view) {
    state.view = view;
    clearError();

    const labels = {
      overview: ["Overview", "A live view of your workspace."],
      security: ["Security & Logs", "Audit history and access visibility."]
    };

    const info = moduleInfo[view];
    const title = info ? info[0] : (labels[view] || labels.overview)[0];
    const description = info ? info[1] : (labels[view] || labels.overview)[1];

    $("breadcrumb").textContent = title;
    $("pageTitle").textContent = title;
    const titleAccent = document.createElement("span");
    titleAccent.className = "accent";
    titleAccent.textContent = ".";
    $("pageTitle").appendChild(titleAccent);
    $("pageDescription").textContent = description;

    $("overviewView").hidden = view !== "overview";
    $("moduleView").hidden = !info || view === "websites";
    $("websiteView").hidden = view !== "websites";
    $("securityView").hidden = view !== "security";

    document.querySelectorAll(".nav-item").forEach(button => {
      button.classList.toggle("active", button.dataset.view === view);
    });

    if (info) {
      $("moduleTitle").textContent = title;
      $("moduleDescription").textContent = description;
    }

    if (view === "websites") {
      if (pick(state.user, ["role"], "user") !== "root_admin") {
        showError("Website Manager requires root_admin permission.");
      } else {
        loadWebsites();
      }
    }

    if (view === "security") {
      const isAdmin = pick(state.user, ["role"], "user") === "root_admin";
      $("usersPanel").hidden = !isAdmin;
      loadAudit();
      if (isAdmin) loadUsers();
    }
  }

  function addCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = String(value ?? "—");
    row.appendChild(cell);
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  async function loadAudit() {
    const body = $("auditRows");
    body.replaceChildren();

    try {
      const result = await request("/api/admin/audit?limit=20");
      const events = Array.isArray(result)
        ? result
        : result.events || result.audit || result.items || [];

      if (!events.length) {
        body.innerHTML = '<tr><td colspan="3">No audit events found.</td></tr>';
      }

      events.forEach(event => {
        const row = document.createElement("tr");
        addCell(row, pick(event, ["event", "type", "action", "eventType"]));
        addCell(row, pick(event, ["message", "details", "email", "ip", "userId"]));
        addCell(row, formatDate(pick(event, ["timestamp", "createdAt", "time", "date"], null)));
        body.appendChild(row);
      });

      $("auditNote").textContent = "Loaded " + events.length + " event(s).";
    } catch (error) {
      body.innerHTML = '<tr><td colspan="3">Could not load audit records.</td></tr>';
      $("auditNote").textContent =
        error.status === 403
          ? "Access denied by the backend. Root administrator role required."
          : error.message;
    }
  }

  async function loadUsers() {
    const body = $("userRows");
    body.replaceChildren();

    try {
      const result = await request("/api/admin/users");
      const users = Array.isArray(result) ? result : result.users || result.items || [];

      if (!users.length) {
        body.innerHTML = '<tr><td colspan="3">No users found.</td></tr>';
      }

      users.forEach(user => {
        const row = document.createElement("tr");
        addCell(row, pick(user, ["email", "username", "id"]));
        addCell(row, pick(user, ["role"]));
        const active = pick(user, ["active", "isActive", "status"]);
        addCell(row, typeof active === "boolean" ? (active ? "Active" : "Inactive") : active);
        body.appendChild(row);
      });
    } catch (error) {
      body.innerHTML = '<tr><td colspan="3">Could not load users.</td></tr>';
      console.warn("User list:", error.message);
    }
  }

  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    $("loginMessage").textContent = "";
    $("loginButton").disabled = true;
    $("loginButton").textContent = "Signing in...";

    try {
      await login($("email").value.trim(), $("password").value);
      $("password").value = "";
    } catch (error) {
      $("loginMessage").textContent =
        error.status === 401 ? "Email or password is incorrect." : error.message;
    } finally {
      $("loginButton").disabled = false;
      $("loginButton").innerHTML = 'Sign in <span>→</span>';
    }
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      renderView(button.dataset.view);
      $("sidebar").classList.remove("open");
    });
  });

  $("logoutButton").addEventListener("click", logout);
  $("refreshButton").addEventListener("click", () => {
    if (state.view === "overview") loadOverview();
    else renderView(state.view);
  });
  $("reloadAudit").addEventListener("click", loadAudit);
  $("reloadUsers").addEventListener("click", loadUsers);
  $("reloadWebsites").addEventListener("click", loadWebsites);
  $("reloadNetlify").addEventListener("click", loadNetlify);
  $("reloadWebsiteHistory").addEventListener("click", loadWebsiteHistory);
  $("checkAllWebsites").addEventListener("click", checkAllWebsites);
  $("addWebsiteForm").addEventListener("submit", addWebsite);
  $("menuButton").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  checkHealth();
  showLogin();
})();
