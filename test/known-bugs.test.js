import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

// Each test here pins down a bug that is still open: it asserts the wrong
// value nomini gives now, with the right one in a comment. Fixing the bug makes
// the test fail, and the fix then asserts the right value and moves the test
// next to the tests of the feature. Anything else that breaks the test, such
// as a change to the helpers, also makes it fail, rather than passing for the
// wrong reason as an `it.fails` test would.

describe("#2 a bind of an element a swap removed stays subscribed", () => {
    it("does not run the bind of a removed element again", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ n: 1, ran: [] }">
                <button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
                <div id="target"><span nm-bind="{ textContent: () => (ran.push(this.isConnected), n) }"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        await page.settle();
        page.$("#b").click();
        await page.settle();

        const scope = page.$("#d").nmProxy;
        scope.ran.length = 0;
        scope.n = 2;
        await page.settle();
        // Right: [] (no bind of a removed element runs).
        expect(scope.ran).toEqual([false]);
    });
});

describe("#3 nm-swap=inner initializes the target itself again", () => {
    const server = () => `<div id="target" nm-swap="inner"><span>new</span></div>`;

    it("does not add the target's listeners twice", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ hits: 0 }">
                <button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
                <div id="target" nm-bind="{ onping: () => hits++ }"></div>
            </div>`,
            { server },
        );
        page.$("#b").click();
        await page.settle();

        page.$("#target").dispatchEvent(new page.window.Event("ping"));
        // Right: 1.
        expect(page.$("#d").nmProxy.hits).toBe(2);
    });

    it("keeps the state of a target that is a scope", async () => {
        const page = await mount(
            `<button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
            <div id="target" nm-data="{ n: 1 }"></div>`,
            { server },
        );
        page.$("#target").nmProxy.n = 5;
        page.$("#b").click();
        await page.settle();
        // Right: 5.
        expect(page.$("#target").nmProxy.n).toBe(1);
    });
});

describe("#4 a bind writes to the DOM only after an await", () => {
    it("has written by the time the element's init runs", async () => {
        const page = await mount(
            `<div nm-data="{ n: 1, seen: null }">
                <span id="s" nm-bind="{ textContent: () => n, oninit: () => seen = this.textContent }"></span>
            </div>`,
        );
        // Right: "1".
        expect(page.scope("#s").seen).toBe("");
    });

    it("writes as the scope changes without waiting", async () => {
        const page = await mount(
            `<div nm-data="{ n: 1 }"><span id="s" nm-bind="{ textContent: () => n }"></span></div>`,
        );
        await page.settle();
        page.scope("#s").n = 2;
        // Right: "2".
        expect(page.$("#s").textContent).toBe("1");
    });
});
