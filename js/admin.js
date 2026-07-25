const PALETTE = [
  "var(--pal-rose)", "var(--pal-emerald)", "var(--pal-violet)", "var(--pal-gold)",
  "var(--pal-azure)", "var(--pal-coral)", "var(--pal-teal)", "var(--pal-magenta)",
  "var(--pal-lime)", "var(--pal-indigo)", "var(--pal-amber)", "var(--pal-cyan)",
];

const CONFIG_KEY = "launchpad-admin-config";
const DATA_PATH = "data/links.json";

const statusBanner = document.getElementById("statusBanner");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const settingsForm = document.getElementById("settingsForm");
const testConnBtn = document.getElementById("testConnBtn");
const previewLink = document.getElementById("previewLink");

const editForms = document.getElementById("editForms");
const categoryList = document.getElementById("categoryList");
const addCategoryForm = document.getElementById("addCategoryForm");
const addCategoryColorPicker = document.getElementById("addCategoryColorPicker");
const linkList = document.getElementById("linkList");
const addLinkBtn = document.getElementById("addLinkBtn");
const saveBoardBtn = document.getElementById("saveBoardBtn");
const saveStatus = document.getElementById("saveStatus");

const linkModalOverlay = document.getElementById("linkModalOverlay");
const linkModalTitle = document.getElementById("linkModalTitle");
const linkModalClose = document.getElementById("linkModalClose");
const linkForm = document.getElementById("linkForm");
const singleUrlFields = document.getElementById("singleUrlFields");
const groupSubLinks = document.getElementById("groupSubLinks");
const subLinkList = document.getElementById("subLinkList");
const addSubLinkBtn = document.getElementById("addSubLinkBtn");
const linkCategorySelect = document.getElementById("linkCategorySelect");
const linkColorPicker = document.getElementById("linkColorPicker");
const deleteLinkBtn = document.getElementById("deleteLinkBtn");

let linkData = null; // { categories, links }
let linkDataSha = null;

let editingLinkIndex = null; // index into linkData.links, or null when adding
let modalSubLinks = [];

init();

async function init() {
  wireGlobalUi();
  previewLink.href = "index.html";

  try {
    const { sha, json } = await ghGetFile(DATA_PATH);
    linkDataSha = sha;
    linkData = json || { categories: [], links: [] };
  } catch (e) {
    editForms.hidden = true;
    showStatus(e.message, "error");
    return;
  }

  renderCategoryList();
  renderLinkList();
}

// --- GitHub API -------------------------------------------------------------

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}

async function ghRequest(path, options = {}) {
  const { token } = getConfig();
  return fetch(`https://api.github.com/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token || ""}`,
      Accept: "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
}

async function ghGetFile(path) {
  const { owner, repo, branch } = getConfig();
  if (!owner || !repo) throw new Error("Configure GitHub settings first.");
  const res = await ghRequest(
    `repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch || "main")}`
  );
  if (res.status === 404) return { sha: null, json: null };
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}) for ${path}`);
  const data = await res.json();
  return { sha: data.sha, json: JSON.parse(base64ToUtf8(data.content)) };
}

async function ghPutFile(path, value, sha, message) {
  const { owner, repo, branch } = getConfig();
  if (!owner || !repo) throw new Error("Configure GitHub settings first.");
  const body = {
    message,
    content: utf8ToBase64(JSON.stringify(value, null, 2) + "\n"),
    branch: branch || "main",
  };
  if (sha) body.sha = sha;

  const res = await ghRequest(`repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 409) throw new Error("Save conflict — the file changed since it was loaded. Reload and retry.");
    if (res.status === 401) throw new Error("GitHub rejected the token. Check it in Settings.");
    throw new Error(err.message || `GitHub save failed (${res.status})`);
  }
  return res.json();
}

