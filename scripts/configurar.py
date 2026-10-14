#!/usr/bin/env python3
"""Crea credenciales propias sin mostrarlas ni sobrescribir una instalación."""
import getpass
import os
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    target = ROOT / ".env"
    if target.exists():
        raise SystemExit("Ya existe .env. Conserva sus credenciales; no se ha modificado.")
    password = getpass.getpass("Contraseña de acceso (al menos 12 caracteres): ")
    if len(password) < 12 or any(c in password for c in ('\n', '\r', '"', "'", "\\", "`")):
        raise SystemExit("Usa al menos 12 caracteres, sin comillas, barras inversas ni saltos de línea.")
    if password != getpass.getpass("Repite la contraseña: "):
        raise SystemExit("Las contraseñas no coinciden.")
    content = (
        f'STATICRYPT_PASSWORD="{password}"\n'
        f'SYNC_AUTH_SECRET={secrets.token_hex(32)}\n'
        'HOST=127.0.0.1\nPORT=8110\n'
        'ALLOWED_ORIGINS=http://localhost:8110,http://127.0.0.1:8110\n'
    )
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(content)
    print("Configuración privada creada en .env (permisos 0600). No se muestra ninguna credencial.")


if __name__ == "__main__":
    main()
