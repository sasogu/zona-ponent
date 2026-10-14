#!/usr/bin/env python3
"""Genera un sitio cifrado usando fuentes locales y credenciales propias."""
import hashlib
import hmac
import html
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def configuration():
    values = {}
    env_file = ROOT / ".env"
    if env_file.is_file():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, sep, value = line.partition("=")
            if not sep:
                raise ValueError("Línea inválida en .env; no se muestra su contenido.")
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            values[key.strip()] = value
    for key in ("STATICRYPT_PASSWORD", "SYNC_AUTH_SECRET"):
        if key in os.environ:
            values[key] = os.environ[key]
    if len(values.get("STATICRYPT_PASSWORD", "")) < 12:
        raise ValueError("Falta una contraseña de al menos 12 caracteres. Ejecuta scripts/configurar.py.")
    if not re.fullmatch(r"[a-f0-9]{64}", values.get("SYNC_AUTH_SECRET", "")):
        raise ValueError("SYNC_AUTH_SECRET debe contener 32 bytes hexadecimales.")
    return values


def validated_decks(conf):
    decks, slugs = [], set()
    for entry in conf.get("decks", []):
        slug = entry.get("slug", "")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug in slugs:
            raise ValueError("Cada presentación necesita un slug único con letras minúsculas, números y guiones.")
        source = (ROOT / entry["source"]).resolve()
        if not source.is_file() or source.suffix.lower() != ".html":
            raise ValueError("La fuente de una presentación debe ser un archivo HTML existente.")
        text = source.read_text()
        if not re.search(r"</body\s*>", text, re.I) or "Reveal.initialize" not in text:
            raise ValueError("Cada presentación debe incluir body y Reveal.initialize.")
        if re.search(r"\bPONENTE_(SYNC_TOPIC|STORAGE_KEY|SYNC_TOKEN)\b", text):
            raise ValueError("Usa el HTML fuente, sin configuración de otra instalación.")
        slugs.add(slug)
        decks.append((entry, text))
    if not decks:
        raise ValueError("El manifiesto no incluye presentaciones.")
    return decks


def credentials(password, secret, slug):
    topic = "p-" + hashlib.sha256(f"{password}:{slug}".encode()).hexdigest()[:32]
    key = hmac.new(password.encode(), f"ponente-notes-v1:{slug}".encode(), hashlib.sha256).hexdigest()
    token = hmac.new(bytes.fromhex(secret), topic.encode(), hashlib.sha256).hexdigest()
    return topic, key, token


def main():
    config = configuration()
    manifest = ROOT / "presentaciones.json"
    if not manifest.is_file():
        manifest = ROOT / "presentaciones.example.json"
    conf = json.loads(manifest.read_text())
    decks = validated_decks(conf)
    cli = ROOT / "node_modules/.bin/staticrypt"
    reveal = ROOT / "node_modules/reveal.js/dist"
    if not cli.is_file() or not reveal.is_dir():
        raise ValueError("Faltan dependencias. Ejecuta npm ci.")
    version = hashlib.sha256((ROOT / "web/sync.js").read_bytes()).hexdigest()[:8]
    old_umask = os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix="zona-ponente-") as tmp:
            source, encrypted = Path(tmp) / "source", Path(tmp) / "encrypted"
            source.mkdir()
            rows, embedded = [], []
            for entry, text in decks:
                slug = entry["slug"]
                topic, key, token = credentials(config["STATICRYPT_PASSWORD"], config["SYNC_AUTH_SECRET"], slug)
                embedded.extend((topic, key, token))
                tail = (f"<script>window.PONENTE_SYNC_TOPIC='{topic}';window.PONENTE_STORAGE_KEY='{key}';"
                        f"window.PONENTE_SYNC_TOKEN='{token}';</script>"
                        f'<script src="/ponente/sync.js?v={version}"></script></body>')
                text = re.sub(r"</body\s*>", lambda _: tail, text, count=1, flags=re.I)
                folder = source / "ponente" / slug
                folder.mkdir(parents=True)
                (folder / "index.html").write_text(text)
                title = html.escape(entry.get("title", slug))
                rows.append(f'<article><h2>{title}</h2><p><a href="/ponente/{slug}/?showNotes=true&amp;mando=1">Mando con notas</a> · '
                            f'<a href="/ponente/{slug}/?pantalla=1">Proyector sincronizado</a></p></article>')
            index = ('<!doctype html><html lang="es"><head><meta charset="utf-8">'
                     '<meta name="viewport" content="width=device-width,initial-scale=1">'
                     '<meta name="robots" content="noindex,nofollow"><title>Zona ponente</title>'
                     '<style>body{font:18px/1.6 system-ui;max-width:850px;margin:40px auto;padding:0 20px}'
                     'article{border:1px solid #ddd;border-radius:14px;padding:20px;margin:20px 0}a{color:#9a3412}</style>'
                     '</head><body><h1>' + html.escape(conf.get("title", "Zona ponente")) + '</h1>'
                     '<p>Abre el mando en la tablet y el proyector en otra pantalla. Arrastra la barra naranja para ajustar las notas. '
                     'Un doble toque recupera el reparto inicial.</p>' + ''.join(rows) + '</body></html>')
            (source / "index.html").write_text(index)
            env = dict(os.environ, STATICRYPT_PASSWORD=config["STATICRYPT_PASSWORD"])
            result = subprocess.run([str(cli), str(source), "-r", "-d", str(encrypted), "--short", "--remember", "30",
                                     "--template-title", "Zona ponente", "--template-instructions", "Introduce la contraseña de acceso",
                                     "--template-placeholder", "Contraseña", "--template-button", "Entrar",
                                     "--template-remember", "Recordar en este dispositivo", "--template-error", "Contraseña incorrecta"],
                                    cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode:
                raise ValueError("No se ha podido cifrar el sitio; se conserva la salida anterior.")
            enc_root = encrypted / "source" if (encrypted / "source").is_dir() else encrypted
            pages = list(enc_root.rglob("*.html"))
            if len(pages) != len(decks) + 1:
                raise ValueError("El cifrado no ha producido todas las páginas esperadas.")
            for page in pages:
                text = page.read_text()
                if any(value in text for value in embedded + [config["STATICRYPT_PASSWORD"], config["SYNC_AUTH_SECRET"]]) or re.search(r'<aside\b[^>]*class=[\"\'][^\"\']*notes', text):
                    raise ValueError("La salida contiene datos sin cifrar; no se ha publicado.")
            # Todo el contenido se valida antes de sustituir la salida local.
            stage = Path(tmp) / "dist"
            shutil.copytree(enc_root, stage)
            (stage / "ponente").mkdir(exist_ok=True)
            shutil.copy2(ROOT / "web/sync.js", stage / "ponente/sync.js")
            shutil.copytree(reveal, stage / "vendor/reveal")
            shutil.copytree(ROOT / "node_modules/reveal.js/plugin/notes", stage / "vendor/reveal/plugin/notes")
            shutil.copy2(ROOT / "node_modules/reveal.js/LICENSE", stage / "vendor/reveal/LICENSE")
            output = ROOT / "dist"
            if output.exists():
                shutil.rmtree(output)
            shutil.copytree(stage, output)
    finally:
        os.umask(old_umask)
    salt = ROOT / ".staticrypt.json"
    if salt.exists():
        salt.chmod(0o600)
    print(f"Sitio cifrado generado en dist/: {len(decks)} presentación(es).")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, json.JSONDecodeError):
        # No imprimir excepciones de lectura ni contenido de configuración privada.
        raise SystemExit("No se pudo generar el sitio. Revisa .env, el manifiesto y las dependencias según el README.")
