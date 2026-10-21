"use strict";

const canvas = document.querySelector("#game-board");
const context = canvas.getContext("2d");
const overlay = document.querySelector("#screen-overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayCopy = document.querySelector("#overlay-copy");
const menuActions = document.querySelector("#menu-actions");
const normalButton = document.querySelector("#normal-button");
const hardButton = document.querySelector("#hard-button");
const continueButton = document.querySelector("#continue-button");
const configError = document.querySelector("#config-error");
const cellSize = 20;
const rarityColors = {
  common: "#fff",
  uncommon: "#fff",
  rare: "#fff",
  epic: "#fff",
  legendary: "#fff"
};

let config;
let state = "loading";
let hardMode = false;
let hardUnlocked = localStorage.getItem("dungeon-hard-unlocked") === "true";
let roundNumber = 1;
let gameMap = [];
let player = { x: 0, y: 0, hp: 0, maxHp: 0, damage: 4, weapon: "Fists" };
let entities = {};
let projectiles = [];
let inventory = [];
let remainingToSpawn = 0;
let nextSpawnAt = 0;
let spawnInterval = 1000;
let lastUpdate = 0;
let message = "Loading the dungeon...";
let lastError = "";

const positionKey = (x, y) => `${x},${y}`;
const parsePosition = (key) => key.split(",").map(Number);

function showOverlay(title, copy, mode) {
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  overlay.classList.remove("is-hidden");
  menuActions.classList.toggle("is-hidden", mode !== "menu");
  continueButton.classList.toggle("is-hidden", mode === "menu");
  continueButton.textContent = mode === "intermission"
    ? `Start round ${roundNumber}`
    : mode === "paused" ? "Resume" : mode === "gameover" || mode === "victory"
      ? "Back to menu" : "Start round";
  hardButton.disabled = !hardUnlocked || !config;
  hardButton.textContent = hardUnlocked ? "Play hard mode" : "Hard mode locked · beat round 30";
}

function showMenu() {
  state = "menu";
  showOverlay("Survive the waves.", "Clear each round to face a bigger horde. How long can you last?", "menu");
  document.querySelector("#game-title").textContent = "The dungeon is waiting.";
  message = "Choose a mode to start.";
}

function makeRound(number) {
  const width = config.map.width;
  const height = config.map.height;
  const map = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? "#" : "."
    )
  );
  const start = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const obstacleCount = config.map.obstacles + Math.floor(number / 2);

  for (let index = 0; index < obstacleCount; index += 1) {
    const x = 2 + Math.floor(Math.random() * (width - 4));
    const y = 2 + Math.floor(Math.random() * (height - 4));
    if (Math.abs(x - start.x) + Math.abs(y - start.y) >= 5) map[y][x] = "#";
  }

  const openTiles = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (map[y][x] === "." && Math.abs(x - start.x) + Math.abs(y - start.y) >= 7) {
        openTiles.push({ x, y });
      }
    }
  }
  openTiles.sort(() => Math.random() - 0.5);

  const roundEntities = {};
  for (const tile of openTiles.slice(0, config.map.chestsPerRound)) {
    roundEntities[positionKey(tile.x, tile.y)] = {
      type: "chest",
      symbol: "C",
      name: "Wooden Chest",
      locked: false
    };
  }
  return { map, start, entities: roundEntities, enemyCount: config.rounds.startingEnemies + number - 1 };
}

function beginGame(isHard) {
  hardMode = isHard;
  roundNumber = 1;
  player = {
    x: 0,
    y: 0,
    hp: isHard ? config.player.hardModeHealth : config.player.health,
    maxHp: isHard ? config.player.hardModeHealth : config.player.health,
    damage: config.player.damage,
    weapon: "Fists"
  };
  inventory = [];
  projectiles = [];
  spawnInterval = config.rounds.spawnIntervalMs;
  beginRound(1, true);
}

