import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("n-ref", () => {
    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("puts the element in its scope's $refs", async () => {
        const page = await mount(`
            <div id="d" n-scope="{}"><input n-ref="field" id="i"></div>
        `);
        expect(page.$("#d").nagiProxy.$refs.field).toBe(page.$("#i"));
    });

    it("forgets the $refs of the children it removes", async () => {
        const page = await mount(
            `<div id="target" n-scope="{}">
                <button id="b" n-on-click="$get('/x')"></button>
                <input n-ref="box">
            </div>`,
            { server: () => `<div id="target" n-swap="inner"><button id="b2"></button></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").nagiProxy.$refs.box).toBeUndefined();
    });

    it("keeps a ref the new children set under the same name", async () => {
        const page = await mount(
            `<div id="target" n-scope="{}">
                <button id="b" n-on-click="$get('/x')"></button>
                <input n-ref="box">
            </div>`,
            { server: () => `<div id="target" n-swap="inner"><input id="new" n-ref="box"></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").nagiProxy.$refs.box).toBe(page.$("#new"));
    });

    it("logs an n-ref outside any scope", async () => {
        const page = await mount(`<input id="i" n-ref="field">`);
        expect(page.errors).toHaveLength(1);
    });

    it("finds a ref of an outer scope from an inner one, the nearer scope first", async () => {
        const page = await mount(`
            <div n-scope>
                <dialog n-ref="dialog" id="outer-dialog"></dialog>
                <p n-ref="note" id="outer-note"></p>
                <div id="inner" n-scope><p n-ref="note" id="inner-note"></p></div>
            </div>
        `);
        const refs = page.scope("#inner").$refs;
        expect(refs.dialog).toBe(page.$("#outer-dialog"));
        expect(refs.note).toBe(page.$("#inner-note"));
        expect("dialog" in refs).toBe(true);
    });

    it("puts an element that makes its own scope in the scope around it", async () => {
        const page = await mount(`<div id="d" n-scope><dialog id="dlg" n-scope="{ open: false }" n-ref="dialog"></dialog></div>`);
        expect(page.scope("#d").$refs.dialog).toBe(page.$("#dlg"));
    });

    it("updates binds that read $refs when a ref comes and goes, in its scope and in inner ones", async () => {
        const page = await mount(`
            <div id="d" n-scope>
                <span id="s" n-bind-textcontent="$refs.box ? 'yes' : 'no'"></span>
                <div n-scope><i id="t" n-bind-textcontent="$refs.box ? 'yes' : 'no'"></i></div>
            </div>
        `);
        expect([page.$("#s").textContent, page.$("#t").textContent]).toEqual(["no", "no"]);
        page.$("#d").insertAdjacentHTML("beforeend", `<input id="box" n-ref="box">`);
        page.window.nagi.init(page.$("#box"));
        expect([page.$("#s").textContent, page.$("#t").textContent]).toEqual(["yes", "yes"]);
        page.window.nagi.destroy(page.$("#box"));
        expect([page.$("#s").textContent, page.$("#t").textContent]).toEqual(["no", "no"]);
    });

    it("puts back another element of the same name when the ref it holds goes", async () => {
        const page = await mount(`<div id="d" n-scope><i id="a" n-ref="x"></i><i id="b" n-ref="x"></i></div>`);
        const refs = page.scope("#d").$refs;
        expect(refs.x).toBe(page.$("#b"));
        page.window.nagi.destroy(page.$("#b"));
        expect(refs.x).toBe(page.$("#a"));
        page.window.nagi.destroy(page.$("#a"));
        expect(refs.x).toBeUndefined();
    });
});

