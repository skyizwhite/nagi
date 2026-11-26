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

    it("$persist keeps a member in localStorage and restores it", async () => {
        const page = await mount(`
            <div id="d" nm-data="{ n: 1 }" nm-bind="{ oninit: () => $persist('n') }"></div>
        `);
        page.$("#d").nmProxy.n = 5;
        expect(page.window.localStorage["_nmProp-n"]).toBe("5");

        const again = await mount(`
            <div id="d" nm-data="{ n: 1 }" nm-bind="{ oninit: () => $persist('n') }"></div>
        `);
        again.window.localStorage["_nmProp-n"] = "7";
        again.$("#d").dispatchEvent(new again.window.Event("init"));
        expect(again.$("#d").nmProxy.n).toBe(7);
    });
});
