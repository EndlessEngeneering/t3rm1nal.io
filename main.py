import configparser
import curses
import json
import os
import random
import time


MAP_WIDTH = 40
MAP_HEIGHT = 15
PLAYER_DAMAGE = 4
PLAYER_HP = 30
HARD_MODE_HP = 20


def line_path(start, target, max_tiles=10):
    """Return up to max_tiles grid positions along a straight line."""
    x0, y0 = start
    x1, y1 = target
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    error = dx - dy
    path = []

    while (x0, y0) != (x1, y1) and len(path) < max_tiles:
        doubled_error = 2 * error
        if doubled_error > -dy:
            error -= dy
            x0 += sx
        if doubled_error < dx:
            error += dx
            y0 += sy
        path.append((x0, y0))
    return path


def choose_loot(game_assets, hard_mode=False):
    loot_items = [
        dict(game_assets.items(section))
        for section in game_assets.sections()
        if section.startswith("loot.") and section != "loot.rarity_weights"
    ]
    if not loot_items:
        return None

    weight_section = "hard.rarity_weights" if hard_mode else "loot.rarity_weights"
    rarity_weights = (
        {
            rarity.lower(): float(weight)
            for rarity, weight in game_assets.items(weight_section)
        }
        if game_assets.has_section(weight_section)
        else {}
    )
    items_by_rarity = {}
    for item in loot_items:
        items_by_rarity.setdefault(item.get("rarity", "common").lower(), []).append(item)

    rarities = list(items_by_rarity)
    rarity = random.choices(
        rarities,
        weights=[rarity_weights.get(value, 1.0) for value in rarities],
        k=1
    )[0]
    options = items_by_rarity[rarity]
    return random.choices(
        options,
        weights=[float(item.get("weight", "1")) for item in options],
        k=1
    )[0]


def load_assets_cfg(filename="assets.cfg"):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config = configparser.ConfigParser()
    config.read(os.path.join(script_dir, filename))
    return config


def load_progress():
    progress_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), ".dungeon_progress.json"
    )
    if not os.path.exists(progress_path):
        return False
    with open(progress_path, "r", encoding="utf-8") as progress_file:
        progress = json.load(progress_file)
    return bool(progress.get("hard_mode_unlocked", False))


def save_hard_mode_unlock():
    progress_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), ".dungeon_progress.json"
    )
    with open(progress_path, "w", encoding="utf-8") as progress_file:
        json.dump({"hard_mode_unlocked": True}, progress_file)


