#!/usr/bin/env python3
"""
DBmanager.py — správa databáze MMA klubu

Použití:
  python DBmanager.py init    — spustí Docker kontejnery (docker compose up -d)
  python DBmanager.py export  — záloha databáze do dump.sql
  python DBmanager.py import  — obnoví databázi z dump.sql

Bez argumentu se zobrazí interaktivní menu.
"""

import argparse
import os
import subprocess
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DUMP_FILE = os.path.join(SCRIPT_DIR, "dump.sql")
CONTAINER = "dbs2_postgres"
DB_USER = "admin_dbs2"
DB_NAME = "mma_club_db"

_DOCKER_DESKTOP_PATHS = [
    r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"),
]


def _docker_responsive() -> bool:
    try:
        r = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        return r.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def ensure_docker() -> bool:
    if _docker_responsive():
        return True

    print("⏳ Docker není spuštěn. Hledám Docker Desktop...")
    exe = next((p for p in _DOCKER_DESKTOP_PATHS if os.path.exists(p)), None)
    if exe is None:
        print("❌ Docker Desktop nenalezen. Nainstaluj ho a zkus znovu.")
        return False

    print(f"🚀 Spouštím: {exe}")
    subprocess.Popen([exe])

    print("⏳ Čekám na Docker", end="", flush=True)
    for _ in range(60):
        time.sleep(2)
        if _docker_responsive():
            print(" ✅")
            return True
        print(".", end="", flush=True)

    print("\n❌ Docker se nepodařilo spustit do 120 s.")
    return False


def cmd_init():
    """Spustí Docker kontejnery přes docker compose up -d."""
    if not ensure_docker():
        sys.exit(1)

    print("⏳ Spouštím kontejnery...")
    r = subprocess.run(["docker", "compose", "up", "-d"], cwd=SCRIPT_DIR)
    if r.returncode != 0:
        print("❌ docker compose up -d selhal.")
        sys.exit(r.returncode)

    print("✅ Kontejnery běží!")
    print("🌐 pgAdmin4: http://localhost:8080")


def cmd_export():
    """Záloha databáze do dump.sql pomocí pg_dump."""
    if not ensure_docker():
        sys.exit(1)

    print(f"⏳ Exportuji databázi do: {DUMP_FILE}")
    with open(DUMP_FILE, "w", encoding="utf-8") as f:
        r = subprocess.run(
            ["docker", "exec", CONTAINER, "pg_dump", "-U", DB_USER, DB_NAME],
            stdout=f,
        )

    if r.returncode != 0:
        print(f"❌ Export selhal. Běží kontejner '{CONTAINER}'?")
        print("💡 Zkus nejdříve: python DBmanager.py init")
        sys.exit(r.returncode)

    print(f"✅ Dump uložen: {DUMP_FILE}")


def cmd_import():
    """Obnoví databázi z dump.sql pomocí psql — nejdříve dropne a znovu vytvoří DB."""
    if not os.path.exists(DUMP_FILE):
        print(f"❌ Soubor {DUMP_FILE} nenalezen.")
        print("💡 Nejdříve proveď export: python DBmanager.py export")
        sys.exit(1)

    if not ensure_docker():
        sys.exit(1)

    def psql_postgres(sql: str):
        return subprocess.run(
            ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", "postgres", "-c", sql],
            capture_output=True,
        )

    print("⏳ Ukončuji aktivní spojení k databázi...")
    psql_postgres(
        f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{DB_NAME}';"
    )

    print(f"⏳ Mažu databázi {DB_NAME}...")
    r = psql_postgres(f"DROP DATABASE IF EXISTS {DB_NAME};")
    if r.returncode != 0:
        print("❌ DROP DATABASE selhal:", r.stderr.decode(errors="replace"))
        sys.exit(r.returncode)

    print(f"⏳ Vytvářím databázi {DB_NAME}...")
    r = psql_postgres(f"CREATE DATABASE {DB_NAME} OWNER {DB_USER};")
    if r.returncode != 0:
        print("❌ CREATE DATABASE selhal:", r.stderr.decode(errors="replace"))
        sys.exit(r.returncode)

    print(f"⏳ Importuji {DUMP_FILE} do databáze...")
    with open(DUMP_FILE, "r", encoding="utf-8") as f:
        r = subprocess.run(
            ["docker", "exec", "-i", CONTAINER, "psql", "-U", DB_USER, DB_NAME],
            stdin=f,
        )

    if r.returncode != 0:
        print(f"❌ Import selhal. Běží kontejner '{CONTAINER}'?")
        print("💡 Zkus nejdříve: python DBmanager.py init")
        sys.exit(r.returncode)

    print("✅ Databáze obnovena z dump.sql")


COMMANDS = {
    "init":   (cmd_init,   "spustí Docker kontejnery (docker compose up -d)"),
    "export": (cmd_export, "záloha databáze do dump.sql"),
    "import": (cmd_import, "obnoví databázi z dump.sql"),
}


def main():
    parser = argparse.ArgumentParser(
        description="DBmanager — správa databáze MMA klubu",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Příkazy:\n" + "\n".join(f"  {k:<8} {v[1]}" for k, v in COMMANDS.items()),
    )
    parser.add_argument("command", choices=list(COMMANDS), nargs="?")
    args = parser.parse_args()

    if args.command:
        COMMANDS[args.command][0]()
        return

    # Interaktivní menu (bez argumentu)
    print("=== DBmanager — MMA klub ===\n")
    keys = list(COMMANDS)
    for i, k in enumerate(keys, 1):
        print(f"  {i}. {k} — {COMMANDS[k][1]}")
    print()

    choice = input("Vyber číslo nebo příkaz: ").strip().lower()
    if choice in COMMANDS:
        COMMANDS[choice][0]()
    elif choice.isdigit() and 1 <= int(choice) <= len(keys):
        COMMANDS[keys[int(choice) - 1]][0]()
    else:
        print("❌ Neznámý příkaz.")
        sys.exit(1)


if __name__ == "__main__":
    main()