function beginRound(number, initial = false) {
  const round = makeRound(number);
  gameMap = round.map;
  entities = round.entities;
  player.x = round.start.x;
  player.y = round.start.y;
  remainingToSpawn = round.enemyCount;
  nextSpawnAt = performance.now() + 500;
  projectiles = [];
  state = initial ? "round-start" : "playing";
  message = initial ? "Get ready. The first wave is coming." : `Round ${number} — stay alive.`;
  document.querySelector("#game-title").textContent = `Hold the line.`;
  document.querySelector("#mode-label").textContent = hardMode ? "HARD MODE" : "NORMAL MODE";
  if (initial) showOverlay("Round 1", "Your first wave is on its way. Take a breath, then get moving.", "round-start");
}

function startRound() {
  if (state === "round-start" || state === "intermission") {
    state = "playing";
    overlay.classList.add("is-hidden");
    message = `Round ${roundNumber} — survive the wave.`;
  } else if (state === "paused") {
    state = "playing";
    overlay.classList.add("is-hidden");
  } else if (state === "gameover" || state === "victory") {
    showMenu();
  }
}

function weightedChoice(values, weights) {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!total) return values[0];
  let choice = Math.random() * total;
  for (let index = 0; index < values.length; index += 1) {
    choice -= Math.max(0, weights[index]);
    if (choice < 0) return values[index];
  }
  return values[values.length - 1];
}

function chooseLoot() {
  const lootConfig = config.loot;
  if (!lootConfig.items.length) return null;
  const grouped = new Map();
  for (const item of lootConfig.items) {
    const rarity = item.rarity || "common";
    if (!grouped.has(rarity)) grouped.set(rarity, []);
    grouped.get(rarity).push(item);
  }
  const weights = hardMode ? lootConfig.hardModeRarityWeights : lootConfig.rarityWeights;
  const rarities = [...grouped.keys()];
  const rarity = weightedChoice(rarities, rarities.map((value) => Number(weights[value] ?? 1)));
  const options = grouped.get(rarity);
  return weightedChoice(options, options.map((item) => Number(item.weight ?? 1)));
}

function openChest() {
  const chestEntry = Object.entries(entities).find(([key, entity]) => {
    if (entity.type !== "chest") return false;
    const [x, y] = parsePosition(key);
    return Math.abs(x - player.x) + Math.abs(y - player.y) <= 1;
  });
  if (!chestEntry) {
    message = "No chest close enough to open.";
    return;
  }

  const [key, chest] = chestEntry;
  if (chest.locked) {
    message = `${chest.name} is locked.`;
    return;
  }
  const loot = chooseLoot();
  delete entities[key];
  if (!loot) {
    message = "The chest is empty.";
    return;
  }
  inventory.push(loot);
  if (loot.type === "weapon" && Number(loot.damageBonus) > (player.damage - config.player.damage)) {
    player.damage = config.player.damage + Number(loot.damageBonus);
    player.weapon = loot.name;
    message = `Found and equipped ${loot.name} (${loot.rarity}).`;
  } else {
    message = `Found ${loot.rarity} ${loot.name}.${loot.type === "potion" ? " Press H to use." : ""}`;
  }
}

function usePotion() {
  const index = inventory.findIndex((item) => item.type === "potion");
  if (index < 0) {
    message = "You have no potions.";
    return;
  }
  if (player.hp >= player.maxHp) {
    message = "Your health is already full.";
    return;
  }
  const [potion] = inventory.splice(index, 1);
  const healed = Math.min(Number(potion.heal ?? 10), player.maxHp - player.hp);
  player.hp += healed;
  message = `Used ${potion.name}; restored ${healed} HP.`;
}

function attack() {
  const enemy = Object.entries(entities).find(([key, entity]) => {
    if (entity.type !== "enemy") return false;
    const [x, y] = parsePosition(key);
    return Math.abs(x - player.x) + Math.abs(y - player.y) === 1;
  });
  if (!enemy) {
    message = "No enemy close enough to attack.";
    return;
  }
  const [key, target] = enemy;
  target.hp -= player.damage;
  message = `You hit ${target.name} for ${player.damage} damage.`;
  if (target.hp <= 0) {
    delete entities[key];
    message = `You defeated ${target.name}!`;
  }
}

