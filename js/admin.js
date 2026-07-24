const PALETTE = [
  "var(--pal-rose)", "var(--pal-emerald)", "var(--pal-violet)", "var(--pal-gold)",
  "var(--pal-azure)", "var(--pal-coral)", "var(--pal-teal)", "var(--pal-magenta)",
  "var(--pal-lime)", "var(--pal-indigo)", "var(--pal-amber)", "var(--pal-cyan)",
];

const CONFIG_KEY = "launchpad-admin-config";

const statusBanner = document.getElementById("statusBanner");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const settingsForm = document.getElementById("settingsForm");
const testConnBtn = document.getElementById("testConnBtn");
const previewLink = document.getElementById("previewLink");
const adminTitle = document.getElementById("adminTitle");

const boardsView = document.getElementById("boardsView");
const boardList = document.getElementById("boardList");
const addBoardForm = document.getElementById("addBoardForm");
const addBoardColorPicker = document.getElementById("addBoardColorPicker");

const editView = document.getElementById("editView");
const editBoardDot = document.getElementById("editBoardDot");
const editBoardName = document.getElementById("editBoardName");
const localNotice = document.getElementById("localNotice");
const localFilePath = document.getElementById("localFilePath");
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

let BOARD_ID = "";
let boardsRegistry = [];
let boardsRegistrySha = null;
let deletedBoardIds = [];

let currentBoard = null; // registry entry, when editing a board
let currentBoardData = null; // { categories, links }
let currentBoardSha = null;

let editingLinkIndex = null; // index into currentBoardData.links, or null when adding
let modalSubLinks = [];

init();

