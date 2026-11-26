import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("nm-bind-* attributes", () => {
    it("turns a kebab-case name into a camelCase property", async () => {
        const page = await mount(`
            <div nm-data="{ n: 3 }"><span id="s" nm-bind-tab-index="n" nm-bind-text-content="n * 2"></span></div>
        `);
        expect(page.$("#s").tabIndex).toBe(3);
        expect(page.$("#s").textContent).toBe("6");
    });

    it("leaves what follows the dot as written", async () => {
        const page = await mount(`
            <div nm-data="{ on: true }"><span id="s" nm-bind-class.ring-2="on" nm-bind-style.background-color="on ? 'red' : ''"></span></div>
        `);
        expect(page.$("#s").classList.contains("ring-2")).toBe(true);
        expect(page.$("#s").style.backgroundColor).toBe("red");
    });

    it("sets a property whose name starts with on, without taking it for an event", async () => {
        const page = await mount(`<div nm-data="{}"><span id="s" nm-bind-once-value="'v'"></span></div>`);
        expect(page.$("#s").onceValue).toBe("v");
    });

    it("binds undefined for an empty value", async () => {
        const page = await mount(`<div nm-data="{}"><span id="s" nm-bind-title=""></span></div>`);
        expect(page.$("#s").title).toBe("undefined");
        expect(page.errors).toEqual([]);
    });

    it("takes an expression that ends in a line comment", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1 }"><span id="s" nm-bind-text-content="n // the count"></span></div>
        `);
        expect(page.$("#s").textContent).toBe("1");
    });

    it("ignores the old nm-bind object", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1 }"><span id="s" nm-bind="{ textContent: () => n }">old</span></div>
        `);
        expect(page.$("#s").textContent).toBe("old");
    });

    it("logs an element whose attributes do not make an expression, and binds the rest", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1 }">
                <span id="bad" nm-bind-text-content="n +"></span>
                <span id="s" nm-bind-text-content="n"></span>
            </div>
        `);
        expect(page.$("#s").textContent).toBe("1");
        expect(page.errors).toHaveLength(1);
    });
});

describe("nm-on-* attributes", () => {
    it("runs statements with the event as e and the element as this", async () => {
        const page = await mount(`
            <div nm-data="{ got: null }"><button id="b" nm-on-click="const t = e.type; got = this.id + ':' + t"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toBe("b:click");
    });

    it("lets a handler await", async () => {
        const page = await mount(`
            <div nm-data="{ got: [] }"><button id="b" nm-on-click="got = [...got, 1]; await 0; got = [...got, 2]"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toEqual([1]);
        await page.settle();
        expect(page.scope("#b").got).toEqual([1, 2]);
    });

    it("keeps an event name as written", async () => {
        const page = await mount(`
            <div nm-data="{ got: 0 }"><span id="s" nm-on-my-event="got++"></span></div>
        `);
        page.$("#s").dispatchEvent(new page.window.Event("my-event"));
        expect(page.scope("#s").got).toBe(1);
    });

    it("passes the event to a handler in a build without the events block", async () => {
        const page = await mount(
            `<div nm-data="{ got: null }"><input id="i" nm-on-input="got = e.type"></div>`,
            { without: ["events"] },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        expect(page.scope("#i").got).toBe("input");
    });

    it("sends init and destroy to an element with only nm-on-* attributes", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ log: [] }">
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
