#!/usr/bin/env python3
"""Comprueba archivos destinados a Git sin imprimir posibles secretos."""
import base64
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def approved_image(path, raw, reviewed):
    # Solo las capturas revisadas visualmente, con la huella exacta registrada.
    expected = reviewed.get(path.as_posix())
    actual = base64.b64encode(hashlib.sha256(raw).digest()).decode("ascii")
    return raw.startswith(b"\x89PNG\r\n\x1a\n") and expected == actual


def problems(path, text):
    result = []
    forbidden = {".env", ".staticrypt.json", "presentaciones.json"}
    if path.name in forbidden or any(p in {"dist", "data", "private", "node_modules", ".venv", "__pycache__"} for p in path.parts):
        result.append("archivo privado o generado")
    patterns = [
        (r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", "clave privada"),
        (r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})", "token"),
        (r"(?i)(?:password|secret|token|api_key)\s*[:=]\s*[\"'][^\"'\n]{16,}[\"']", "credencial literal"),
        (r"\b[a-fA-F0-9]{64}\b", "clave o token hexadecimal literal"),
        (r"\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b", "dirección privada de Tailnet"),
        (r"\b\d{1,3}(?:\.\d{1,3}){3}\b", "dirección IP de una instalación"),
        (r"/home/[A-Za-z0-9_-]+/|/etc/[^\s\"']*\.env", "ruta privada de instalación"),
    ]
    # El último patrón IP admite únicamente loopback, utilizado en la demo local.
    for pattern, reason in patterns:
        hits = re.findall(pattern, text)
        if reason == "dirección IP de una instalación":
            hits = [hit for hit in hits if hit not in {"127.0.0.1", "0.0.0.0"}]
        if hits:
            result.append(reason)
    # Identificadores del despliegue original; se construyen para no copiarlo.
    originals = ["samuel" + "soriano.es", "aules" + "socarrades", "sam" + "gua", "tail" + "dc0f74"]
    if any(value in text.lower() for value in originals):
        result.append("referencia al despliegue original")
    return result


def main():
    result = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True)
    paths = [Path(p.decode()) for p in result.stdout.split(b"\0") if p]
    if not paths:
        raise SystemExit("No hay archivos preparados para revisar. Ejecuta git add sobre los archivos públicos.")
    manifest = subprocess.run(["git", "show", ":docs/images/revisades.json"], cwd=ROOT, capture_output=True)
    try:
        reviewed = json.loads(manifest.stdout) if manifest.returncode == 0 else {}
        if not isinstance(reviewed, dict):
            raise ValueError()
    except (ValueError, UnicodeDecodeError):
        raise SystemExit("Manifiesto de capturas revisadas inválido; no se muestra su contenido.")
    failures = []
    for path in paths:
        # Revisa lo que se publicará, incluso si el árbol de trabajo difiere del índice.
        raw = subprocess.run(["git", "show", ":" + path.as_posix()], cwd=ROOT, capture_output=True, check=True).stdout
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            if not approved_image(path, raw, reviewed):
                failures.append((str(path), ["binario: requiere revisión manual y registro de su huella"]))
            continue
        issues = problems(path, text)
        if issues:
            failures.append((str(path), issues))
    for path, issues in failures:
        print(path + ": " + ", ".join(issues))
    if failures:
        raise SystemExit("Revisión pública fallida; no se han mostrado valores sensibles.")
    print(f"Revisión pública correcta: {len(paths)} archivos, sin datos privados detectados.")


if __name__ == "__main__":
    main()
