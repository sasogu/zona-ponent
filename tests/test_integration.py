#!/usr/bin/env python3
"""Prueba sitio cifrado, Reveal real y relé real con datos temporales ficticios."""
import importlib.util
import json
import os
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def unlock(page, url, password):
    page.goto(url)
    page.locator("#staticrypt-password").fill(password)
    page.get_by_role("button", name="Entrar", exact=True).click()
    page.wait_for_function("!!window.Reveal && Reveal.isReady()")


def main():
    with tempfile.TemporaryDirectory(prefix="ponente-integration-") as tmp:
        project = Path(tmp)
        for directory in ("examples", "web"):
            shutil.copytree(ROOT / directory, project / directory)
        shutil.copy2(ROOT / "presentaciones.example.json", project)
        (project / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
        password = secrets.token_urlsafe(24)
        secret = secrets.token_hex(32)
        env_file = project / ".env"
        env_file.write_text(f'STATICRYPT_PASSWORD="{password}"\nSYNC_AUTH_SECRET={secret}\n')
        env_file.chmod(0o600)
        spec = importlib.util.spec_from_file_location("generar", ROOT / "scripts/generar.py")
        build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(build)
        build.ROOT = project
        build.main()
        salt = (project / ".staticrypt.json").read_bytes()
        build.main()
        assert (project / ".staticrypt.json").read_bytes() == salt
        output = (project / "dist/ponente/demo/index.html").read_text()
        assert password not in output and secret not in output and 'class="notes"' not in output
        data_dir = project / "data"
        process = subprocess.Popen(
            ["node", str(ROOT / "server/server.js")],
            env=dict(os.environ, PORT="0", HOST="127.0.0.1", ALLOWED_ORIGINS="http://localhost:8110",
                     PUBLIC_DIR=str(project / "dist"), DATA_DIR=str(data_dir), SYNC_AUTH_SECRET=secret),
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        try:
            port = process.stdout.readline().strip().rsplit(":", 1)[1]
            # Origin debe coincidir con el puerto aleatorio real.
            process.terminate(); process.wait(timeout=5)
            origin = f"http://localhost:{port}"
            process = subprocess.Popen(
                ["node", str(ROOT / "server/server.js")],
                env=dict(os.environ, PORT=port, HOST="127.0.0.1", ALLOWED_ORIGINS=origin,
                         PUBLIC_DIR=str(project / "dist"), DATA_DIR=str(data_dir), SYNC_AUTH_SECRET=secret),
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
            )
            process.stdout.readline()
            with sync_playwright() as playwright:
                for engine in (playwright.chromium, playwright.webkit):
                    browser = engine.launch()
                    contexts = [browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True) for _ in range(3)]
                    pages = [context.new_page() for context in contexts]
                    errors = []
                    for page in pages:
                        page.on("pageerror", lambda e: errors.append(type(e).__name__))
                    mando, pantalla, other = pages
                    url = origin + "/ponente/demo/"
                    unlock(mando, url + "?mando=1", password)
                    unlock(pantalla, url + "?pantalla=1", password)
                    mando.wait_for_function("document.querySelector('#pn-cloud').title==='Sincronizado'")
                    mando.locator("#pn-nxt").tap()
                    pantalla.wait_for_function("Reveal.getIndices().h===1")
                    assert pantalla.locator("#pn,#pn-split").count() == 0
                    assert pantalla.locator(".speaker-notes:visible").count() == 0
                    note = "Recordatorio ficticio " + engine.name
                    edit = mando.get_by_role("button", name="Editar mi nota", exact=True)
                    if edit.count():
                        edit.tap()
                    else:
                        mando.get_by_role("button", name="+ Añadir mi nota", exact=True).tap()
                    mando.locator("#pn-mine textarea").fill(note)
                    mando.get_by_role("button", name="Hecho", exact=True).tap()
                    mando.wait_for_function("document.querySelector('#pn-cloud').title==='Sincronizado'")
                    unlock(other, url + "?mando=1", password)
                    other.evaluate("Reveal.slide(1)")
                    other.wait_for_function("expected => document.querySelector('#pn-mine .content')?.textContent===expected", arg=note)
                    assert other.locator("#pn-mine .content").inner_text() == note
                    grip = mando.get_by_role("separator")
                    mando.bring_to_front()
                    # Espera a que el documento desbloqueado haya terminado su layout.
                    grip.wait_for(state="visible")
                    mando.wait_for_function("document.querySelector('#pn-split').getBoundingClientRect().height===innerHeight")
                    box = grip.bounding_box()
                    mando.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                    mando.mouse.down(); mando.mouse.move(354, 410, steps=8); mando.mouse.up()
                    assert abs(mando.locator(".reveal").bounding_box()["width"] - 344) < 2, {"slide": mando.locator(".reveal").bounding_box(), "panel": mando.locator("#pn").bounding_box(), "bar": mando.locator("#pn-split").bounding_box(), "ratio": grip.get_attribute("aria-valuenow")}
                    assert abs(mando.locator("#pn").bounding_box()["x"] - 364) < 2
                    assert not errors, errors
                    for data in data_dir.glob("*.json"):
                        assert note not in data.read_text()
                    browser.close()
                    print(f"{engine.name}: HTML cifrado, Reveal real, mando/proyector y recuperación cifrada entre dispositivos correctos")
        finally:
            process.terminate(); process.wait(timeout=5)


if __name__ == "__main__":
    main()
