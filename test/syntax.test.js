import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("nm-bind-* attributes", () => {
    it("finds the element's property by its name in lowercase", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 3 }"><span id="s" nm-bind-tabindex="n" nm-bind-textcontent="n * 2"></span></div>
        `);
        expect(page.$("#s").tabIndex).toBe(3);
        expect(page.$("#s").textContent).toBe("6");
    });

    it("leaves what follows the dot as written", async () => {
        const page = await mount(`
            <div nm-scope="{ on: true }"><span id="s" nm-bind-class.ring-2="on" nm-bind-style.background-color="on ? 'red' : ''"></span></div>
        `);
        expect(page.$("#s").classList.contains("ring-2")).toBe(true);
        expect(page.$("#s").style.backgroundColor).toBe("red");
    });

    it("logs a name the element has no property for, and binds the rest", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 1 }"><span id="s" nm-bind-text-content="n" nm-bind-myprop="n" nm-bind-title="n"></span></div>
        `);
        const span = page.$("#s");
        expect(span.title).toBe("1");
        expect(span["text-content"]).toBeUndefined();
        expect(span.myprop).toBeUndefined();
        expect(page.errors).toHaveLength(2);
    });

    it("sets a property whose name starts with on, without taking it for an event", async () => {
        const page = await mount(`<div nm-scope="{}"><span id="s" nm-bind-onclick="() => 1"></span></div>`);
        expect(typeof page.$("#s").onclick).toBe("function");
    });

    it("binds undefined for an empty value", async () => {
        const page = await mount(`<div nm-scope="{}"><span id="s" nm-bind-title=""></span></div>`);
        expect(page.$("#s").title).toBe("undefined");
        expect(page.errors).toEqual([]);
    });

    it("takes an expression that ends in a line comment", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 1 }"><span id="s" nm-bind-textcontent="n // the count"></span></div>
        `);
        expect(page.$("#s").textContent).toBe("1");
    });

    it("ignores the old nm-bind object", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 1 }"><span id="s" nm-bind="{ textContent: () => n }">old</span></div>
        `);
        expect(page.$("#s").textContent).toBe("old");
    });

    it("logs an element whose attributes do not make an expression, and binds the rest", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 1 }">
                <span id="bad" nm-bind-textcontent="n +"></span>
                <span id="s" nm-bind-textcontent="n"></span>
            </div>
        `);
        expect(page.$("#s").textContent).toBe("1");
        expect(page.errors).toHaveLength(1);
    });
});

describe("nm-on-* attributes", () => {
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

    it("passes the event to a handler in a build without the events block", async () => {
        const page = await mount(
            `<div nm-scope="{ got: null }"><input id="i" nm-on-input="got = e.type"></div>`,
            { without: ["events"] },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        expect(page.scope("#i").got).toBe("input");
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

describe("attribute names and values, after review", () => {
    it("finds a property with capitals in a row", async () => {
        const page = await mount(`
            <div nm-scope="{ html: '<b>x</b>' }"><div id="b" nm-bind-innerhtml="html"></div></div>
        `);
        expect(page.$("#b").innerHTML).toBe("<b>x</b>");
    });

    it("sets a CSS custom property with style.--name", async () => {
        const page = await mount(`<div nm-scope="{}"><span id="s" nm-bind-style.--accent="'red'"></span></div>`);
        expect(page.$("#s").style.getPropertyValue("--accent")).toBe("red");
    });

    it("listens to a kebab-case event as written", async () => {
        const page = await mount(`
            <div nm-scope="{ got: 0 }"><span id="s" nm-on-item-added="got++"></span></div>
        `);
        page.$("#s").dispatchEvent(new page.window.Event("item-added"));
        expect(page.scope("#s").got).toBe(1);
    });

    it("sets the data-* attribute named after dataset", async () => {
        const page = await mount(`
            <div nm-scope="{ id: 7 }"><span id="s" data-userid="x" nm-bind-dataset.user-id="id"></span></div>
        `);
        const span = page.$("#s");
        expect(span.getAttribute("data-user-id")).toBe("7");
        expect(span.getAttribute("data-userid")).toBe("x");
        page.scope("#s").id = null;
        expect(span.hasAttribute("data-user-id")).toBe(false);
    });

    it("sets a style by its CSS name, and removes it for null or false", async () => {
        const page = await mount(`
            <div nm-scope="{ c: 'red' }"><span id="s" nm-bind-style.background-color="c" nm-bind-style.--accent="c"></span></div>
        `);
        const span = page.$("#s");
        expect(span.style.backgroundColor).toBe("red");
        page.scope("#s").c = false;
        expect(span.style.backgroundColor).toBe("");
        expect(span.style.getPropertyValue("--accent")).toBe("");
    });

    it("toggles a class name with dots in it", async () => {
        const page = await mount(`<div nm-scope="{}"><span id="s" nm-bind-class.py-1.5="true"></span></div>`);
        expect(page.$("#s").classList.contains("py-1.5")).toBe(true);
    });

    it("logs a handler that rejects", async () => {
        const page = await mount(`
            <div nm-scope="{}"><button id="b" nm-on-click="await 0; throw new Error('no')"></button></div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.errors).toHaveLength(1);
    });

    it("logs an element still using the old nm-bind object", async () => {
        const page = await mount(`<div nm-scope="{}"><span nm-bind="{ textContent: () => 1 }"></span></div>`);
        expect(page.errors).toHaveLength(1);
    });

    it("keeps the other attributes of an element when one holds only spaces or a comment", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 0 }"><button id="b" nm-bind-title=" " nm-bind-lang="// later" nm-on-click="n++"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").n).toBe(1);
    });

    it("listens to a modified event by its name in a build without the events block", async () => {
        const page = await mount(
            `<div nm-scope="{ got: 0 }"><button id="b" nm-on-click.prevent="got++"></button></div>`,
            { without: ["events"] },
        );
        page.$("#b").click();
        expect(page.scope("#b").got).toBe(1);
    });
});

describe("class names that keep their case, in values", () => {
    it("toggles the classes of an object, capitals and dots kept", async () => {
        const page = await mount(`
            <div nm-scope="{ on: true }"><span id="s" class="base" nm-bind-class="{ isActive: on, 'py-1.5': !on }"></span></div>
        `);
        const span = page.$("#s");
        expect([...span.classList]).toEqual(["base", "isActive"]);
        page.scope("#s").on = false;
        expect([...span.classList]).toEqual(["base", "py-1.5"]);
    });

    it("adds the classes of a string or an array, and takes away the ones it added before", async () => {
        const page = await mount(`
            <div nm-scope="{ list: 'a bB' }"><span id="s" class="base" nm-bind-class="list"></span></div>
        `);
        const span = page.$("#s");
        expect([...span.classList]).toEqual(["base", "a", "bB"]);
        page.scope("#s").list = ["bB", "c"];
        expect([...span.classList].sort()).toEqual(["bB", "base", "c"]);
        page.scope("#s").list = null;
        expect([...span.classList]).toEqual(["base"]);
    });

});

describe("the class value, after review", () => {
    it("leaves a class written in the HTML when the value had it too", async () => {
        const page = await mount(`
            <div nm-scope="{ on: true }"><span id="s" class="btn" nm-bind-class="on ? 'btn active' : ''"></span></div>
        `);
        const span = page.$("#s");
        expect([...span.classList]).toEqual(["btn", "active"]);
        page.scope("#s").on = false;
        expect([...span.classList]).toEqual(["btn"]);
    });

});
