import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("nm-ref", () => {
    it("puts the element in its scope's $refs", async () => {
        const page = await mount(`
            <div id="d" nm-scope="{}"><input nm-ref="field" id="i"></div>
        `);
        expect(page.$("#d").nmProxy.$refs.field).toBe(page.$("#i"));
    });
});

describe("nm-form", () => {
    const form = `
        <form id="f" nm-scope="{}" nm-form>
            <input name="text" value="hello">
            <input name="count" type="number" value="3">
            <input name="agree" type="checkbox" checked>
            <input name="size" type="radio" value="s">
            <input name="size" type="radio" value="m" checked>
            <select name="pick"><option>a</option><option selected>b</option></select>
            <button id="send">Send</button>
        </form>
    `;

    it("copies each named field into the scope, typed by input type", async () => {
        const page = await mount(form);
        const scope = page.$("#f").nmProxy;
        expect(scope.text).toBe("hello");
        expect(scope.count).toBe(3);
        expect(scope.agree).toBe(true);
        expect(scope.size).toBe("m");
        expect(scope.pick).toBe("b");
    });

    it("follows input and change events", async () => {
        const page = await mount(form);
        const input = page.$("[name=text]");
        input.value = "bye";
        input.dispatchEvent(new page.window.Event("input"));
        expect(page.$("#f").nmProxy.text).toBe("bye");
    });

    it("disables the submit buttons while the scope is fetching", async () => {
        const page = await mount(form);
        const scope = page.$("#f").nmProxy;
        scope._nmFetching = true;
        await page.settle();
        expect(page.$("#send").disabled).toBe(true);

        scope._nmFetching = false;
        await page.settle();
        expect(page.$("#send").disabled).toBe(false);
    });
});

describe("nm-use", () => {
    it("fills the element with the template, its children going in the slot", async () => {
        const page = await mount(`
            <template id="card"><article><h2>Title</h2><slot></slot></article></template>
            <div id="u" nm-use="card"><p>body</p></div>
        `);
        expect(page.$("#u").innerHTML).toBe("<article><h2>Title</h2><p>body</p></article>");
    });

    it("binds what the template brings in", async () => {
        const page = await mount(`
            <template id="t"><span id="s" nm-bind-textcontent="n"></span></template>
            <div nm-scope="{ n: 4 }"><div nm-use="t"></div></div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("4");
    });

    it("logs when the template does not exist", async () => {
        const page = await mount(`<div nm-use="missing"></div>`);
        expect(page.errors).toHaveLength(1);
    });
});
