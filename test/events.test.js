import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { later } from "./support.js";

describe("handlers", () => {
    it("listens with on<event> and runs the handler with this as the element", async () => {
        const page = await mount(`
            <div nm-scope="{ id: null }"><button id="b" nm-on-click="id = this.id + ':' + e.type"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").id).toBe("b:click");
    });

    it("listens to custom events", async () => {
        const page = await mount(`
            <div nm-scope="{ got: null }"><span id="s" nm-on-ping="got = e.detail"></span></div>
        `);
        page.$("#s").dispatchEvent(new page.window.CustomEvent("ping", { detail: 42 }));
        expect(page.scope("#s").got).toBe(42);
    });

    it("runs statements with the event as e and the element as this", async () => {
        const page = await mount(`
            <div nm-scope="{ got: null }"><button id="b" nm-on-click="const t = e.type; got = this.id + ':' + t"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toBe("b:click");
    });

    it("lets a handler await", async () => {
        const page = await mount(`
            <div nm-scope="{ got: [] }"><button id="b" nm-on-click="got = [...got, 1]; await 0; got = [...got, 2]"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toEqual([1]);
        await page.settle();
        expect(page.scope("#b").got).toEqual([1, 2]);
    });

    it("keeps an event name as written", async () => {
        const page = await mount(`
            <div nm-scope="{ got: 0 }"><span id="s" nm-on-my-event="got++"></span></div>
        `);
        page.$("#s").dispatchEvent(new page.window.Event("my-event"));
        expect(page.scope("#s").got).toBe(1);
    });

    it("listens to a kebab-case event as written", async () => {
        const page = await mount(`
            <div nm-scope="{ got: 0 }"><span id="s" nm-on-item-added="got++"></span></div>
        `);
        page.$("#s").dispatchEvent(new page.window.Event("item-added"));
        expect(page.scope("#s").got).toBe(1);
    });

    it("logs a handler that rejects", async () => {
        const page = await mount(`
            <div nm-scope="{}"><button id="b" nm-on-click="await 0; throw new Error('no')"></button></div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.errors).toHaveLength(1);
    });

    it("warns about a handler that only makes a function", async () => {
        const page = await mount(`<div nm-scope><button nm-on-click="() => 1"></button></div>`);
        expect(page.warnings).toHaveLength(1);
    });
});

describe("init and destroy", () => {
    it("dispatches a non-bubbling init on the element after binding it", async () => {
        const page = await mount(`
            <div nm-scope="{ got: [] }" id="d" nm-on-init="got = [...got, 'scope']">
                <span nm-on-init="got = [...got, 'child']"></span>
            </div>
        `);
        await page.settle();
        expect(page.$("#d").nmProxy.got).toEqual(["scope", "child"]);
    });

    it("sends init and destroy to an element with only nm-on-* attributes", async () => {
        const page = await mount(
            `<div id="d" nm-scope="{ log: [] }">
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target"><span nm-on-init="log.push('init')" nm-on-destroy="log.push('destroy')"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nmProxy.log).toEqual(["init", "destroy"]);
    });
});

describe("modifiers", () => {
    it("calls preventDefault with .prevent", async () => {
        const page = await mount(`
            <div nm-scope="{}"><form id="f" nm-on-submit.prevent=""></form></div>
        `);
        const event = new page.window.Event("submit", { cancelable: true });
        page.$("#f").dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it("stops propagation with .stop", async () => {
        const page = await mount(`
            <div nm-scope="{ hits: 0 }" nm-on-click="hits++">
                <button id="b" nm-on-click.stop=""></button>
            </div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").hits).toBe(0);
    });

    it("runs once with .once", async () => {
        const page = await mount(`
            <div nm-scope="{ hits: 0 }"><button id="b" nm-on-click.once="hits++"></button></div>
        `);
        page.$("#b").click();
        page.$("#b").click();
        expect(page.scope("#b").hits).toBe(1);
    });

    it("listens on window with .window", async () => {
        const page = await mount(`
            <div nm-scope="{ key: null }"><span id="s" nm-on-keydown.window="key = e.key"></span></div>
        `);
        page.window.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Escape" }));
        expect(page.scope("#s").key).toBe("Escape");
    });

    it("takes the name before the first dot as the event, and warns about modifiers it does not know", async () => {
        const page = await mount(`
            <div nm-let-got="0"><button id="b" nm-on-click.self="got++"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toBe(1);
        expect(page.warnings).toHaveLength(1);
    });
});

describe("debounce", () => {
    it("runs only the last of quick events with .debounce<ms>", async () => {
        const page = await mount(`
            <div nm-scope="{ got: [] }"><input id="i" nm-on-input.debounce30="got = [...got, this.value]"></div>
        `);
        const input = page.$("#i");
        for (const value of ["a", "ab", "abc"]) {
            input.value = value;
            input.dispatchEvent(new page.window.Event("input"));
        }
        expect(page.scope("#i").got).toEqual([]);
        await page.settle();
        expect(page.scope("#i").got).toEqual(["abc"]);
    });

    it("keeps a timer for each handler of an element", async () => {
        const page = await mount(`
            <div nm-scope="{ got: [] }">
                <input id="i" nm-on-input.debounce20="got = [...got, 'input']" nm-on-ping.debounce20="got = [...got, 'ping']">
            </div>
        `);
        const input = page.$("#i");
        input.dispatchEvent(new page.window.Event("input"));
        input.dispatchEvent(new page.window.Event("ping"));
        await page.settle();
        expect([...page.scope("#i").got].sort()).toEqual(["input", "ping"]);
    });

    it("keeps a timer for each watcher of an element", async () => {
        const page = await mount(`
            <div nm-scope="{ got: [] }">
                <span id="s" nm-on-init="$watch(() => $debounce(() => got.push('a'), 10));
                    $watch(() => $debounce(() => got.push('b'), 10));"></span>
            </div>
        `);
        await page.settle();
        expect([...page.scope("#s").got].sort()).toEqual(["a", "b"]);
    });

    it("debounces in a watcher made again by its parent", async () => {
        const page = await mount(`
            <div nm-let-q="''" nm-let-saved="0">
                <span id="s" nm-on-init="$watch(() => { q; $watch(() => $debounce(() => saved++, 20)) })"></span>
            </div>
        `);
        const scope = page.scope("#s");
        await later(40);
        scope.saved = 0;
        for (const q of ["a", "ab", "abc", "abcd"]) scope.q = q;
        await later(50);
        expect(scope.saved).toBe(1);
    });

    it("keeps apart debounces from different code with no handler or watcher", async () => {
        const page = await mount(`
            <div nm-let-a="0" nm-let-b="0">
                <button id="x" nm-on-click="await 0; $debounce(() => a++, 10)"></button>
                <button id="y" nm-on-click="await 0; $debounce(() => b++, 10)"></button>
            </div>
        `);
        page.$("#x").click();
        page.$("#y").click();
        await later(40);
        const scope = page.scope("#x");
        expect([scope.a, scope.b]).toEqual([1, 1]);
    });

    it("keeps apart debounces of sibling watchers with the same code", async () => {
        const page = await mount(`
            <div nm-let-a="0" nm-let-b="0" nm-let-saved="[]">
                <span id="s" nm-on-init="[['a', () => a], ['b', () => b]].forEach(([name, read]) => $watch(() => { read(); $debounce(() => saved.push(name), 20) }))"></span>
            </div>
        `);
        const scope = page.scope("#s");
        await later(40);
        scope.saved.length = 0;
        scope.a = 1;
        scope.b = 1;
        await later(50);
        expect([...scope.saved].sort()).toEqual(["a", "b"]);
    });

    it("still runs a debounce whose watcher a parent made again without debouncing", async () => {
        const page = await mount(`
            <div nm-let-mode="0" nm-let-q="''" nm-let-saved="0">
                <span id="s" nm-on-init="let last = ''; $watch(() => { mode; $watch(() => { const v = q; if (v !== last) { last = v; $debounce(() => saved++, 20) } }) })"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.q = "x";
        scope.mode = 1;
        await later(50);
        expect(scope.saved).toBe(1);
    });

    it("debounces after an await", async () => {
        const page = await mount(`
            <div id="d" nm-scope="{ ran: 0 }">
                <button id="b" nm-on-click="await 0; $debounce(() => ran++, 10)"></button>
            </div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nmProxy.ran).toBe(1);
        expect(page.errors).toEqual([]);
    });

    it("debounces a request with no scope after an await", async () => {
        const page = await mount(
            `<button id="b" nm-on-click="await 0; $debounce(() => $get('/s'), 10)"></button>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests).toHaveLength(1);
        expect(page.errors).toEqual([]);
    });

    it("still runs when another request starts in the scope", async () => {
        const page = await mount(
            `<div nm-scope="{ got: [] }">
                <input id="i" nm-on-input.debounce20="got = [...got, 'saved']">
                <button id="b" nm-on-click="$get('/poll')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#i").got).toEqual(["saved"]);
    });

    it("drops a debounce asked to be abortable when a request starts in its scope", async () => {
        const page = await mount(
            `<div nm-scope="{ got: [] }">
                <input id="i" nm-on-input="$debounce(() => got = [...got, 'search'], 20, true)">
                <button id="b" nm-on-click="$get('/reset')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#i").got).toEqual([]);
    });
});
