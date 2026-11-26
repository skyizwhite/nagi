import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("nm-data", () => {
    it("makes a scope from an object literal, with or without braces", async () => {
        const page = await mount(`
            <div id="a" nm-data="{ n: 1 }"></div>
            <div id="b" nm-data="n: 2"></div>
        `);
        expect(page.$("#a").nmProxy.n).toBe(1);
        expect(page.$("#b").nmProxy.n).toBe(2);
    });

    it("runs the expression with the scope element as this", async () => {
        const page = await mount(`<div id="a" data-x="hi" nm-data="{ x: this.dataset.x }"></div>`);
        expect(page.$("#a").nmProxy.x).toBe("hi");
    });

    it("logs and falls back to an empty scope when the expression is invalid", async () => {
        const page = await mount(`<div id="a" nm-data="{ n: }"></div>`);
        expect(page.$("#a").nmProxy.n).toBeUndefined();
        expect(page.errors).toHaveLength(1);
    });

    it("gives an element only its nearest scope", async () => {
        const page = await mount(`
            <div nm-data="{ outer: 'o' }">
                <div nm-data="{ inner: 'i' }">
                    <span id="s" nm-bind="{ textContent: () => typeof outer + ':' + inner }"></span>
                </div>
            </div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("undefined:i");
    });

    it("skips everything under nm-ignore", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1 }">
                <div nm-ignore><span id="s" nm-bind="{ textContent: () => n }">x</span></div>
            </div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("x");
    });
});

describe("nm-bind properties", () => {
    it("sets a property and keeps it in step with the scope", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1 }"><span id="s" nm-bind="{ textContent: () => n * 10 }"></span></div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("10");

        page.scope("#s").n = 2;
        await page.settle();
        expect(page.$("#s").textContent).toBe("20");
    });

    it("toggles a class with class.<name>", async () => {
        const page = await mount(`
            <div nm-data="{ on: false }"><span id="s" nm-bind="{ 'class.active': () => on }"></span></div>
        `);
        await page.settle();
        expect(page.$("#s").classList.contains("active")).toBe(false);

        page.scope("#s").on = true;
        await page.settle();
        expect(page.$("#s").classList.contains("active")).toBe(true);
    });

    it("sets a sub-property with <prop>.<sub>", async () => {
        const page = await mount(`
            <div nm-data="{ c: 'red' }"><span id="s" nm-bind="{ 'style.color': () => c }"></span></div>
        `);
        await page.settle();
        expect(page.$("#s").style.color).toBe("red");
    });

    it("writes the resolved value of a promise", async () => {
        const page = await mount(`
            <div nm-data="{}"><span id="s" nm-bind="{ textContent: async () => 'later' }"></span></div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("later");
    });

    it("binds an element outside any scope to the helpers alone", async () => {
        const page = await mount(`<span id="s" nm-bind="{ textContent: () => typeof $get }"></span>`);
        await page.settle();
        expect(page.$("#s").textContent).toBe("function");
    });

    it("dispatches a non-bubbling init on the element after binding it", async () => {
        const page = await mount(`
            <div nm-data="{ got: [] }" id="d" nm-bind="{ oninit: () => got = [...got, 'scope'] }">
                <span nm-bind="{ oninit: () => got = [...got, 'child'] }"></span>
            </div>
        `);
        await page.settle();
        expect(page.$("#d").nmProxy.got).toEqual(["scope", "child"]);
    });
});

describe("nm-bind events", () => {
    it("listens with on<event> and runs the handler with this as the element", async () => {
        const page = await mount(`
            <div nm-data="{ id: null }"><button id="b" nm-bind="{ onclick: (e) => id = this.id + ':' + e.type }"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").id).toBe("b:click");
    });

    it("listens to custom events", async () => {
        const page = await mount(`
            <div nm-data="{ got: null }"><span id="s" nm-bind="{ onping: (e) => got = e.detail }"></span></div>
        `);
        page.$("#s").dispatchEvent(new page.window.CustomEvent("ping", { detail: 42 }));
        expect(page.scope("#s").got).toBe(42);
    });

    it("calls preventDefault with .prevent", async () => {
        const page = await mount(`
            <div nm-data="{}"><form id="f" nm-bind="{ 'onsubmit.prevent': () => {} }"></form></div>
        `);
        const event = new page.window.Event("submit", { cancelable: true });
        page.$("#f").dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it("stops propagation with .stop", async () => {
        const page = await mount(`
            <div nm-data="{ hits: 0 }" nm-bind="{ onclick: () => hits++ }">
                <button id="b" nm-bind="{ 'onclick.stop': () => {} }"></button>
            </div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").hits).toBe(0);
    });

    it("runs once with .once", async () => {
        const page = await mount(`
            <div nm-data="{ hits: 0 }"><button id="b" nm-bind="{ 'onclick.once': () => hits++ }"></button></div>
        `);
        page.$("#b").click();
        page.$("#b").click();
        expect(page.scope("#b").hits).toBe(1);
    });

    it("listens on window with .window", async () => {
        const page = await mount(`
            <div nm-data="{ key: null }"><span id="s" nm-bind="{ 'onkeydown.window': (e) => key = e.key }"></span></div>
        `);
        page.window.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Escape" }));
        expect(page.scope("#s").key).toBe("Escape");
    });

    it("runs only the last of quick events with .debounce<ms>", async () => {
        const page = await mount(`
            <div nm-data="{ got: [] }"><input id="i" nm-bind="{ 'oninput.debounce30': () => got = [...got, this.value] }"></div>
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
});

describe("helpers", () => {
    it("$dispatch sends a bubbling event from the element", async () => {
        const page = await mount(`
            <div nm-data="{ got: null }" nm-bind="{ onhello: (e) => got = e.detail }">
                <button id="b" nm-bind="{ onclick: () => $dispatch('hello', 'world') }"></button>
            </div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toBe("world");
    });

    it("$watch reruns a function when what it read changes", async () => {
        const page = await mount(`
            <div id="d" nm-data="{ n: 1, seen: [] }" nm-bind="{ oninit: () => $watch(() => seen.push(n)) }"></div>
        `);
        page.$("#d").nmProxy.n = 2;
        expect(page.$("#d").nmProxy.seen).toEqual([1, 2]);
    });

    it("$dataset merges data-* from the element up to its scope, nearest first", async () => {
        const page = await mount(`
            <div data-a="outside">
                <div nm-data="{ got: null }" data-a="scope" data-b="scope">
                    <p data-b="p">
                        <button id="b" data-c="button" nm-bind="{ onclick: () => got = $dataset() }"></button>
                    </p>
                </div>
            </div>
        `);
        page.$("#b").click();
        expect({ ...page.scope("#b").got }).toEqual({ a: "scope", b: "p", c: "button" });
    });

    it("$persist saves a member to localStorage as it changes", async () => {
        const page = await mount(`
            <div id="d" nm-data="{ n: 1 }" nm-bind="{ oninit: () => $persist('n') }"></div>
        `);
        expect(page.window.localStorage["_nmProp-n"]).toBe("1");

        page.$("#d").nmProxy.n = 5;
        expect(page.window.localStorage["_nmProp-n"]).toBe("5");
    });

    it("$persist restores what was saved before the page loaded", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ n: 1 }" nm-bind="{ oninit: () => $persist('n') }"></div>`,
            { beforeInit: (window) => (window.localStorage["_nmProp-n"] = "7") },
        );
        expect(page.$("#d").nmProxy.n).toBe(7);
    });

    it("$persist takes the storage key as its second argument", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ n: 1 }" nm-bind="{ oninit: () => $persist('n', 'count') }"></div>`,
            { beforeInit: (window) => (window.localStorage.count = "3") },
        );
        expect(page.$("#d").nmProxy.n).toBe(3);
    });
});

