#!/usr/bin/env python3
"""Prueba notas propias y subrayados con sincronización cifrada simulada.

Usa datos ficticios y dos dispositivos aislados; no conecta con el VPS.
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
URL = "http://localhost:9876/fixture/?mando=1"
FIXTURE = """<!doctype html><html><head><meta charset="utf-8"></head><body>
<div class="reveal"><div class="slides"><section><h2>Prueba</h2></section></div></div>
<script>
window.PONENTE_SYNC_TOPIC='fixture';
window.PONENTE_STORAGE_KEY='01'.repeat(32);
window.PONENTE_SYNC_TOKEN='fixture-only';
window.WebSocket=function(){this.readyState=1;this.send=function(){};
 var self=this;setTimeout(function(){if(self.onopen)self.onopen();},0);};
window.originalNote='<p>Notas <strong>de base</strong> para la prueba.</p>';
var events={};
window.Reveal={isReady:function(){return true;},layout:function(){},
 on:function(name,fn){(events[name]||(events[name]=[])).push(fn);},
 getIndices:function(){return {h:0,v:0,f:-1};},getTotalSlides:function(){return 1;},
 getSlidePastCount:function(){return 0;},getSlideNotes:function(){return originalNote;},
 getSlide:function(h){return h===0?document.querySelector('section'):null;},
 prev:function(){},next:function(){}};
window.refreshNotes=function(){(events.slidechanged||[]).forEach(function(fn){fn();});};
if(new URLSearchParams(location.search).has('legacy') && !localStorage.getItem('ponenteMarks:/fixture/'))
 localStorage.setItem('ponenteMarks:/fixture/',JSON.stringify({'0.0':{extra:'Nota antigua\\nsegunda línea'}}));
