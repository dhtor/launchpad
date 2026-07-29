const PALETTE = [
  "var(--pal-rose)", "var(--pal-emerald)", "var(--pal-violet)", "var(--pal-gold)",
  "var(--pal-azure)", "var(--pal-coral)", "var(--pal-teal)", "var(--pal-magenta)",
  "var(--pal-lime)", "var(--pal-indigo)", "var(--pal-amber)", "var(--pal-cyan)",
];

const DATA_PATH = "data/links.json";
const IDB_NAME = "launchpad-local-admin";
const IDB_STORE = "handles";
const IDB_KEY = "linksFileHandle";

const statusBanner = document.getElementById("statusBanner");
const previewLink = document.getElementById("previewLink");

const editForms = document.getElementById("editForms");
const categoryList = document.getElementById("categoryList");
const addCategoryForm = document.getElementById("addCategoryForm");
const addCategoryColorPicker = document.getElementById("addCategoryColorPicker");
const linkList = document.getElementById("linkList");
const addLinkBtn = document.getElementById("addLinkBtn");
const saveBoardBtn = document.getElementById("saveBoardBtn");
const reloadBtn = document.getElementById("reloadBtn");
const fileStatus = document.getElementById("fileStatus");
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
let fileHandle = null;

let editingLinkIndex = null; // index into linkData.links, or null when adding
let modalSubLinks = [];

init();

async function init() {
  wireGlobalUi();
  previewLink.href = "index.html";
  await restoreFileHandle();
  await loadData();
}

// --- Local file access (File System Access API, with a download fallback) ----

function supportsFsAccess() {
  return "showOpenFilePicker" in window;
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function restoreFileHandle() {
  if (!supportsFsAccess()) {
    fileStatus.textContent = "This browser can't save directly — Save will download the file instead.";
    return;
  }
  try {
    const handle = await idbGet(IDB_KEY);
    if (!handle) {
      fileStatus.textContent = "Not connected to a file yet — click Save to choose data/links.json.";
      return;
    }
    const perm = await handle.queryPermission({ mode: "readwrite" });
    fileHandle = handle;
    fileStatus.textContent =
      perm === "granted"
        ? `Connected: ${handle.name}`
        : `Connected: ${handle.name} (click Save to re-grant permission)`;
  } catch {
    fileStatus.textContent = "Not connected to a file yet — click Save to choose data/links.json.";
  }
}

// Must be called from inside a click handler — requestPermission/showOpenFilePicker
// both require an active user gesture.
async function ensureFileHandle() {
  if (fileHandle) {
    const perm = await fileHandle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return fileHandle;
    const req = await fileHandle.requestPermission({ mode: "readwrite" });
    if (req === "granted") return fileHandle;
  }

  const [handle] = await window.showOpenFilePicker({
    types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
    excludeAcceptAllOption: false,
  });
  const perm = await handle.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") throw new Error("Permission to write that file was denied.");

  fileHandle = handle;
  await idbSet(IDB_KEY, handle);
  return handle;
}

async function writeJsonToFile(handle, data) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2) + "\n");
  await writable.close();
}

function downloadJsonFallback(data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "links.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadData() {
  try {
    const res = await fetch(DATA_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`Couldn't read ${DATA_PATH} (${res.status}).`);
    linkData = await res.json();
  } catch (e) {
    editForms.hidden = true;
    showStatus(e.message, "error");
    return;
  }

  editForms.hidden = false;
  renderCategoryList();
  renderLinkList();
}

// --- Global UI ----------------------------------------------------------

function wireGlobalUi() {
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
  reloadBtn.addEventListener("click", async () => {
    reloadBtn.disabled = true;
    await loadData();
    reloadBtn.disabled = false;
    showStatus("Reloaded from disk.", "ok");
  });

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
    if (supportsFsAccess()) {
      const handle = await ensureFileHandle();
      await writeJsonToFile(handle, linkData);
      fileStatus.textContent = `Connected: ${handle.name}`;
      saveStatus.textContent = "Saved ✓";
      showStatus(`Saved to ${handle.name} on disk.`, "ok");
    } else {
      downloadJsonFallback(linkData);
      saveStatus.textContent = "Downloaded";
      showStatus("This browser can't save directly — downloaded links.json. Replace data/links.json with it.", "ok");
    }
  } catch (e) {
    saveStatus.textContent = "";
    if (e.name !== "AbortError") {
      showStatus(e.message || String(e), "error");
    }
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
