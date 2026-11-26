import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("scope keys", () => {
    it("lets a bind read a key named like an Object.prototype member", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1 }"><span id="s" nm-bind="{ textContent: () => String(hasOwnProperty('n')) }"></span></div>
        `);
        expect(page.$("#s").textContent).toBe("true");
        expect(page.errors).toEqual([]);
    });

    it("lets a key named like an Object.prototype member be set and bound", async () => {
        const page = await mount(`
            <div nm-data="{ valueOf: 1 }"><span id="s" nm-bind="{ textContent: () => valueOf }"></span></div>
        `);
        page.scope("#s").valueOf = 2;
        expect(page.$("#s").textContent).toBe("2");
        expect(page.errors).toEqual([]);
    });
});

describe("nm-form radios", () => {
    it("keeps the checked radio's value when an unchecked one comes after it", async () => {
        const page = await mount(`
            <form id="f" nm-data="{}" nm-form>
                <input type="radio" name="c" value="a" checked>
                <input type="radio" name="c" value="b">
            </form>
        `);
        expect(page.$("#f").nmProxy.c).toBe("a");
    });
});

describe("builds without blocks", () => {
    it("debounces in the core build, which has no fetch block", async () => {
        const page = await mount(
            `<div nm-data="{ got: [] }"><input id="i" nm-bind="{ oninput: () => $debounce(() => got = [...got, this.value], 30) }"></div>`,
            { without: ["template", "form", "fetch", "morph", "helpers", "events"] },
        );
        const input = page.$("#i");
        input.value = "a";
        input.dispatchEvent(new page.window.Event("input"));
        await page.settle();
        expect(page.scope("#i").got).toEqual(["a"]);
        expect(page.errors).toEqual([]);
    });
});

describe("request URLs", () => {
    it("adds no ? when there is nothing to send", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-bind="{ onclick: () => $get('/x') }"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x");
    });

    it("adds no & to a URL with a query when there is nothing to send", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-bind="{ onclick: () => $get('/x?a=1') }"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
    });
});

describe("what a swap cleans up", () => {
    it("stops the debounce of an element it removed", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ got: [] }">
                <button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
                <div id="target"><input id="i" nm-bind="{ oninput: () => $debounce(() => got = [...got, 'ran'], 30, false) }"></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(page.$("#d").nmProxy.got).toEqual([]);
    });

    it("removes the window listeners of an element it removed", async () => {
        const target = `<div id="target" nm-bind="{ 'onkeydown.window': () => hits++ }"></div>`;
        const page = await mount(
            `<div id="d" nm-data="{ hits: 0 }">
                <button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
                ${target}
            </div>`,
            { server: () => target },
        );
        for (let i = 0; i < 3; i++) {
            page.$("#b").click();
            await page.settle();
        }
        page.window.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "a" }));
        expect(page.$("#d").nmProxy.hits).toBe(1);
    });
});