async function ghTestConnection() {
  const { owner, repo, token } = getConfig();
  if (!owner || !repo || !token) throw new Error("Fill in owner, repo, and token first.");
  const res = await ghRequest(`repos/${owner}/${repo}`);
  if (res.status === 401) throw new Error("Bad token.");
  if (res.status === 404) throw new Error("Repo not found, or the token can't see it.");
  if (!res.ok) throw new Error(`Unexpected response (${res.status})`);
  return true;
}

// --- Global UI ----------------------------------------------------------

function wireGlobalUi() {
  const cfg = getConfig();
  settingsForm.owner.value = cfg.owner || "";
  settingsForm.repo.value = cfg.repo || "";
  settingsForm.branch.value = cfg.branch || "main";
  settingsForm.token.value = cfg.token || "";

  settingsBtn.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  });

  settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveConfig({
      owner: settingsForm.owner.value.trim(),
      repo: settingsForm.repo.value.trim(),
      branch: settingsForm.branch.value.trim() || "main",
      token: settingsForm.token.value.trim(),
    });
    showStatus("Settings saved.", "ok");
  });

  testConnBtn.addEventListener("click", async () => {
    saveConfig({
      owner: settingsForm.owner.value.trim(),
      repo: settingsForm.repo.value.trim(),
      branch: settingsForm.branch.value.trim() || "main",
      token: settingsForm.token.value.trim(),
    });
    testConnBtn.disabled = true;
    testConnBtn.textContent = "Testing…";
    try {
      await ghTestConnection();
      showStatus("Connected! Your token can read and write this repo.", "ok");
    } catch (e) {
      showStatus(e.message, "error");
    } finally {
      testConnBtn.disabled = false;
      testConnBtn.textContent = "Test connection";
    }
  });

  buildColorPicker(addCategoryColorPicker, addCategoryForm.color, "#6366f1");
  addCategoryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = addCategoryForm.name.value.trim();
    if (!name) return;
    const id = slugify(name);
    linkData.categories.push({ id, name, color: addCategoryForm.color.value || "#6366f1" });
    addCategoryForm.reset();
    buildColorPicker(addCategoryColorPicker, addCategoryForm.color, "#6366f1");
    renderCategoryList();
  });

  addLinkBtn.addEventListener("click", () => openLinkModal(null, null));
  saveBoardBtn.addEventListener("click", onSaveData);

  linkModalClose.addEventListener("click", closeLinkModal);
  linkModalOverlay.addEventListener("click", (e) => {
    if (e.target === linkModalOverlay) closeLinkModal();
  });
  linkForm.isGroup.addEventListener("change", () => {
    const isGroup = linkForm.isGroup.checked;
    singleUrlFields.hidden = isGroup;
    groupSubLinks.hidden = !isGroup;
  });
  addSubLinkBtn.addEventListener("click", () => {
    modalSubLinks.push({ name: "", url: "", order: modalSubLinks.length + 1 });
    renderSubLinkRows();
  });
  linkForm.addEventListener("submit", onSaveLink);
  deleteLinkBtn.addEventListener("click", onDeleteLink);

  buildColorPicker(linkColorPicker, linkForm.color, "");
}