describe("reactivity", () => {
    it("has written a bind by the time the element's init runs", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1, seen: null }">
                <span id="s" nm-bind="{ textContent: () => n, oninit: () => seen = this.textContent }"></span>
            </div>
        `);
        expect(page.scope("#s").seen).toBe("1");
    });

    it("writes a bind as the scope changes, without waiting", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1 }"><span id="s" nm-bind="{ textContent: () => n }"></span></div>
        `);
        page.scope("#s").n = 2;
        expect(page.$("#s").textContent).toBe("2");
    });

    it("tracks what a bind reads when it runs again", async () => {
        const page = await mount(`
            <div nm-data="{ flag: true, a: 'a', b: 'b' }">
                <span id="s" nm-bind="{ textContent: () => flag ? a : b }"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.flag = false;
        scope.b = "b2";
        expect(page.$("#s").textContent).toBe("b2");
    });

    it("runs a bind again with its element as the current one", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1, got: [] }" nm-bind="{ onchanged: (e) => got = [...got, e.detail] }">
                <span id="s" nm-bind="{ textContent: () => ($dispatch('changed', n), n) }"></span>
            </div>
        `);
        page.scope("#s").n = 2;
        expect(page.scope("#s").got).toEqual([1, 2]);
        expect(page.errors).toEqual([]);
    });

    it("keeps tracking a bind after it calls $watch", async () => {
        const page = await mount(`
            <div nm-data="{ x: 1, y: 'y' }">
                <span id="s" nm-bind="{ textContent: () => { $watch(() => x); return y } }"></span>
            </div>
        `);
        page.scope("#s").y = "y2";
        expect(page.$("#s").textContent).toBe("y2");
    });

    it("drops the binds of an element a swap removed", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ n: 1, ran: [] }">
                <button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
                <div id="target"><span nm-bind="{ textContent: () => (ran.push(this.isConnected), n) }"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();

        const scope = page.$("#d").nmProxy;
        scope.ran.length = 0;
        scope.n = 2;
        expect(scope.ran).toEqual([]);
    });

    it("runs the binds of an element put back in the document", async () => {
        const page = await mount(`
            <div id="d" nm-data="{ n: 1 }"><span id="s" nm-bind="{ textContent: () => n }"></span></div>
        `);
        const scope = page.$("#d").nmProxy;
        const span = page.$("#s");
        span.remove();
        scope.n = 2;
        page.$("#d").append(span);
        expect(span.textContent).toBe("2");
        scope.n = 3;
        expect(span.textContent).toBe("3");
    });

    it("keeps a $watch set up from an element a swap removed while its scope stays", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ n: 1, seen: [] }">
                <button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
                <div id="target"><span nm-bind="{ oninit: () => $watch(() => seen.push(n)) }"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        page.$("#d").nmProxy.n = 2;
        expect(page.$("#d").nmProxy.seen).toEqual([1, 2]);
    });

    it("keeps a $persist set up from an element a swap removed while its scope stays", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ n: 1 }">
                <button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
                <div id="target"><span nm-bind="{ oninit: () => $persist('n') }"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        page.$("#d").nmProxy.n = 5;
        expect(page.window.localStorage["_nmProp-n"]).toBe("5");
    });

    it("logs a bind that throws and goes on binding the rest", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1 }">
                <span id="bad" nm-bind="{ textContent: () => n.missing.x }"></span>
                <span id="s" nm-bind="{ textContent: () => n }"></span>
            </div>
        `);
        expect(page.$("#s").textContent).toBe("1");
        expect(page.errors).toHaveLength(1);

        page.scope("#s").n = 2;
        expect(page.$("#s").textContent).toBe("2");
        expect(page.errors).toHaveLength(2);
    });

    it("runs a bind again when another bind it set off changes what it read", async () => {
        const page = await mount(`
            <div nm-data="{ a: 1, total: 0, label: '' }">
                <span id="first" nm-bind="{ textContent: () => { const shown = label; total = a + 1; return shown } }"></span>
                <span id="second" nm-bind="{ textContent: () => (label = 'v' + total) }"></span>
            </div>
        `);
        page.scope("#first").a = 5;
        expect(page.$("#first").textContent).toBe("v6");
        expect(page.errors).toEqual([]);
    });

    it("logs a bind that keeps setting itself off and stops it", async () => {
        const page = await mount(`
            <div nm-data="{ a: 0, b: 0 }">
                <span id="s" nm-bind="{ textContent: () => (a = b + 1) }"></span>
                <span nm-bind="{ textContent: () => (b = a + 1) }"></span>
            </div>
        `);
        expect(page.errors.some(([message]) => message.includes("stopped running after 100 times"))).toBe(true);
    });

    it("logs an async bind that rejects", async () => {
        const page = await mount(`
            <div nm-data="{}"><span nm-bind="{ textContent: async () => { throw new Error('no') } }"></span></div>
        `);
        await page.settle();
        expect(page.errors).toHaveLength(1);
    });

    it("does not run binds again when a value is set to what it already is", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1, runs: 0 }"><span id="s" nm-bind="{ textContent: () => (runs++, n) }"></span></div>
        `);
        page.scope("#s").n = 1;
        expect(page.scope("#s").runs).toBe(1);
    });

    it("creates a key set to undefined", async () => {
        const page = await mount(`
            <div id="d" nm-data="{}" nm-bind="{ oninit: () => $watch(() => 0) }"></div>
        `);
        const scope = page.$("#d").nmProxy;
        scope.color = undefined;
        expect("color" in scope).toBe(true);
    });

    it("runs binds again when an object is set to itself after changing it", async () => {
        const page = await mount(`
            <div nm-data="{ items: [] }">
                <button id="b" nm-bind="{ onclick: () => { items.push(1); items = items } }"></button>
                <span id="s" nm-bind="{ textContent: () => items.length }"></span>
            </div>
        `);
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("1");
    });

    it("stops running a bind for what it no longer reads", async () => {
        const page = await mount(`
            <div nm-data="{ flag: true, a: 'a', b: 'b', runs: 0 }">
                <span id="s" nm-bind="{ textContent: () => (runs++, flag ? a : b) }"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.flag = false;
        scope.a = "a2";
        expect(scope.runs).toBe(2);
    });

    it("replaces the watchers a bind made when it runs again", async () => {
        const page = await mount(`
            <div nm-data="{ x: 1, y: 1, log: [] }">
                <span id="s" nm-bind="{ textContent: () => { $watch(() => log.push(x)); return y } }"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.y = 2;
        scope.y = 3;
        scope.log.length = 0;
        scope.x = 2;
        expect(scope.log).toEqual([2]);
    });

    it("does not track what an event handler reads into the bind that sent the event", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1, other: 0, runs: 0 }" nm-bind="{ onchanged: () => other }">
                <span id="s" nm-bind="{ textContent: () => (runs++, $dispatch('changed'), n) }"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.other = 1;
        expect(scope.runs).toBe(1);
    });

    it("does not run a watcher again from inside itself", async () => {
        const page = await mount(`
            <div id="d" nm-data="{ count: 0 }" nm-bind="{ oninit: () => $watch(() => count = count + 1) }"></div>
        `);
        const scope = page.$("#d").nmProxy;
        expect(scope.count).toBe(1);
        scope.count = 10;
        expect(scope.count).toBe(11);
    });
});
