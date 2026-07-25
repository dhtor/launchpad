const DATA_URL = "data/links.json";
const LAYOUT_KEY = "launchpad-layout-v1";
const WIDGET_ORDER_KEY = "launchpad-widget-order-v1";

const grid = document.getElementById("categories");
const searchInput = document.getElementById("search");
const resetBtn = document.getElementById("reset-layout");
const clockEl = document.getElementById("clock");
const editLink = document.getElementById("edit-link");
const modalOverlay = document.getElementById("modalOverlay");
const modalCard = document.getElementById("modalCard");
const modalTitle = document.getElementById("modalTitle");
const modalLinks = document.getElementById("modalLinks");
const modalClose = document.getElementById("modalClose");

let categories = [];
let links = [];
let linkById = new Map();

init();

async function init() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  const data = await res.json();
  categories = data.categories || [];
  links = data.links || [];
  linkById = new Map(links.map((l) => [l.id, l]));

  render();
  startClock();

  searchInput.addEventListener("input", () => filterTiles(searchInput.value.trim().toLowerCase()));
  resetBtn.addEventListener("click", () => {
    localStorage.removeItem(LAYOUT_KEY);
    localStorage.removeItem(WIDGET_ORDER_KEY);
    render();
  });

  enableWidgetDropZone();
  enableModal();
}

// --- Group link modal -----------------------------------------------------

function enableModal() {
  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalOverlay.hidden) closeModal();
  });
}

function openGroupModal(link) {
  modalCard.style.setProperty("--modal-accent", link.color || "#6366f1");
  modalTitle.textContent = link.name;
  modalLinks.innerHTML = "";

  const subLinks = [...link.links].sort(byOrder);
  for (const sub of subLinks) {
    const a = document.createElement("a");
    a.className = "modal-link";
    a.href = sub.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const iconHtml = sub.icon ? escapeHtml(sub.icon) : buildIconHtml(sub.name, sub.url, sub.iconUrl);

    a.innerHTML = `
      <span class="tile-icon">${iconHtml}</span>
      <span class="tile-name">${escapeHtml(sub.name)}</span>
    `;
    a.addEventListener("click", closeModal);
    modalLinks.appendChild(a);
  }

  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
}

function byOrder(a, b) {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
}

function startClock() {
  const tick = () => {
    clockEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 15000);
}

// --- Tile layout persistence ------------------------------------------------

function loadOverride() {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {};
  } catch {
    return {};
  }
}

function saveOverride(override) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(override));
}

function buildCategoryOrder() {
  const override = loadOverride();
  const order = new Map(categories.map((c) => [c.id, []]));
  const assigned = new Set();

  for (const cat of categories) {
    const ids = override[cat.id] || [];
    for (const id of ids) {
      if (linkById.has(id) && !assigned.has(id)) {
        order.get(cat.id).push(id);
        assigned.add(id);
      }
    }
  }

  const remaining = links.filter((link) => !assigned.has(link.id)).sort(byOrder);

  for (const link of remaining) {
    const bucket = order.has(link.category) ? link.category : categories[0]?.id;
    if (bucket) {
      order.get(bucket).push(link.id);
      assigned.add(link.id);
    }
  }

  return order;
}

function persistOrderFromDOM() {
  const override = {};
  grid.querySelectorAll(".widget").forEach((widget) => {
    const catId = widget.dataset.categoryId;
    override[catId] = Array.from(widget.querySelectorAll(".tile")).map((t) => t.dataset.id);
  });
  saveOverride(override);
}

// --- Widget order persistence ------------------------------------------------

function buildWidgetOrder() {
  let order;
  try {
    order = JSON.parse(localStorage.getItem(WIDGET_ORDER_KEY)) || [];
  } catch {
    order = [];
  }
  const byId = new Map(categories.map((c) => [c.id, c]));
  const seen = new Set();
  const result = [];

  for (const id of order) {
    if (byId.has(id) && !seen.has(id)) {
      result.push(byId.get(id));
      seen.add(id);
    }
  }
  for (const cat of categories) {
    if (!seen.has(cat.id)) {
      result.push(cat);
      seen.add(cat.id);
    }
  }
  return result;
}

function persistWidgetOrderFromDOM() {
  const order = Array.from(grid.querySelectorAll(".widget")).map((w) => w.dataset.categoryId);
  localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(order));
}

// --- Rendering ----------------------------------------------------------

function render() {
  const tileOrder = buildCategoryOrder();
  const widgetOrder = buildWidgetOrder();
  grid.innerHTML = "";

  for (const cat of widgetOrder) {
    const ids = tileOrder.get(cat.id) || [];
    const widget = document.createElement("section");
    widget.className = "widget";
    widget.dataset.categoryId = cat.id;
    widget.style.setProperty("--widget-accent", cat.color || "#6366f1");

    widget.innerHTML = `
      <div class="widget-head">
        <span class="widget-grip" title="Drag to move this widget">
          <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="6" cy="5" r="1.5"/><circle cx="6" cy="10" r="1.5"/><circle cx="6" cy="15" r="1.5"/><circle cx="13" cy="5" r="1.5"/><circle cx="13" cy="10" r="1.5"/><circle cx="13" cy="15" r="1.5"/></svg>
        </span>
        <span class="widget-dot" style="background:${cat.color || "#6366f1"}"></span>
        <h2>${escapeHtml(cat.name)}</h2>
      </div>
      <div class="tile-grid" data-category-id="${cat.id}"></div>
    `;

    const tileGrid = widget.querySelector(".tile-grid");
    for (const id of ids) {
      const link = linkById.get(id);
      if (link) tileGrid.appendChild(createTile(link));
    }

    if (ids.length === 0) widget.classList.add("is-empty");
    grid.appendChild(widget);
    enableDropZone(tileGrid);
    enableWidgetDrag(widget);
  }
}