function showStatus(message, kind) {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner status-${kind}`;
  statusBanner.hidden = false;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => {
    statusBanner.hidden = true;
  }, 6000);
}

function buildColorPicker(container, inputEl, initial) {
  container.innerHTML = "";
  inputEl.value = initial || "";

  const noneSwatch = document.createElement("button");
  noneSwatch.type = "button";
  noneSwatch.className = "color-swatch color-swatch-none";
  noneSwatch.title = "No accent";
  noneSwatch.addEventListener("click", () => {
    inputEl.value = "";
    highlightSwatch(container, "");
  });
  container.appendChild(noneSwatch);

  for (const color of PALETTE) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "color-swatch";
    swatch.style.background = color;
    swatch.title = color;
    swatch.addEventListener("click", () => {
      inputEl.value = color;
      highlightSwatch(container, color);
    });
    container.appendChild(swatch);
  }

  inputEl.addEventListener("input", () => highlightSwatch(container, inputEl.value));
  highlightSwatch(container, initial || "");
}

function highlightSwatch(container, value) {
  container.querySelectorAll(".color-swatch").forEach((el) => el.classList.remove("selected"));
  if (!value) {
    container.querySelector(".color-swatch-none")?.classList.add("selected");
    return;
  }
  const match = [...container.querySelectorAll(".color-swatch")].find((el) => el.style.background === value);
  match?.classList.add("selected");
}

function slugify(name) {
  const base = (name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `item-${Date.now()}`;
}

// --- Categories -------------------------------------------------------------

function renderCategoryList() {
  categoryList.innerHTML = "";
  for (const cat of linkData.categories) {
    const row = document.createElement("div");
    row.className = "admin-list-row";
    row.innerHTML = `
      <div class="color-picker row-color-picker"></div>
      <input type="text" class="row-name-input" value="${escapeAttr(cat.name)}" />
      <span class="admin-row-id">${escapeHtml(cat.id)}</span>
      <button type="button" class="row-delete" title="Delete category">✕</button>
    `;
    const nameInput = row.querySelector(".row-name-input");
    const colorPicker = row.querySelector(".row-color-picker");
    const colorHiddenInput = document.createElement("input");
    colorHiddenInput.type = "hidden";
    row.appendChild(colorHiddenInput);
    buildColorPicker(colorPicker, colorHiddenInput, cat.color || "#6366f1");

    nameInput.addEventListener("change", () => (cat.name = nameInput.value.trim()));
    colorHiddenInput.addEventListener("input", () => (cat.color = colorHiddenInput.value || "#6366f1"));

    row.querySelector(".row-delete").addEventListener("click", () => {
      if (!confirm(`Delete category "${cat.name}"? Links in it will move to the first remaining category.`)) return;
      linkData.categories = linkData.categories.filter((c) => c.id !== cat.id);
      renderCategoryList();
      renderLinkList();
    });

    categoryList.appendChild(row);
  }
}

// --- Links -------------------------------------------------------------

function renderLinkList() {
  linkList.innerHTML = "";
  linkData.links.forEach((link, index) => {
    const isGroup = Array.isArray(link.links) && link.links.length > 0;
    const cat = linkData.categories.find((c) => c.id === link.category);
    const row = document.createElement("div");
    row.className = "admin-list-row admin-list-row-link";
    row.innerHTML = `
      <span class="admin-row-dot" style="background:${link.color || "var(--text-dim)"}"></span>
      <span class="row-name-input row-name-static">${escapeHtml(link.name)}</span>
      <span class="admin-row-id">${isGroup ? `group · ${link.links.length} links` : escapeHtml(link.url || "")}</span>
      <span class="admin-row-id">${escapeHtml(cat?.name || "—")}</span>
      <button type="button" class="row-delete" title="Delete link">✕</button>
    `;
    row.addEventListener("click", (e) => {
      if (e.target.closest(".row-delete")) return;
      openLinkModal(link, index);
    });
    row.querySelector(".row-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${link.name}"?`)) return;
      linkData.links.splice(index, 1);
      renderLinkList();
    });
    linkList.appendChild(row);
  });
}

function openLinkModal(link, index) {
  editingLinkIndex = index;
  const isGroup = link && Array.isArray(link.links) && link.links.length > 0;

  linkModalTitle.textContent = link ? "Edit link" : "Add link";
  deleteLinkBtn.hidden = index === null;

  linkForm.name.value = link?.name || "";
  linkForm.url.value = link?.url || "";
  linkForm.isGroup.checked = !!isGroup;
  linkForm.icon.value = link?.icon || "";
  linkForm.iconUrl.value = link?.iconUrl || "";
  linkForm.wide.checked = !!link?.wide;
  linkForm.order.value = link?.order ?? "";
  linkForm.color.value = link?.color || "";

  singleUrlFields.hidden = !!isGroup;
  groupSubLinks.hidden = !isGroup;
  modalSubLinks = isGroup ? link.links.map((s) => ({ ...s })) : [];
  renderSubLinkRows();

  linkCategorySelect.innerHTML = linkData.categories
    .map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");
  linkCategorySelect.value = link?.category || linkData.categories[0]?.id || "";

  highlightSwatch(linkColorPicker, link?.color || "");

  linkModalOverlay.hidden = false;
}