function handleKey(key) {
  if (state === "round-start" || state === "intermission" || state === "paused") {
    if (key === "enter" || key === " ") startRound();
    return;
  }
  if (state !== "playing") return;
  if (key === "escape") {
    state = "paused";
    showOverlay("Paused", "The horde can wait. Take a moment, then jump back in.", "paused");
    return;
  }
  if (key === " " || key === "space") {
    attack();
    return;
  }
  if (key === "e") {
    openChest();
    return;
  }
  if (key === "h") {
    usePotion();
    return;
  }

  const next = { x: player.x, y: player.y };
  if (key === "w" || key === "arrowup") next.y -= 1;
  else if (key === "s" || key === "arrowdown") next.y += 1;
  else if (key === "a" || key === "arrowleft") next.x -= 1;
  else if (key === "d" || key === "arrowright") next.x += 1;
  else return;

  const occupied = entities[positionKey(next.x, next.y)];
  if (
    next.y >= 0 && next.y < gameMap.length
    && next.x >= 0 && next.x < gameMap[next.y].length
    && gameMap[next.y][next.x] !== "#"
    && !occupied
  ) {
    player.x = next.x;
    player.y = next.y;
  }
}

function findZombieStep(startX, startY, occupied) {
  const queue = [{ x: startX, y: startY, first: null }];
  const visited = new Set([positionKey(startX, startY)]);
  while (queue.length) {
    const current = queue.shift();
    if (current.x === player.x && current.y === player.y) return current.first;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = positionKey(x, y);
      if (
        visited.has(key) || y < 0 || y >= gameMap.length || x < 0 || x >= gameMap[y].length
        || gameMap[y][x] === "#" || (occupied.has(key) && !(x === player.x && y === player.y))
      ) continue;
      visited.add(key);
      queue.push({ x, y, first: current.first || { x, y } });
    }
  }
  return null;
}

function makeLinePath(start, target, range) {
  let { x, y } = start;
  const dx = Math.abs(target.x - x);
  const dy = Math.abs(target.y - y);
  const sx = x < target.x ? 1 : -1;
  const sy = y < target.y ? 1 : -1;
  let error = dx - dy;
  const path = [];
  while ((x !== target.x || y !== target.y) && path.length < range) {
    const doubled = 2 * error;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
    path.push({ x, y });
  }
  return path;
}

function spawnEnemy(now) {
  const candidates = [];
  for (let y = 1; y < gameMap.length - 1; y += 1) {
    for (let x = 1; x < gameMap[y].length - 1; x += 1) {
      if (
        gameMap[y][x] === "." && !entities[positionKey(x, y)]
        && Math.abs(x - player.x) + Math.abs(y - player.y) >= 7
      ) candidates.push({ x, y });
    }
  }
  if (!candidates.length) return false;
  const { x, y } = candidates[Math.floor(Math.random() * candidates.length)];
  const symbol = Math.random() < 0.25 ? "S" : "Z";
  const enemyConfig = config.enemies[symbol];
  const damageBonus = Math.floor((roundNumber - 1) / 10) * config.rounds.damageBonusEveryTenRounds;
  entities[positionKey(x, y)] = {
    type: "enemy",
    symbol,
    name: enemyConfig.name,
    hp: enemyConfig.health + Math.floor(roundNumber / 5) * config.rounds.enemyHealthPerFiveRounds,
    damage: (enemyConfig.damage + damageBonus) * (hardMode ? 2 : 1),
    nextAttack: now + enemyConfig.attackIntervalMs,
    nextMove: now + config.rounds.zombieMoveIntervalMs
  };
  remainingToSpawn -= 1;
  return true;
}