function createTile(link) {
  const isGroup = Array.isArray(link.links) && link.links.length > 0;
  const a = document.createElement(isGroup ? "button" : "a");
  a.className = link.wide ? "tile tile-wide" : "tile";
  a.draggable = true;
  a.dataset.id = link.id;
  a.dataset.name = link.name.toLowerCase();

  if (isGroup) {
    a.type = "button";
  } else {
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }

  if (link.color) {
    a.classList.add("has-accent");
    a.style.setProperty("--tile-accent", link.color);
  }

  const iconSourceUrl = link.url || link.links?.[0]?.url || "";
  const iconHtml = link.icon ? escapeHtml(link.icon) : buildIconHtml(link.name, iconSourceUrl, link.iconUrl);

  a.innerHTML = `
    <span class="tile-icon">${iconHtml}</span>
    <span class="tile-name">${escapeHtml(link.name)}</span>
    ${isGroup ? `<span class="tile-group-badge" title="Opens a menu of links"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l5 5 5-5"/></svg></span>` : ""}
  `;

  if (isGroup) {
    a.addEventListener("click", () => openGroupModal(link));
  }

  a.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    a.classList.add("dragging");
  });
  a.addEventListener("dragend", (e) => {
    e.stopPropagation();
    a.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    persistOrderFromDOM();
    updateEmptyStates();
  });

  return a;
}

function hostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function monogramLetter(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

// Resolution order: an explicit iconUrl (for sites whose favicon isn't at the
// standard /favicon.ico path) > the site's own favicon.ico directly (works for
// internal/intranet sites your browser can reach but Google's crawler can't) >
// Google's favicon proxy (handles nonstandard paths on public sites) > a letter.
function buildIconHtml(name, url, explicitIconUrl) {
  const letter = escapeHtml(monogramLetter(name));

  if (explicitIconUrl) {
    return `<img src="${escapeHtml(explicitIconUrl)}" alt="" data-letter="${letter}" onerror="iconFallback(this)" />`;
  }

  if (!url) return letter;

  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return letter;
  }

  const domain = escapeHtml(hostname(url));
  return `<img src="${origin}/favicon.ico" alt="" data-domain="${domain}" data-letter="${letter}" data-step="0" onerror="iconFallback(this)" />`;
}

function iconFallback(img) {
  if (img.dataset.step === "0") {
    img.dataset.step = "1";
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(img.dataset.domain)}&sz=64`;
  } else {
    const span = document.createElement("span");
    span.textContent = img.dataset.letter;
    img.replaceWith(span);
  }
}

function enableDropZone(tileGrid) {
  tileGrid.addEventListener("dragover", (e) => {
    const dragging = document.querySelector(".tile.dragging");
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    const after = afterElement(tileGrid, ".tile:not(.dragging)", e.clientX, e.clientY);
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    if (after == null) {
      tileGrid.appendChild(dragging);
    } else {
      after.classList.add("drag-over");
      tileGrid.insertBefore(dragging, after);
    }
  });
}

// --- Widget drag & drop ---------------------------------------------------

function enableWidgetDrag(widget) {
  const handle = widget.querySelector(".widget-grip");
  handle.draggable = true;

  handle.addEventListener("dragstart", (e) => {
    widget.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  handle.addEventListener("dragend", () => {
    widget.classList.remove("dragging");
    document.querySelectorAll(".widget-drag-over").forEach((el) => el.classList.remove("widget-drag-over"));
    persistWidgetOrderFromDOM();
  });
}

function enableWidgetDropZone() {
  grid.addEventListener("dragover", (e) => {
    const dragging = grid.querySelector(".widget.dragging");
    if (!dragging) return;
    e.preventDefault();
    const after = afterElement(grid, ".widget:not(.dragging)", e.clientX, e.clientY);
    document.querySelectorAll(".widget-drag-over").forEach((el) => el.classList.remove("widget-drag-over"));
    if (after == null) {
      grid.appendChild(dragging);
    } else {
      after.classList.add("widget-drag-over");
      grid.insertBefore(dragging, after);
    }
  });
}

function afterElement(container, selector, x, y) {
  const items = [...container.querySelectorAll(selector)];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };

  for (const item of items) {
    const box = item.getBoundingClientRect();
    const offsetX = x - box.left - box.width / 2;
    const offsetY = y - box.top - box.height / 2;
    const sameRow = Math.abs(offsetY) < box.height / 2;
    const offset = sameRow ? offsetX : offsetY < 0 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: item };
    }
  }
  return closest.element;
}

function updateEmptyStates() {
  grid.querySelectorAll(".widget").forEach((widget) => {
    const hasVisible = widget.querySelectorAll(".tile-grid .tile").length > 0;
    widget.classList.toggle("is-empty", !hasVisible);
  });
}

// --- Search -------------------------------------------------------------

function filterTiles(query) {
  const tiles = grid.querySelectorAll(".tile");
  tiles.forEach((tile) => {
    const match = !query || tile.dataset.name.includes(query);
    tile.classList.toggle("tile-hidden", !match);
  });

  grid.querySelectorAll(".widget").forEach((widget) => {
    const visible = widget.querySelectorAll(".tile:not(.tile-hidden)").length;
    widget.classList.toggle("is-empty", visible === 0);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