function closeLinkModal() {
  linkModalOverlay.hidden = true;
}

function renderSubLinkRows() {
  subLinkList.innerHTML = "";
  modalSubLinks.forEach((sub, i) => {
    const row = document.createElement("div");
    row.className = "admin-list-row admin-sub-link-row";
    row.innerHTML = `
      <input type="text" placeholder="Name" class="sub-name" value="${escapeAttr(sub.name)}" />
      <input type="url" placeholder="https://" class="sub-url" value="${escapeAttr(sub.url)}" />
      <input type="number" placeholder="#" class="sub-order" value="${sub.order ?? ""}" />
      <button type="button" class="row-delete" title="Remove">✕</button>
    `;
    row.querySelector(".sub-name").addEventListener("input", (e) => (sub.name = e.target.value));
    row.querySelector(".sub-url").addEventListener("input", (e) => (sub.url = e.target.value));
    row.querySelector(".sub-order").addEventListener("input", (e) => (sub.order = e.target.value ? Number(e.target.value) : undefined));
    row.querySelector(".row-delete").addEventListener("click", () => {
      modalSubLinks.splice(i, 1);
      renderSubLinkRows();
    });
    subLinkList.appendChild(row);
  });
}

function onSaveLink(e) {
  e.preventDefault();
  const isGroup = linkForm.isGroup.checked;
  const name = linkForm.name.value.trim();
  if (!name) return;

  const link = {
    id: editingLinkIndex !== null ? linkData.links[editingLinkIndex].id : slugify(name) + "-" + Date.now().toString(36),
    name,
    category: linkCategorySelect.value,
  };

  if (isGroup) {
    link.links = modalSubLinks
      .filter((s) => s.name && s.url)
      .map((s) => ({ name: s.name, url: s.url, ...(s.order !== undefined ? { order: s.order } : {}) }));
  } else {
    link.url = linkForm.url.value.trim();
  }

  if (linkForm.color.value) link.color = linkForm.color.value;
  if (linkForm.icon.value.trim()) link.icon = linkForm.icon.value.trim();
  if (linkForm.iconUrl.value.trim()) link.iconUrl = linkForm.iconUrl.value.trim();
  if (linkForm.wide.checked) link.wide = true;
  if (linkForm.order.value !== "") link.order = Number(linkForm.order.value);

  if (editingLinkIndex !== null) {
    linkData.links[editingLinkIndex] = link;
  } else {
    linkData.links.push(link);
  }

  closeLinkModal();
  renderLinkList();
}

function onDeleteLink() {
  if (editingLinkIndex === null) return;
  const link = linkData.links[editingLinkIndex];
  if (!confirm(`Delete "${link.name}"?`)) return;
  linkData.links.splice(editingLinkIndex, 1);
  closeLinkModal();
  renderLinkList();
}

async function onSaveData() {
  saveBoardBtn.disabled = true;
  saveStatus.textContent = "Saving…";
  saveStatus.className = "admin-save-status";
  try {
    const { sha } = await ghGetFile(DATA_PATH);
    const result = await ghPutFile(DATA_PATH, linkData, sha, "Update links via LaunchPad admin");
    linkDataSha = result.content?.sha || linkDataSha;
    saveStatus.textContent = "Saved ✓";
    showStatus("Saved to GitHub.", "ok");
  } catch (e) {
    saveStatus.textContent = "";
    showStatus(e.message, "error");
  } finally {
    saveBoardBtn.disabled = false;
  }
}

// --- Utilities ------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}