function updateEnemies(now) {
  const occupied = new Set(Object.keys(entities));
  for (const [key, enemy] of Object.entries(entities)) {
    if (enemy.type !== "enemy" || state !== "playing") continue;
    const [x, y] = parsePosition(key);
    const distance = Math.abs(x - player.x) + Math.abs(y - player.y);
    if (enemy.symbol === "Z") {
      if (distance === 1 && now >= enemy.nextAttack) {
        player.hp = Math.max(0, player.hp - enemy.damage);
        enemy.nextAttack = now + config.enemies.Z.attackIntervalMs;
        message = `${enemy.name} bites you for ${enemy.damage} damage!`;
      } else if (distance > 1 && now >= enemy.nextMove) {
        const step = findZombieStep(x, y, occupied);
        if (step) {
          delete entities[key];
          entities[positionKey(step.x, step.y)] = enemy;
          occupied.delete(key);
          occupied.add(positionKey(step.x, step.y));
        }
        enemy.nextMove = now + config.rounds.zombieMoveIntervalMs;
      }
    } else if (now >= enemy.nextAttack) {
      const path = makeLinePath({ x, y }, player, config.enemies.S.arrowRange);
      const clearPath = [];
      for (const tile of path) {
        if (gameMap[tile.y][tile.x] === "#") break;
        clearPath.push(tile);
      }
      if (clearPath.length) {
        projectiles.push({
          path: clearPath,
          index: -1,
          nextStep: now + config.enemies.S.arrowStepMs,
          damage: enemy.damage
        });
        enemy.nextAttack = now + config.enemies.S.attackIntervalMs;
      }
    }
  }
}

function updateProjectiles(now) {
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index];
    while (now >= projectile.nextStep) {
      projectile.index += 1;
      projectile.nextStep += config.enemies.S.arrowStepMs;
      if (projectile.index >= projectile.path.length) {
        projectiles.splice(index, 1);
        break;
      }
      const tile = projectile.path[projectile.index];
      if (tile.x === player.x && tile.y === player.y && player.hp > 0) {
        player.hp = Math.max(0, player.hp - projectile.damage);
        message = `A skeleton arrow hits you for ${projectile.damage} damage!`;
        projectiles.splice(index, 1);
        break;
      }
    }
  }
}

function finishRound() {
  if (player.hp <= 0) {
    state = "gameover";
    showOverlay("Game over.", `You reached round ${roundNumber}. Give it another go?`, "gameover");
    return;
  }
  if (remainingToSpawn !== 0 || Object.values(entities).some((entity) => entity.type === "enemy")) return;
  if (roundNumber === 30 && !hardUnlocked) {
    hardUnlocked = true;
    localStorage.setItem("dungeon-hard-unlocked", "true");
    state = "victory";
    showOverlay("Round 30 cleared!", "Hard mode is unlocked in this browser. Ready for a tougher run?", "victory");
    return;
  }
  roundNumber += 1;
  beginRound(roundNumber);
  state = "intermission";
  message = `Round cleared. Prepare for round ${roundNumber}.`;
  showOverlay(`Round ${roundNumber}`, message, "intermission");
}

function update(now) {
  if (state !== "playing") return;
  if (remainingToSpawn > 0 && now >= nextSpawnAt) {
    if (spawnEnemy(now)) nextSpawnAt = now + spawnInterval;
    else nextSpawnAt = now + 200;
  }
  updateEnemies(now);
  updateProjectiles(now);
  finishRound();
}