async function init() {
  BOARD_ID = new URLSearchParams(location.search).get("id") || "";
  wireGlobalUi();
  await loadRegistry();

  if (BOARD_ID) {
    enterEditView();
  } else {
    enterBoardsView();
  }
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

async function ghDeleteFile(path, sha, message) {
  const { owner, repo, branch } = getConfig();
  const res = await ghRequest(`repos/${owner}/${repo}/contents/${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: branch || "main" }),
  });
  return res.ok;
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

  buildColorPicker(addBoardColorPicker, addBoardForm.color, "#6366f1");
  addBoardForm.addEventListener("submit", onAddBoard);

  buildColorPicker(addCategoryColorPicker, addCategoryForm.color, "#6366f1");

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
  return base || `board-${Date.now()}`;
}

// --- Boards (manage) view -------------------------------------------------

async function loadRegistry() {
  try {
    const res = await fetch("data/boards.json", { cache: "no-store" });
    const data = await res.json();
    boardsRegistry = data.boards || [];
  } catch {
    boardsRegistry = [];
  }
}

function enterBoardsView() {
  adminTitle.textContent = "Manage Launchpads";
  previewLink.hidden = true;
  boardsView.hidden = false;
  editView.hidden = true;
  renderBoardsList();
}

function renderBoardsList() {
  boardList.innerHTML = "";

  for (const board of boardsRegistry) {
    const row = document.createElement("div");
    row.className = "admin-list-row";
    row.innerHTML = `
      <input type="text" class="row-icon-input" value="${escapeAttr(board.icon || "")}" maxlength="4" title="Icon" />
      <input type="text" class="row-name-input" value="${escapeAttr(board.name || "")}" title="Name" />
      <div class="color-picker row-color-picker"></div>
      ${board.local ? `<span class="admin-row-badge" title="This board's data stays on this device only">local</span>` : ""}
      <a class="row-link" href="admin.html?id=${encodeURIComponent(board.id)}">Edit links →</a>
      <button type="button" class="row-delete" title="Delete this launchpad">✕</button>
    `;

    const iconInput = row.querySelector(".row-icon-input");
    const nameInput = row.querySelector(".row-name-input");
    const colorPicker = row.querySelector(".row-color-picker");
    const colorHiddenInput = document.createElement("input");
    colorHiddenInput.type = "hidden";
    row.appendChild(colorHiddenInput);
    buildColorPicker(colorPicker, colorHiddenInput, board.color || "#6366f1");

    iconInput.addEventListener("change", () => (board.icon = iconInput.value.trim()));
    nameInput.addEventListener("change", () => (board.name = nameInput.value.trim()));
    colorHiddenInput.addEventListener("input", () => (board.color = colorHiddenInput.value || "#6366f1"));

    row.querySelector(".row-delete").addEventListener("click", () => {
      if (!confirm(`Delete "${board.name}"? This removes it from the list (and its data file, once you save).`)) return;
      boardsRegistry = boardsRegistry.filter((b) => b.id !== board.id);
      if (!board._isNew) deletedBoardIds.push(board.id);
      renderBoardsList();
    });

    boardList.appendChild(row);
  }

  const saveBar = document.createElement("div");
  saveBar.className = "admin-save-bar";
  saveBar.innerHTML = `<button type="button" class="btn-primary" id="saveRegistryBtn">Save changes to GitHub</button>
    <span class="admin-save-status" id="registrySaveStatus"></span>`;
  boardList.appendChild(saveBar);
  document.getElementById("saveRegistryBtn").addEventListener("click", onSaveRegistry);
}

async function onAddBoard(e) {
  e.preventDefault();
  const name = addBoardForm.name.value.trim();
  if (!name) return;
  const id = slugify(name);
  if (boardsRegistry.some((b) => b.id === id)) {
    showStatus("A board with that name already exists.", "error");
    return;
  }

  boardsRegistry.push({
    id,
    name,
    color: addBoardForm.color.value || "#6366f1",
    icon: addBoardForm.icon.value.trim() || "🚀",
    file: `data/boards/${id}.json`,
    _isNew: true,
  });

  addBoardForm.reset();
  buildColorPicker(addBoardColorPicker, addBoardForm.color, "#6366f1");
  renderBoardsList();
}

async function onSaveRegistry() {
  const btn = document.getElementById("saveRegistryBtn");
  const status = document.getElementById("registrySaveStatus");
  btn.disabled = true;
  status.textContent = "Saving…";
  status.className = "admin-save-status";

  try {
    for (const board of boardsRegistry) {
      if (board._isNew) {
        await ghPutFile(board.file, { categories: [], links: [] }, null, `Add ${board.name} launchpad`);
        delete board._isNew;
      }
    }

    for (const id of deletedBoardIds) {
      const removed = { file: `data/boards/${id}.json` };
      try {
        const existing = await ghGetFile(removed.file);
        if (existing.sha) await ghDeleteFile(removed.file, existing.sha, `Remove board ${id}`);
      } catch {
        // best-effort — registry update below still proceeds
      }
    }
    deletedBoardIds = [];

    const clean = boardsRegistry.map(({ _isNew, ...rest }) => rest);
    const { sha } = await ghGetFile("data/boards.json");
    await ghPutFile("data/boards.json", { boards: clean }, sha, "Update launchpad registry");

    status.textContent = "Saved ✓";
    showStatus("Launchpad list saved to GitHub.", "ok");
  } catch (e) {
    status.textContent = "";
    showStatus(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

// --- Edit board view ------------------------------------------------------

async function enterEditView() {
  currentBoard = boardsRegistry.find((b) => b.id === BOARD_ID);
  if (!currentBoard) {
    boardsView.hidden = false;
    editView.hidden = true;
    showStatus(`No launchpad named "${BOARD_ID}".`, "error");
    return;
  }

  adminTitle.textContent = "Manage Launchpads";
  boardsView.hidden = true;
  editView.hidden = false;
  editBoardDot.style.background = currentBoard.color || "#6366f1";
  editBoardName.textContent = currentBoard.name;
  previewLink.hidden = false;
  previewLink.href = `board.html?id=${encodeURIComponent(currentBoard.id)}`;

  if (currentBoard.local) {
    localNotice.hidden = false;
    localFilePath.textContent = currentBoard.file;
    editForms.hidden = true;
    return;
  }

  localNotice.hidden = true;
  editForms.hidden = false;

  try {
    const { sha, json } = await ghGetFile(currentBoard.file);
    currentBoardSha = sha;
    currentBoardData = json || { categories: [], links: [] };
  } catch (e) {
    editForms.hidden = true;
    showStatus(e.message, "error");
    return;
  }

  renderCategoryList();
  renderLinkList();
  wireEditView();
}

function wireEditView() {
  addCategoryForm.onsubmit = (e) => {
    e.preventDefault();
    const name = addCategoryForm.name.value.trim();
    if (!name) return;
    const id = slugify(name);
    currentBoardData.categories.push({ id, name, color: addCategoryForm.color.value || "#6366f1" });
    addCategoryForm.reset();
    buildColorPicker(addCategoryColorPicker, addCategoryForm.color, "#6366f1");
    renderCategoryList();
  };

  addLinkBtn.onclick = () => openLinkModal(null, null);
  saveBoardBtn.onclick = onSaveBoard;
}

function renderCategoryList() {
  categoryList.innerHTML = "";
  for (const cat of currentBoardData.categories) {
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
      currentBoardData.categories = currentBoardData.categories.filter((c) => c.id !== cat.id);
      renderCategoryList();
      renderLinkList();
    });

    categoryList.appendChild(row);
  }
}

function renderLinkList() {
  linkList.innerHTML = "";
  currentBoardData.links.forEach((link, index) => {
    const isGroup = Array.isArray(link.links) && link.links.length > 0;
    const cat = currentBoardData.categories.find((c) => c.id === link.category);
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
      currentBoardData.links.splice(index, 1);
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

  linkCategorySelect.innerHTML = currentBoardData.categories
    .map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");
  linkCategorySelect.value = link?.category || currentBoardData.categories[0]?.id || "";

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
    id: editingLinkIndex !== null ? currentBoardData.links[editingLinkIndex].id : slugify(name) + "-" + Date.now().toString(36),
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
    currentBoardData.links[editingLinkIndex] = link;
  } else {
    currentBoardData.links.push(link);
  }

  closeLinkModal();
  renderLinkList();
}

function onDeleteLink() {
  if (editingLinkIndex === null) return;
  const link = currentBoardData.links[editingLinkIndex];
  if (!confirm(`Delete "${link.name}"?`)) return;
  currentBoardData.links.splice(editingLinkIndex, 1);
  closeLinkModal();
  renderLinkList();
}

async function onSaveBoard() {
  saveBoardBtn.disabled = true;
  saveStatus.textContent = "Saving…";
  saveStatus.className = "admin-save-status";
  try {
    const { sha } = await ghGetFile(currentBoard.file);
    const result = await ghPutFile(currentBoard.file, currentBoardData, sha, `Update ${currentBoard.name} via LaunchPad admin`);
    currentBoardSha = result.content?.sha || currentBoardSha;
    saveStatus.textContent = "Saved ✓";
    showStatus(`${currentBoard.name} saved to GitHub.`, "ok");
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