</script><script src="/sync.js"></script></body></html>"""


def synced(page):
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    page.wait_for_function(
        "document.querySelector('#pn-cloud').title === 'Sincronizado'"
    )


def highlight(page, selector, start, end):
    page.evaluate(
        """([selector,start,end]) => {
          const root=document.querySelector(selector);
          const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
          let n,offset=0,first,last;
          while(n=walker.nextNode()) {
            const next=offset+n.length;
            if(!first && start>=offset && start<next) first=[n,start-offset];
            if(end>offset && end<=next) last=[n,end-offset];
            offset=next;
          }
          const range=document.createRange();
          range.setStart(...first);range.setEnd(...last);
          const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        }""",
        [selector, start, end],
    )
    page.locator("#pn-hl").dispatch_event("pointerdown")
    synced(page)


def run(browser_type):
    state = {"revision": 0, "blob": None}
    script = (ROOT / "web/sync.js").read_text()

    def route(request_route):
        request = request_route.request
        if "/sync/data?" in request.url:
            if request.method == "PUT":
                payload = request.post_data_json
                if payload["revision"] != state["revision"]:
                    request_route.fulfill(status=409, json=state)
                    return
                state.update(revision=state["revision"] + 1, blob=payload["blob"])
            request_route.fulfill(json=state)
        elif request.url.endswith("/sync.js"):
            request_route.fulfill(body=script, content_type="application/javascript")
        else:
            request_route.fulfill(body=FIXTURE, content_type="text/html")

    browser = browser_type.launch()
    contexts = [browser.new_context(viewport={"width": 820, "height": 1180}, has_touch=True) for _ in range(2)]
    for context in contexts:
        context.route("**/*", route)
    first = contexts[0].new_page()
    errors = []
    first.on("pageerror", lambda error: errors.append(type(error).__name__))
    first.goto(URL + "&legacy=1")
    synced(first)
    assert first.locator("#pn-mine .content").inner_text() == "Nota antigua\nsegunda línea"

    # Conserva el subrayado habitual, incluso atravesando una negrita.
    highlight(first, "#pn-text", 2, 13)
    assert first.locator("#pn-text mark").count() >= 2
    highlight(first, "#pn-mine .content", 0, 12)
    assert first.locator("#pn-mine .content mark").inner_text() == "Nota antigua"
    assert first.locator("#pn-text mark").count() >= 2

    # La recarga y un dispositivo sin almacenamiento local recuperan las marcas.
    first.reload()
    synced(first)
    assert first.locator("#pn-mine .content mark").count() == 1
    second = contexts[1].new_page()
    second.goto(URL)
    synced(second)
    assert second.locator("#pn-mine .content mark").inner_text() == "Nota antigua"
    assert second.locator("#pn-text mark").count() >= 2
    assert "Nota antigua" not in json.dumps(state["blob"])

    # Confirmar sin cambiar texto y cancelar una edición conservan las marcas.
    first.get_by_role("button", name="Editar mi nota", exact=True).click()
    first.get_by_role("button", name="Hecho", exact=True).click()
    synced(first)
    assert first.locator("#pn-mine .content mark").count() == 1
    first.get_by_role("button", name="Editar mi nota", exact=True).click()
    first.locator("#pn-mine textarea").fill("Cambio provisional")
    first.get_by_role("button", name="Cancelar", exact=True).click()
    synced(first)
    assert first.locator("#pn-mine .content mark").inner_text() == "Nota antigua"

    # Cambiar las notas de la presentación no borra las anotaciones propias.
    first.evaluate("originalNote='<p>Contenido actualizado.</p>'; refreshNotes()")
    assert first.locator("#pn-text mark").count() == 0
    assert first.locator("#pn-mine .content mark").count() == 1

    # Quitar un subrayado en otro dispositivo también se sincroniza.
    second.on("dialog", lambda dialog: dialog.accept())
    second.locator("#pn-mine .content mark").click()
    synced(second)
    first.evaluate("window.dispatchEvent(new Event('focus'))")
    first.wait_for_function("!document.querySelector('#pn-mine .content mark')")
    assert first.locator("#pn-mine .content").inner_text() == "Nota antigua\nsegunda línea"

    # Ediciones confirmadas descartan marcas cuyo texto ya no coincide.
    highlight(first, "#pn-mine .content", 0, 4)
    first.get_by_role("button", name="Editar mi nota", exact=True).click()
    first.locator("#pn-mine textarea").fill("Nota corregida")
    first.get_by_role("button", name="Hecho", exact=True).click()
    synced(first)
    assert first.locator("#pn-mine .content").inner_text() == "Nota corregida"
    assert first.locator("#pn-mine .content mark").count() == 0

    # No aplicar selecciones entre ambos paneles ni atributos HTML activos.
    first.evaluate("""() => {
      const r=document.createRange();r.setStart(document.querySelector('#pn-text p').firstChild,0);
      r.setEnd(document.querySelector('#pn-mine .content').firstChild,4);
      getSelection().removeAllRanges();getSelection().addRange(r);
      document.dispatchEvent(new Event('selectionchange'));
    }""")
    first.locator("#pn-hl").dispatch_event("pointerdown")
    assert first.locator("#pn-mine .content mark").count() == 0
    first.evaluate("""() => {
      const key='ponenteMarks:/fixture/',m=JSON.parse(localStorage.getItem(key));
      m['0.0'].extraHtml='<mark onclick="window.bad=true">Nota</mark> corregida<img src=x onerror="window.bad=true">';
      localStorage.setItem(key,JSON.stringify(m));refreshNotes();
    }""")
    assert first.locator("#pn-mine .content mark").count() == 1
    assert first.locator("#pn-mine .content [onclick],#pn-mine .content img").count() == 0
    assert not first.evaluate("!!window.bad")
    assert not errors
    browser.close()
    print(f"{browser_type.name}: notas antiguas, subrayado, recarga, edición, borrado y sincronización cifrada correctos")


if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright.chromium)
        run(playwright.webkit)