def generate_round(round_number):
    game_map = [["#" if x in (0, MAP_WIDTH - 1) or y in (0, MAP_HEIGHT - 1)
                 else "." for x in range(MAP_WIDTH)] for y in range(MAP_HEIGHT)]
    player_start = (MAP_WIDTH // 2, MAP_HEIGHT // 2)

    for _ in range(18 + round_number // 2):
        x = random.randint(2, MAP_WIDTH - 3)
        y = random.randint(2, MAP_HEIGHT - 3)
        if abs(x - player_start[0]) + abs(y - player_start[1]) >= 5:
            game_map[y][x] = "#"

    open_tiles = [
        (x, y)
        for y in range(1, MAP_HEIGHT - 1)
        for x in range(1, MAP_WIDTH - 1)
        if game_map[y][x] != "#"
        and abs(x - player_start[0]) + abs(y - player_start[1]) >= 7
    ]
    random.shuffle(open_tiles)

    enemy_count = 3 + round_number
    chest_positions = []
    for x, y in open_tiles[:2]:
        game_map[y][x] = "C"
        chest_positions.append((x, y))

    return game_map, player_start, chest_positions, enemy_count


def make_chests(chest_positions, game_assets):
    chests = {}
    for position in chest_positions:
        chests[position] = {
            "name": game_assets.get("chests.C", "name", fallback="Chest"),
            "locked": game_assets.getboolean("chests.C", "locked", fallback=False),
            "type": "chest",
            "symbol": "C"
        }
    return chests


def find_zombie_step(start, target, game_map, occupied):
    queue = [(start, [])]
    visited = {start}
    while queue:
        (x, y), path = queue.pop(0)
        if (x, y) == target:
            return path[0] if path else start
        for next_position in (
            (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)
        ):
            next_x, next_y = next_position
            if (
                next_position not in visited
                and 0 <= next_y < len(game_map)
                and 0 <= next_x < len(game_map[next_y])
                and game_map[next_y][next_x] != "#"
                and (next_position == target or next_position not in occupied)
            ):
                visited.add(next_position)
                queue.append((next_position, path + [next_position]))
    return start


def main(stdscr):
    curses.start_color()
    curses.use_default_colors()
    curses.init_pair(1, curses.COLOR_WHITE, -1)
    curses.curs_set(0)
    stdscr.timeout(50)

    game_assets = load_assets_cfg()
    hard_unlocked = load_progress()
    state = "menu"
    hard_mode = False

    while True:
        current_time = time.monotonic()
        key = stdscr.getch()
        if key in (ord("q"), ord("Q")):
            break

        stdscr.erase()
        screen_height, screen_width = stdscr.getmaxyx()

        def draw_centered(row, text):
            if 0 <= row < screen_height and screen_width > 1:
                x = max(0, (screen_width - len(text)) // 2)
                stdscr.addnstr(row, x, text, max(0, screen_width - x - 1))

        if state == "menu":
            draw_centered(2, "DUNGEON SURVIVAL")
            draw_centered(5, "1 - Normal mode")
            draw_centered(
                6,
                "2 - Hard mode" if hard_unlocked else "2 - Hard mode (locked: beat round 30)"
            )
            draw_centered(9, "WASD move | Space attack | E open chest | H use potion | Q quit")
            if key == ord("1") or (key == ord("2") and hard_unlocked):
                hard_mode = key == ord("2")
                round_number = 1
                max_hp = HARD_MODE_HP if hard_mode else PLAYER_HP
                player_hp = max_hp
                player_damage = PLAYER_DAMAGE
                equipped_weapon = "Fists"
                weapon_bonus = 0
                inventory = []
                projectiles = []
                state = "round_start"
                game_map, player_start, chest_positions, spawn_remaining = (
                    generate_round(round_number)
                )
                player_x, player_y = player_start
                live_entities = make_chests(chest_positions, game_assets)
                next_spawn = current_time + 0.5
                spawn_interval = 1.0
                ui_message = "Clear the wave to advance."
        elif state in ("round_start", "intermission"):
            draw_centered(3, f"ROUND {round_number}")
            draw_centered(5, "Hard mode" if hard_mode else "Normal mode")
            draw_centered(7, "Press Enter to begin" if state == "round_start" else "Press Enter for the next round")
            draw_centered(9, ui_message)
            if key in (curses.KEY_ENTER, 10, 13, ord(" ")):
                state = "playing"
                next_spawn = current_time + 0.5
        elif state == "game_over":
            draw_centered(4, "GAME OVER")
            draw_centered(6, f"You reached round {round_number}.")
            draw_centered(8, "Press Enter to return to the mode select.")
            if key in (curses.KEY_ENTER, 10, 13, ord(" ")):
                state = "menu"
        elif state == "victory":
            draw_centered(4, "ROUND 30 CLEARED!")
            draw_centered(6, "Hard mode is now unlocked.")
            draw_centered(8, "Press Enter to return to the mode select.")
            if key in (curses.KEY_ENTER, 10, 13, ord(" ")):
                state = "menu"
        elif state == "playing":
            next_x, next_y = player_x, player_y
            if player_hp > 0:
                if key in (ord("w"), ord("W")):
                    next_y -= 1
                elif key in (ord("s"), ord("S")):
                    next_y += 1
                elif key in (ord("a"), ord("A")):
                    next_x -= 1
                elif key in (ord("d"), ord("D")):
                    next_x += 1

                if (
                    0 <= next_y < len(game_map)
                    and 0 <= next_x < len(game_map[next_y])
                    and game_map[next_y][next_x] != "#"
                    and (next_x, next_y) not in live_entities
                ):
                    player_x, player_y = next_x, next_y

                if key == ord(" "):
                    adjacent_enemies = [
                        (position, entity)
                        for position, entity in live_entities.items()
                        if entity["type"] == "enemy"
                        and abs(position[0] - player_x) + abs(position[1] - player_y) == 1
                    ]
                    if adjacent_enemies:
                        position, enemy = adjacent_enemies[0]
                        enemy["hp"] -= player_damage
                        ui_message = f"You hit {enemy['name']} for {player_damage} damage."
                        if enemy["hp"] <= 0:
                            del live_entities[position]
                            ui_message = f"You defeated {enemy['name']}!"
                    else:
                        ui_message = "No enemy close enough to attack."
                elif key in (ord("e"), ord("E")):
                    adjacent_chests = [
                        (position, entity)
                        for position, entity in live_entities.items()
                        if entity["type"] == "chest"
                        and abs(position[0] - player_x) + abs(position[1] - player_y) <= 1
                    ]
                    if adjacent_chests:
                        position, chest = adjacent_chests[0]
                        if chest["locked"]:
                            ui_message = f"{chest['name']} is locked."
                        else:
                            loot = choose_loot(game_assets, hard_mode)
                            del live_entities[position]
                            chest_positions.remove(position)
                            game_map[position[1]][position[0]] = "."
                            if loot is None:
                                ui_message = "The chest is empty."
                            else:
                                inventory.append(loot)
                                loot_name = loot.get("name", "Unknown item")
                                if loot.get("type", "").lower() == "weapon":
                                    bonus = int(loot.get("damage_bonus", "0"))
                                    if bonus > weapon_bonus:
                                        weapon_bonus = bonus
                                        player_damage = PLAYER_DAMAGE + weapon_bonus
                                        equipped_weapon = loot_name
                                        ui_message = f"Found and equipped {loot_name} ({loot.get('rarity', 'common')})."
                                    else:
                                        ui_message = f"Found {loot.get('rarity', 'common')} {loot_name}."
                                else:
                                    ui_message = f"Found {loot.get('rarity', 'common')} {loot_name}. Press H to use."
                    else:
                        ui_message = "No chest close enough to open."
                elif key in (ord("h"), ord("H")):
                    potion_index = next(
                        (
                            index for index, item in enumerate(inventory)
                            if item.get("type", "").lower() == "potion"
                        ),
                        None
                    )
                    if potion_index is None:
                        ui_message = "You have no potions."
                    elif player_hp >= max_hp:
                        ui_message = "Your health is already full."
                    else:
                        potion = inventory.pop(potion_index)
                        healing = int(potion.get("heal", "10"))
                        actual_healing = min(healing, max_hp - player_hp)
                        player_hp += actual_healing
                        ui_message = f"Used {potion.get('name', 'potion')}; restored {actual_healing} HP."

            if spawn_remaining > 0 and current_time >= next_spawn:
                spawn_candidates = [
                    (x, y)
                    for y in range(1, MAP_HEIGHT - 1)
                    for x in range(1, MAP_WIDTH - 1)
                    if game_map[y][x] == "."
                    and (x, y) not in live_entities
                    and abs(x - player_x) + abs(y - player_y) >= 7
                ]
                if spawn_candidates:
                    spawn_x, spawn_y = random.choice(spawn_candidates)
                    symbol = "S" if random.random() < 0.25 else "Z"
                    enemy_section = f"enemies.{symbol}"
                    round_bonus = (round_number - 1) // 10
                    damage = game_assets.getint(enemy_section, "damage", fallback=2)
                    if hard_mode:
                        damage *= 2
                    damage += round_bonus
                    live_entities[(spawn_x, spawn_y)] = {
                        "name": game_assets.get(enemy_section, "name", fallback="Monster"),
                        "hp": game_assets.getint(enemy_section, "hp", fallback=10) + round_number // 5,
                        "damage": damage,
                        "type": "enemy",
                        "symbol": symbol,
                        "next_attack": current_time + (1.0 if symbol == "Z" else 2.0),
                        "next_move": current_time + 0.45
                    }
                    spawn_remaining -= 1
                next_spawn = current_time + spawn_interval

            occupied = set(live_entities) | set(chest_positions)
            for position, enemy in list(live_entities.items()):
                if enemy["type"] != "enemy" or player_hp <= 0:
                    continue
                if enemy["symbol"] == "Z":
                    distance = abs(position[0] - player_x) + abs(position[1] - player_y)
                    if distance == 1 and current_time >= enemy["next_attack"]:
                        player_hp = max(0, player_hp - enemy["damage"])
                        enemy["next_attack"] = current_time + 1.0
                        ui_message = f"{enemy['name']} bites you for {enemy['damage']} damage!"
                    elif distance > 1 and current_time >= enemy["next_move"]:
                        new_position = find_zombie_step(
                            position, (player_x, player_y), game_map, occupied - {position}
                        )
                        if new_position != position:
                            del live_entities[position]
                            live_entities[new_position] = enemy
                            occupied.remove(position)
                            occupied.add(new_position)
                        enemy["next_move"] = current_time + 0.45
                elif enemy["symbol"] == "S" and current_time >= enemy["next_attack"]:
                    path = line_path(position, (player_x, player_y))
                    clear_path = []
                    for tile_x, tile_y in path:
                        if game_map[tile_y][tile_x] == "#":
                            break
                        clear_path.append((tile_x, tile_y))
                    if clear_path:
                        projectiles.append({
                            "path": clear_path,
                            "index": -1,
                            "next_step": current_time + 0.2,
                            "damage": enemy["damage"]
                        })
                        enemy["next_attack"] = current_time + 2.0

            for projectile in list(projectiles):
                while current_time >= projectile["next_step"]:
                    projectile["index"] += 1
                    projectile["next_step"] += 0.2
                    if projectile["index"] >= len(projectile["path"]):
                        projectiles.remove(projectile)
                        break
                    arrow_x, arrow_y = projectile["path"][projectile["index"]]
                    if game_map[arrow_y][arrow_x] == "#":
                        projectiles.remove(projectile)
                        break
                    if (arrow_x, arrow_y) == (player_x, player_y) and player_hp > 0:
                        player_hp = max(0, player_hp - projectile["damage"])
                        ui_message = f"A skeleton arrow hits you for {projectile['damage']} damage!"
                        projectiles.remove(projectile)
                        break

            if player_hp <= 0:
                state = "game_over"
            elif spawn_remaining == 0 and not any(
                entity["type"] == "enemy" for entity in live_entities.values()
            ):
                if round_number == 30 and not hard_unlocked:
                    save_hard_mode_unlock()
                    hard_unlocked = True
                    state = "victory"
                else:
                    round_number += 1
                    game_map, player_start, chest_positions, spawn_remaining = (
                        generate_round(round_number)
                    )
                    player_x, player_y = player_start
                    live_entities = make_chests(chest_positions, game_assets)
                    projectiles = []
                    ui_message = f"Round cleared! Prepare for round {round_number}."
                    state = "intermission"

            for y, row in enumerate(game_map):
                if y >= screen_height:
                    break
                stdscr.addnstr(y, 0, "".join(row), max(0, screen_width - 1))
            for (entity_x, entity_y), entity in live_entities.items():
                if entity_y < screen_height and entity_x < screen_width - 1:
                    stdscr.addch(entity_y, entity_x, entity["symbol"], curses.color_pair(1))
            for chest_x, chest_y in chest_positions:
                if (chest_x, chest_y) not in live_entities and chest_y < screen_height:
                    stdscr.addch(chest_y, chest_x, "C", curses.color_pair(1))
            for projectile in projectiles:
                if projectile["index"] >= 0:
                    arrow_x, arrow_y = projectile["path"][projectile["index"]]
                    if arrow_y < screen_height and arrow_x < screen_width - 1:
                        stdscr.addch(arrow_y, arrow_x, "*", curses.color_pair(1))

            if 0 <= player_y < screen_height and 0 <= player_x < screen_width - 1:
                stdscr.addch(
                    player_y, player_x, "@" if player_hp > 0 else "X",
                    curses.color_pair(1)
                )
            hud_row = MAP_HEIGHT + 1
            if hud_row < screen_height:
                stdscr.addnstr(
                    hud_row, 0,
                    f"Round: {round_number} | HP: {player_hp}/{max_hp} | "
                    f"Weapon: {equipped_weapon} | Damage: {player_damage}",
                    max(0, screen_width - 1), curses.color_pair(1)
                )
            if hud_row + 1 < screen_height:
                stdscr.addnstr(
                    hud_row + 1, 0,
                    f"Enemies left: {spawn_remaining + sum(e['type'] == 'enemy' for e in live_entities.values())} | {ui_message}",
                    max(0, screen_width - 1), curses.color_pair(1)
                )
            if hud_row + 2 < screen_height:
                inventory_names = ", ".join(item["name"] for item in inventory) or "empty"
                stdscr.addnstr(
                    hud_row + 2, 0, f"Inventory: {inventory_names}",
                    max(0, screen_width - 1), curses.color_pair(1)
                )

        stdscr.refresh()


if __name__ == "__main__":
    curses.wrapper(main)
