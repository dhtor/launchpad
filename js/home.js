const boardGrid = document.getElementById("boardGrid");

init();

async function init() {
  let boards = [];
  try {
    const res = await fetch("data/boards.json", { cache: "no-store" });
    const data = await res.json();
    boards = data.boards || [];
  } catch {
    boards = [];
  }

  render(boards);
}

function render(boards) {
  boardGrid.innerHTML = "";

  for (const board of boards) {
    const a = document.createElement("a");
    a.className = "board-tile";
    a.href = `board.html?id=${encodeURIComponent(board.id)}`;
    a.style.setProperty("--board-accent", board.color || "#6366f1");

    a.innerHTML = `
      <span class="board-tile-icon">${escapeHtml(board.icon || board.name?.charAt(0) || "?")}</span>
      <span class="board-tile-name">${escapeHtml(board.name)}</span>
      ${board.local ? `<span class="board-tile-badge" title="This board's data stays on this device only">local</span>` : ""}
      <button type="button" class="board-tile-edit" title="Edit ${escapeHtml(board.name)}" aria-label="Edit ${escapeHtml(board.name)}">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13.5 3.5l3 3L6 17l-3.6.6.6-3.6L13.5 3.5z"/></svg>
      </button>
    `;

    const editBtn = a.querySelector(".board-tile-edit");
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      location.href = `admin.html?id=${encodeURIComponent(board.id)}`;
    });

    boardGrid.appendChild(a);
  }

  const addTile = document.createElement("a");
  addTile.className = "board-tile board-tile-add";
  addTile.href = "admin.html";
  addTile.innerHTML = `
    <span class="board-tile-icon">+</span>
    <span class="board-tile-name">Add launchpad</span>
  `;
  boardGrid.appendChild(addTile);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
