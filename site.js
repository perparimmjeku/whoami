// site.js — shared helpers

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return "—";
  }
}

async function gh(url) {
  // GitHub API (unauthenticated). If you hit rate limits, you can later add a token via a serverless proxy.
  const r = await fetch(url, { headers: { "Accept": "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub API error: ${r.status}`);
  return r.json();
}

function safeText(s, fallback="—") {
  return (typeof s === "string" && s.trim().length) ? s : fallback;
}

function setYear() {
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
}

function applyConfig() {
  const cfg = window.SITE_CONFIG || {};
  document.querySelectorAll("[data-name]").forEach(n => n.textContent = cfg.name || "Your Name");
  document.querySelectorAll("[data-role]").forEach(n => n.textContent = cfg.role || "Role");
  document.querySelectorAll("[data-location]").forEach(n => n.textContent = cfg.location || "Location");

  const li = document.querySelector("[data-linkedin]");
  if (li && cfg.linkedin) li.setAttribute("href", cfg.linkedin);

  const em = document.querySelector("[data-email]");
  if (em && cfg.email) em.setAttribute("href", `mailto:${cfg.email}`);

  const tag = document.querySelector("[data-tagline]");
  if (tag && cfg.tagline) tag.textContent = cfg.tagline;

  const focus = document.querySelector("[data-focus]");
  if (focus && Array.isArray(cfg.focus)) {
    focus.innerHTML = "";
    cfg.focus.slice(0, 14).forEach(x => focus.appendChild(el("span", { class: "chip" }, [x])));
  }

  const exp = document.querySelector("[data-experience]");
  if (exp && Array.isArray(cfg.experience)) {
    exp.innerHTML = "";
    cfg.experience.forEach(job => {
      const box = el("div", { class: "repo" }, [
        el("h4", {}, [safeText(job.title)]),
        el("p", {}, [`${safeText(job.company)} · ${safeText(job.period)} · ${safeText(job.place)}`]),
        ...(Array.isArray(job.bullets) ? [el("ul", {}, job.bullets.map(b => el("li", {}, [b])))] : [])
      ]);
      exp.appendChild(box);
    });
  }

  const ql = document.querySelector("[data-quicklinks]");
  if (ql && Array.isArray(cfg.links)) {
    ql.innerHTML = "";
    cfg.links.forEach(l => {
      ql.appendChild(el("a", { class: "btn secondary", href: l.href, target: "_blank", rel: "noopener noreferrer" }, [l.label]));
    });
  }
}

async function loadGitHubStats({ user, statsRoot, reposRoot, reposLimit = 6 }) {
  const statsEl = document.querySelector(statsRoot);
  const reposEl = document.querySelector(reposRoot);
  if (!user) {
    if (statsEl) statsEl.innerHTML = `<p class="smallnote">Set <span class="code">githubUser</span> in <span class="code">config.js</span> to enable live GitHub stats.</p>`;
    if (reposEl) reposEl.innerHTML = `<p class="smallnote">Set <span class="code">githubUser</span> in <span class="code">config.js</span> to show featured repos.</p>`;
    return;
  }

  try {
    const profile = await gh(`https://api.github.com/users/${encodeURIComponent(user)}`);
    if (statsEl) {
      statsEl.innerHTML = "";
      const items = [
        { k: "Followers", v: profile.followers ?? 0 },
        { k: "Public Repos", v: profile.public_repos ?? 0 },
        { k: "Following", v: profile.following ?? 0 },
        { k: "Created", v: fmtDate(profile.created_at) }
      ];
      items.forEach(i => statsEl.appendChild(
        el("div", { class: "stat" }, [
          el("div", { class: "k" }, [i.k]),
          el("div", { class: "v" }, [String(i.v)])
        ])
      ));
    }

    const repos = await gh(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`);
    const pick = repos
      .filter(r => !r.fork)
      .sort((a,b) => new Date(b.pushed_at) - new Date(a.pushed_at))
      .slice(0, reposLimit);

    if (reposEl) {
      reposEl.innerHTML = "";
      pick.forEach(r => {
        reposEl.appendChild(
          el("div", { class: "repo" }, [
            el("h4", {}, [el("a", { href: r.html_url, target: "_blank", rel: "noopener noreferrer" }, [r.name])]),
            el("p", {}, [safeText(r.description, "No description yet — shipping soon.")]),
            el("div", { class: "meta" }, [
              el("span", {}, [`★ ${r.stargazers_count}`]),
              el("span", {}, [`⑂ ${r.forks_count}`]),
              el("span", {}, [`⎇ ${safeText(r.language, "—")}`]),
              el("span", {}, [`Updated ${fmtDate(r.pushed_at)}`])
            ])
          ])
        );
      });
    }

    // Optional: set GitHub link button if present
    const ghBtn = document.querySelector("[data-github]");
    if (ghBtn) ghBtn.setAttribute("href", profile.html_url);

  } catch (e) {
    if (statsEl) statsEl.innerHTML = `<p class="smallnote">Could not load GitHub data right now (rate limit or network). Try again later.</p>`;
    if (reposEl) reposEl.innerHTML = `<p class="smallnote">Could not load repos right now.</p>`;
  }
}

async function loadProjectsPage({ user, listRoot, queryRoot, sortRoot }) {
  const listEl = document.querySelector(listRoot);
  const qEl = document.querySelector(queryRoot);
  const sEl = document.querySelector(sortRoot);

  if (!user) {
    listEl.innerHTML = `<p class="smallnote">Set <span class="code">githubUser</span> in <span class="code">config.js</span> to load projects.</p>`;
    return;
  }

  let repos = [];
  try {
    repos = await gh(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`);
  } catch {
    listEl.innerHTML = `<p class="smallnote">Could not load GitHub repos right now.</p>`;
    return;
  }

  function render() {
    const q = (qEl.value || "").toLowerCase().trim();
    const sort = sEl.value;

    let filtered = repos.filter(r => !r.fork);
    if (q) {
      filtered = filtered.filter(r =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.language || "").toLowerCase().includes(q)
      );
    }

    if (sort === "stars") filtered.sort((a,b) => (b.stargazers_count||0) - (a.stargazers_count||0));
    else if (sort === "name") filtered.sort((a,b) => (a.name||"").localeCompare(b.name||""));
    else filtered.sort((a,b) => new Date(b.pushed_at) - new Date(a.pushed_at)); // updated

    listEl.innerHTML = "";
    filtered.slice(0, 40).forEach(r => {
      listEl.appendChild(
        el("div", { class: "repo" }, [
          el("h4", {}, [el("a", { href: r.html_url, target: "_blank", rel: "noopener noreferrer" }, [r.name])]),
          el("p", {}, [safeText(r.description, "No description yet.")]),
          el("div", { class: "meta" }, [
            el("span", {}, [`★ ${r.stargazers_count}`]),
            el("span", {}, [`⑂ ${r.forks_count}`]),
            el("span", {}, [`⎇ ${safeText(r.language, "—")}`]),
            el("span", {}, [`Updated ${fmtDate(r.pushed_at)}`])
          ])
        ])
      );
    });

    if (!filtered.length) {
      listEl.innerHTML = `<p class="smallnote">No matches. Try a different keyword.</p>`;
    }
  }

  qEl.addEventListener("input", render);
  sEl.addEventListener("change", render);
  render();
}

window.Site = { setYear, applyConfig, loadGitHubStats, loadProjectsPage };