function draw() {
  const width = config?.map.width ?? 40;
  const height = config?.map.height ?? 15;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111711";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!gameMap.length) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        context.fillStyle = (x + y) % 2 ? "#151b15" : "#171e17";
        context.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
      }
    }
    return;
  }

  for (let y = 0; y < gameMap.length; y += 1) {
    for (let x = 0; x < gameMap[y].length; x += 1) {
      const wall = gameMap[y][x] === "#";
      context.fillStyle = wall ? "#303030" : (x + y) % 2 ? "#000000" : "#242424";
      context.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
      if (wall) {
        context.fillStyle = "#fff";
        context.fillText("#", x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
      }
    }
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 13px monospace";
  for (const [key, entity] of Object.entries(entities)) {
    const [x, y] = parsePosition(key);
    context.fillStyle = "#fff";
    context.fillText(entity.symbol, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
  }
  context.fillStyle = "#fff";
  for (const projectile of projectiles) {
    if (projectile.index >= 0 && projectile.index < projectile.path.length) {
      const tile = projectile.path[projectile.index];
      context.fillText("*", tile.x * cellSize + cellSize / 2, tile.y * cellSize + cellSize / 2);
    }
  }
  context.fillStyle = "#ffffff";
  context.fillText("@", player.x * cellSize + cellSize / 2, player.y * cellSize + cellSize / 2);
}

function updateUi() {
  document.querySelector("#round-number").textContent = gameMap.length ? String(roundNumber) : "—";
  document.querySelector("#round-pill").classList.toggle("is-hidden", !gameMap.length);
  document.querySelector("#health-value").textContent = player.maxHp ? `${player.hp} / ${player.maxHp}` : "—";
  document.querySelector("#weapon-value").textContent = player.weapon;
  document.querySelector("#damage-value").textContent = String(player.damage);
  const healthFill = document.querySelector("#health-fill");
  healthFill.style.width = `${player.maxHp ? Math.max(0, player.hp / player.maxHp) * 100 : 0}%`;
  healthFill.classList.toggle("is-low", player.maxHp > 0 && player.hp / player.maxHp <= 0.3);
  document.querySelector("#status-message").textContent = message;
  const activeEnemies = Object.values(entities).filter((entity) => entity.type === "enemy").length;
  document.querySelector("#enemy-counter").innerHTML = gameMap.length
    ? `Enemies <strong>${remainingToSpawn + activeEnemies}</strong>`
    : "Enemies <strong>—</strong>";
  document.querySelector("#inventory-count").textContent = `${inventory.length} ITEM${inventory.length === 1 ? "" : "S"}`;
  const list = document.querySelector("#inventory-list");
  list.replaceChildren();
  if (!inventory.length) {
    const empty = document.createElement("li");
    empty.className = "empty-inventory";
    empty.textContent = "Nothing in your pack.";
    list.append(empty);
  } else {
    for (const item of inventory) {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = item.name;
      const rarity = document.createElement("span");
      rarity.textContent = item.rarity;
      rarity.style.color = rarityColors[item.rarity] || rarityColors.common;
      row.append(name, rarity);
      list.append(row);
    }
  }
}

function frame(now) {
  if (config) update(now);
  draw();
  updateUi();
  requestAnimationFrame(frame);
}

normalButton.addEventListener("click", () => config && beginGame(false));
hardButton.addEventListener("click", () => {
  if (config && hardUnlocked) beginGame(true);
});
continueButton.addEventListener("click", startRound);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
  if (event.repeat && [" ", "e", "h", "escape"].includes(key)) return;
  if (key === "enter") {
    handleKey("enter");
    return;
  }
  handleKey(key);
});

document.querySelectorAll("[data-key]").forEach((button) => {
  button.addEventListener("click", () => handleKey(button.dataset.key));
});

async function loadConfig() {
  try {
    const response = await fetch("assets/game-config.json");
    if (!response.ok) throw new Error(`Could not load game configuration (${response.status}).`);
    config = await response.json();
    if (!config.map || !config.rounds || !config.enemies || !config.loot) {
      throw new Error("The game configuration is missing a required section.");
    }
    canvas.width = config.map.width * cellSize;
    canvas.height = config.map.height * cellSize;
    spawnInterval = config.rounds.spawnIntervalMs;
    state = "menu";
    showMenu();
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Could not load game configuration.";
    configError.textContent = `${lastError} Run the site from a web server and check assets/game-config.json.`;
    configError.classList.remove("is-hidden");
    normalButton.disabled = true;
    hardButton.disabled = true;
    state = "error";
  }
}

showOverlay("Loading the dungeon...", "Getting the map and loot tables ready.", "round-start");
loadConfig();
requestAnimationFrame(frame);
