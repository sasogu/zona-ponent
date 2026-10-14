#!/usr/bin/env python3
"""Comprueba el reparto de notas en tablet sin acceder a datos reales."""
import json

from playwright.sync_api import sync_playwright
from test_ponente_notes import FIXTURE, ROOT, URL


def run(browser_type):
    browser = browser_type.launch()
    context = browser.new_context(viewport={"width": 820, "height": 1180}, has_touch=True)
    script = (ROOT / "web/sync.js").read_text()

    def route(r):
        if "/sync/data?" in r.request.url:
            r.fulfill(json={"revision": 0, "blob": None})
        elif r.request.url.endswith("/sync.js"):
            r.fulfill(body=script, content_type="application/javascript")
        else:
            r.fulfill(body=FIXTURE, content_type="text/html")

    context.route("**/*", route)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.evaluate("""Reveal.layout=function(){document.querySelector('.reveal')
      .dispatchEvent(new Event('resize',{bubbles:true}));}""")
    grip = page.get_by_role("separator")

    def geometry():
        return page.evaluate("""() => {
          const box=s=>{const r=document.querySelector(s).getBoundingClientRect();
            return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
          return {slide:box('.reveal'),notes:box('#pn'),bar:box('#pn-split')};
        }""")

    def drag_to(x, y):
        box = grip.bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down()
        page.mouse.move(x, y, steps=8)
        page.mouse.up()

    assert grip.get_attribute("aria-orientation") == "horizontal"
    drag_to(410, 354)
    g = geometry()
    assert abs(g["notes"]["y"] - 364) < 2
    assert abs(g["slide"]["bottom"] - g["bar"]["y"]) < 2
    assert abs(g["notes"]["y"] - g["bar"]["bottom"]) < 2
    page.reload()
    assert abs(geometry()["notes"]["y"] - 364) < 2

    # Girar recuerda cada orientación y no pisa el ajuste vertical.
    page.set_viewport_size({"width": 1180, "height": 820})
    page.wait_for_function("document.querySelector('#pn-split').getAttribute('aria-orientation')==='vertical'")
    assert abs(geometry()["notes"]["x"] - (1180 * .52 + 10)) < 2
    drag_to(354, 410)
    assert abs(geometry()["notes"]["x"] - 364) < 2
    grip.press("ArrowLeft")
    assert grip.get_attribute("aria-valuenow") == "28"
    page.reload()
    assert grip.get_attribute("aria-valuenow") == "28"
    page.set_viewport_size({"width": 820, "height": 1180})
    page.wait_for_function("document.querySelector('#pn-split').getAttribute('aria-orientation')==='horizontal'")
    assert grip.get_attribute("aria-valuenow") == "30"

    # Un gesto táctil real en Chromium; Safari/WebKit verifica los pointer events.
    if browser_type.name == "chromium":
        cdp = context.new_cdp_session(page)
        box = grip.bounding_box()
        x, y = 410, box["y"] + box["height"] / 2
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": 472}]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        assert grip.get_attribute("aria-valuenow") == "40"
    else:
        page.evaluate("""() => {
          const el=document.querySelector('#pn-split');
          const capture=el.setPointerCapture;
          el.setPointerCapture=()=>{};
          const emit=(type,y)=>el.dispatchEvent(new PointerEvent(type,
            {pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientX:410,clientY:y,bubbles:true,cancelable:true}));
          emit('pointerdown',354);emit('pointermove',472);emit('pointerup',472);
          el.setPointerCapture=capture;
        }""")
        assert grip.get_attribute("aria-valuenow") == "40"

    drag_to(410, 0)
    assert grip.get_attribute("aria-valuenow") == "20"
    drag_to(410, 1180)
    assert grip.get_attribute("aria-valuenow") == "75"
    page.touchscreen.tap(410, 885)
    page.touchscreen.tap(410, 885)
    assert grip.get_attribute("aria-valuenow") == "46"
    assert json.loads(page.evaluate("localStorage.getItem('ponenteNotesSplit')"))["landscape"] == 28

    # Los controles y las notas siguen accesibles tras darles más espacio.
    page.locator("#pn-plus").tap()
    assert page.locator("#pn-scroll").evaluate("el=>parseFloat(getComputedStyle(el).fontSize)") == 29
    page.get_by_role("button", name="+ Añadir mi nota", exact=True).tap()
    page.locator("#pn-mine textarea").fill("Nota tras ajustar el panel")
    page.get_by_role("button", name="Hecho", exact=True).tap()
    assert page.locator("#pn-mine .content").inner_text() == "Nota tras ajustar el panel"
    page.goto(URL.replace("?mando=1", "?pantalla=1"))
    assert page.locator("#pn,#pn-split").count() == 0
    assert not errors, errors
    browser.close()
    print(f"{browser_type.name}: reparto, persistencia, giro, límites, tacto y proyector correctos")


if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright.chromium)
        run(playwright.webkit)
