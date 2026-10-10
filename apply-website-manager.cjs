'use strict';

const fs = require('node:fs');

const files = ['index.html', 'app.js', 'styles.css'];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error('STOP: lipsește ' + file + '. Intră în directorul frontend.');
    process.exit(1);
  }
}

for (const file of files) {
  fs.copyFileSync(file, file + '.before-website-manager');
}

let html = fs.readFileSync('index.html', 'utf8');
let js = fs.readFileSync('app.js', 'utf8');
let css = fs.readFileSync('styles.css', 'utf8');

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error('Ancoră absentă sau ambiguă: ' + label);
  }
  return source.slice(0, first) + replacement +
    source.slice(first + anchor.length);
}

if (!html.includes('id="websiteView"')) {
  html = replaceOnce(
    html,
    '      <section id="securityView" class="panel table-panel" hidden>',
`      <section id="websiteView" hidden>
        <div class="website-toolbar">
          <div>
            <p class="eyebrow">LIVE WEBSITE OPERATIONS</p>
            <h2 id="websiteSummaryTitle">Website checks</h2>
            <p id="websiteSummaryText" class="muted">Loading backend data…</p>
          </div>
          <div class="website-actions">
            <button id="checkAllWebsites" class="primary-small">↻ Check all</button>
            <button id="reloadWebsites" class="secondary-button">Reload</button>
          </div>
        </div>

        <div class="stats website-stats">
          <article class="stat-card"><span class="stat-label">REGISTERED SITES</span><strong id="websiteCount">—</strong><small>Backend records</small></article>
          <article class="stat-card"><span class="stat-label">ONLINE</span><strong id="websiteOnline">—</strong><small>Latest checks</small></article>
          <article class="stat-card"><span class="stat-label">FAILED</span><strong id="websiteFailed">—</strong><small>Latest checks</small></article>
          <article class="stat-card"><span class="stat-label">NETLIFY API</span><strong id="netlifyState">—</strong><small id="netlifyHint">Backend configuration</small></article>
        </div>

        <article class="panel website-panel">
          <div class="panel-heading">
            <div><h2>Managed websites</h2><p>Real HTTP checks and response latency</p></div>
            <span class="tag" id="websiteLastChecked">NOT CHECKED</span>
          </div>
          <div id="websiteCards" class="website-cards"><p class="muted">Loading…</p></div>
        </article>

        <div class="content-grid website-lower">
          <article class="panel">
            <div class="panel-heading"><div><h2>Add a website</h2><p>Public HTTPS domains only</p></div></div>
            <form id="addWebsiteForm" class="website-form">
              <label for="websiteName">Display name</label>
              <input id="websiteName" maxlength="80" required placeholder="My website">
              <label for="websiteUrl">HTTPS URL</label>
              <input id="websiteUrl" type="url" required placeholder="https://example.com">
              <button class="primary-small" id="addWebsiteButton" type="submit">+ Add website</button>
              <p id="websiteFormMessage" class="form-message" role="status"></p>
            </form>
          </article>
          <article class="panel">
            <div class="panel-heading">
              <div><h2>Netlify integration</h2><p>Site inventory and recent deploys</p></div>
              <button id="reloadNetlify" class="secondary-button">Refresh</button>
            </div>
            <div id="netlifySites" class="netlify-list"><p class="muted">Checking configuration…</p></div>
            <p class="note">The Netlify token stays on the backend. Never put it in config.js.</p>
          </article>
        </div>

        <article class="panel table-panel">
          <div class="panel-heading">
            <div><h2>Recent check history</h2><p>Persistent backend records</p></div>
            <button id="reloadWebsiteHistory" class="secondary-button">Reload history</button>
          </div>
          <div class="table-scroll"><table>
            <thead><tr><th>WEBSITE</th><th>RESULT</th><th>HTTP</th><th>LATENCY</th><th>TIME</th></tr></thead>
            <tbody id="websiteHistoryRows"><tr><td colspan="5">No data loaded.</td></tr></tbody>
          </table></div>
        </article>
      </section>

      <section id="securityView" class="panel table-panel" hidden>`,
    'websiteView'
  );
}

const helpers = `
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

`;

if (!js.includes('function loadWebsites()')) {
  js = replaceOnce(js, '  function renderView(view) {', helpers + '  function renderView(view) {', 'app.js helper insertion');
}

if (!js.includes('websites: ["Website Manager"')) {
  js = replaceOnce(
    js,
    '      security: ["Security & Logs", "Audit history and access visibility."]',
    '      security: ["Security & Logs", "Audit history and access visibility."],\n      websites: ["Website Manager", "Live HTTP checks, stored history and Netlify deployment visibility."]',
    'website title'
  );
}

