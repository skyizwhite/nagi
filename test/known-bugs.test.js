import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

// Each test here shows a bug that is still open, so it is marked `it.fails`.
// When the bug is fixed the test starts to pass, `it.fails` reports that as a
// failure, and the fix turns it back into an `it` (and moves it next to the
// tests of the feature).

describe("#2 a bind of an element a swap removed stays subscribed", () => {
    it.fails("does not run the bind of a removed element again", async () => {
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
        expect(scope.ran).toEqual([]);
    });
});

describe("#3 nm-swap=inner initializes the target itself again", () => {
    const server = () => `<div id="target" nm-swap="inner"><span>new</span></div>`;

    it.fails("does not add the target's listeners twice", async () => {
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
        expect(page.$("#d").nmProxy.hits).toBe(1);
    });

    it.fails("keeps the state of a target that is a scope", async () => {
        const page = await mount(
            `<button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
            <div id="target" nm-data="{ n: 1 }"></div>`,
            { server },
        );
        page.$("#target").nmProxy.n = 5;
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").nmProxy.n).toBe(5);
    });
});

describe("#4 a bind writes to the DOM only after an await", () => {
    it.fails("has written by the time the element's init runs", async () => {
        const page = await mount(
            `<div nm-data="{ n: 1, seen: null }">
                <span id="s" nm-bind="{ textContent: () => n, oninit: () => seen = this.textContent }"></span>
            </div>`,
        );
        expect(page.scope("#s").seen).toBe("1");
    });

    it.fails("writes as the scope changes without waiting", async () => {
        const page = await mount(
            `<div nm-data="{ n: 1 }"><span id="s" nm-bind="{ textContent: () => n }"></span></div>`,
        );
        await page.settle();
        page.scope("#s").n = 2;
        expect(page.$("#s").textContent).toBe("2");
    });
});
