import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { later } from "./support.js";

describe("nagi.init", () => {
    it("sets up an element another script added, in the scope it was added to", async () => {
        const page = await mount(`<div id="d" n-scope="{ n: 1 }"></div>`);
        const span = page.document.createElement("span");
        span.setAttribute("n-bind-textcontent", "n");
        page.$("#d").append(span);
        expect(span.textContent).toBe("");

        page.window.nagi.init(span);
        expect(span.textContent).toBe("1");
        page.scope("#d").n = 2;
        expect(span.textContent).toBe("2");
    });

    it("sets up an added scope with its fields and refs", async () => {
        const page = await mount(`<div id="d" n-scope="{ outer: 'o' }"></div>`);
        page.$("#d").insertAdjacentHTML(
            "beforeend",
            `<form id="f" n-scope n-form><input name="q" value="hi"><p n-ref="p" n-bind-textcontent="outer + q"></p></form>`,
        );
        page.window.nagi.init(page.$("#f"));
        const scope = page.scope("#f");
        expect(scope.q).toBe("hi");
        expect(scope.$refs.p.textContent).toBe("ohi");
    });

    it("does nothing more the second time", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ hits: 0 }" n-form>
                <input id="q" name="q" value="a">
                <button id="b" type="button" n-on-click="hits++"></button>
            </form>
        `);
        page.window.nagi.init(page.$("#f"));
        page.window.nagi.init(page.document.body);
        page.$("#b").click();
        expect(page.scope("#f").hits).toBe(1);
        expect(page.errors).toEqual([]);
    });

    it("logs an error for something that is not an element", async () => {
        const page = await mount(`<div></div>`);
        page.window.nagi.init(null);
        page.window.nagi.destroy("x");
        expect(page.errors.map(([message]) => message)).toEqual([
            "[Nagi] nagi.init needs an element:",
            "[Nagi] nagi.destroy needs an element:",
        ]);
    });
});

describe("nagi.destroy", () => {
    it("tears down an element another script removes, as a swap would", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ n: 1, gone: 0, seen: 0 }">
                <div id="row" n-on-destroy="gone++">
                    <span id="s" n-bind-textcontent="n"></span>
                    <i n-on-ping.window="seen++"></i>
                    <b n-on-click="$debounce(() => seen++, 10)"></b>
                </div>
            </div>
        `);
        const scope = page.scope("#d");
        const row = page.$("#row");
        row.querySelector("b").click();
        page.window.nagi.destroy(row);
        row.remove();

        scope.n = 2;
        page.window.dispatchEvent(new page.window.Event("ping"));
        await later(30);
        expect(scope.gone).toBe(1);
        expect(row.querySelector("#s").textContent).toBe("1");
        expect(scope.seen).toBe(0);
    });

    it("lets an element be set up again after it, with each handler running once", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ hits: 0 }" n-form>
                <div id="row">
                    <input id="q" name="q" value="a">
                    <button id="b" type="button" n-on-click="hits++"></button>
                    <span id="s" n-bind-textcontent="q"></span>
                </div>
            </form>
        `);
        const row = page.$("#row");
        page.window.nagi.destroy(row);
        row.remove();
        page.$("#f").append(row);
        page.window.nagi.init(row);

        page.$("#b").click();
        const q = page.$("#q");
        q.value = "b";
        q.dispatchEvent(new page.window.Event("input"));
        expect(page.scope("#f").hits).toBe(1);
        expect(page.$("#s").textContent).toBe("b");
        expect(page.errors).toEqual([]);
    });
});