if (!js.includes('$("websiteView").hidden')) {
  js = replaceOnce(
    js,
    '    $("moduleView").hidden = !info;\n    $("securityView").hidden = view !== "security";',
    '    $("moduleView").hidden = !info || view === "websites";\n    $("websiteView").hidden = view !== "websites";\n    $("securityView").hidden = view !== "security";',
    'website view visibility'
  );
}

if (!js.includes('if (view === "websites")')) {
  js = replaceOnce(
    js,
    '    if (view === "security") {',
    '    if (view === "websites") {\n      if (pick(state.user, ["role"], "user") !== "root_admin") {\n        showError("Website Manager requires root_admin permission.");\n      } else {\n        loadWebsites();\n      }\n    }\n\n    if (view === "security") {',
    'website view loading'
  );
}

if (!js.includes('addWebsiteForm').includes) {
  // This branch is intentionally unused; listener registration is checked below.
}

if (!js.includes('$("checkAllWebsites").addEventListener')) {
  js = replaceOnce(
    js,
    '  $("reloadUsers").addEventListener("click", loadUsers);',
    '  $("reloadUsers").addEventListener("click", loadUsers);\n' +
    '  $("reloadWebsites").addEventListener("click", loadWebsites);\n' +
    '  $("reloadNetlify").addEventListener("click", loadNetlify);\n' +
    '  $("reloadWebsiteHistory").addEventListener("click", loadWebsiteHistory);\n' +
    '  $("checkAllWebsites").addEventListener("click", checkAllWebsites);\n' +
    '  $("addWebsiteForm").addEventListener("submit", addWebsite);',
    'website event listeners'
  );
}

const styles = `
/* Website Manager */
.website-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 14px;padding:15px;border:1px solid #29313d;border-radius:11px;background:#121720}
.website-toolbar h2{font-size:14px;margin:8px 0 4px}
.website-toolbar .eyebrow{margin:0}
.website-actions{display:flex;gap:8px;flex-wrap:wrap}
.primary-small{border:0;border-radius:8px;padding:10px 13px;background:var(--accent);color:#11180c;font-size:10px;font-weight:800;white-space:nowrap}
.primary-small:disabled,.secondary-button:disabled{opacity:.55;cursor:wait}
.website-stats{margin-bottom:14px}
.website-panel{margin-bottom:14px}
.website-cards{display:grid;gap:10px}
.website-card{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:15px;border:1px solid #2a323e;border-radius:9px;background:#0e131a}
.website-card-main{min-width:0;flex:1}
.website-card-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.website-card-title b{font-size:12px}
.website-card a{display:block;width:fit-content;max-width:100%;margin-top:8px;color:#b9e9a0;font-size:10px;overflow-wrap:anywhere;text-decoration:none}
.website-card a:hover{text-decoration:underline}
.website-card small{display:block;margin-top:7px;color:#8490a1;font-size:9px;line-height:1.6;overflow-wrap:anywhere}
.website-card-actions{flex-shrink:0}
.site-state{display:inline-block;border-radius:5px;padding:5px 7px;font:8px 'DM Mono',monospace;white-space:nowrap}
.site-online{color:#c8f8aa;background:#a8f36b12;border:1px solid #a8f36b35}
.site-offline{color:#ffc0c0;background:#ff6b6b12;border:1px solid #ff6b6b35}
.site-unknown{color:#c0c8d4;background:#a5b0c010;border:1px solid #a5b0c02b}
.website-form label{display:block;margin:13px 0 7px;color:#c2cad5;font-size:10px;font-weight:700}
.website-form input{width:100%;padding:12px;background:#0a0e14;color:white;border:1px solid #303948;border-radius:8px;outline:none;font-size:11px}
.website-form input:focus{border-color:var(--accent)}
.website-form button{margin-top:15px}
.form-message{min-height:16px;color:#b9e9a0;font-size:10px;overflow-wrap:anywhere}
.netlify-list{display:grid;gap:10px}
.netlify-item{display:grid;grid-template-columns:1fr auto;gap:7px;padding:12px;border:1px solid #29313d;border-radius:8px;background:#0e131a}
.netlify-item b{font-size:10px;overflow-wrap:anywhere}
.netlify-item small{grid-column:1/-1;color:#8792a2;font-size:9px;overflow-wrap:anywhere}
.netlify-item .site-state{justify-self:end}
.netlify-item .deploy-line{padding-top:6px;border-top:1px solid #29313d}
@media(max-width:720px){.website-toolbar{align-items:flex-start;flex-direction:column}.website-actions{width:100%}.website-card{align-items:flex-start;flex-direction:column}.website-card-actions,.website-card-actions button{width:100%}.website-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

if (!css.includes('/* Website Manager */')) css += '\n' + styles;

fs.writeFileSync('index.html', html);
fs.writeFileSync('app.js', js);
fs.writeFileSync('styles.css', css);

console.log('Website Manager UI added.');
console.log('Backups: index.html.before-website-manager, app.js.before-website-manager, styles.css.before-website-manager');
