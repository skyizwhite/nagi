import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

const frame = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("#56 values of nm-bind-*", () => {
    it("takes a value that ends in a semicolon", async () => {
        const page = await mount(`<div nm-let-n="1"><span id="s" nm-bind-textcontent="n;"></span></div>`);
        expect(page.$("#s").textContent).toBe("1");
        expect(page.errors).toEqual([]);
    });

    it("takes a value that is only a comment as undefined", async () => {
        const page = await mount(`<div nm-scope><span id="s" nm-bind-title="// later"></span></div>`);
        expect(page.$("#s").title).toBe("undefined");
        expect(page.errors).toEqual([]);
    });

    it("keeps a class off while its value is undefined", async () => {
        const page = await mount(`
            <div nm-let-sel="undefined" nm-let-n="0"><span id="s" nm-bind-class.active="(n, sel?.on)"></span></div>
        `);
        const scope = page.scope("#s");
        scope.n = 1;
        scope.n = 2;
        scope.n = 3;
        expect(page.$("#s").classList.contains("active")).toBe(false);
    });

    it("splits the items of a class array on spaces", async () => {
        const page = await mount(`
            <div nm-let-list="['x', 'a b']"><span id="s" nm-bind-class="list"></span></div>
        `);
        const span = page.$("#s");
        expect([...span.classList]).toEqual(["x", "a", "b"]);
        page.scope("#s").list = [];
        expect([...span.classList]).toEqual([]);
    });

    it("logs a style name the element's style does not have", async () => {
        const page = await mount(`<div nm-scope><span nm-bind-style.backgroundcolor="'red'"></span></div>`);
        expect(page.errors).toHaveLength(1);
    });

    it("logs a property that cannot be written", async () => {
        const page = await mount(`<div nm-scope><span nm-bind-dataset="{ a: 1 }" nm-bind-tagname="'p'"></span></div>`);
        expect(page.errors).toHaveLength(2);
    });
});

describe("#56 nm-on-*", () => {
    it("listens to an event with dots in its name, taking only known modifiers off the end", async () => {
        const page = await mount(`
            <div nm-let-got="0"><span id="s" nm-on-shown.bs.modal.once="got++"></span></div>
        `);
        const span = page.$("#s");
        span.dispatchEvent(new page.window.Event("shown.bs.modal"));
        span.dispatchEvent(new page.window.Event("shown.bs.modal"));
        expect(page.scope("#s").got).toBe(1);
    });

    it("warns about a handler that only makes a function", async () => {
        const page = await mount(`<div nm-scope><button nm-on-click="() => 1"></button></div>`);
        expect(page.warnings).toHaveLength(1);
    });
});

describe("#59 #33 cssMorph", () => {
    it("keeps the classes and styles binds set after an outer swap", async () => {
        const page = await mount(
            `<div nm-let-on="true">
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target" class="card" nm-bind-class.active="on" nm-bind-style.color="'red'"></div>
            </div>`,
            { server: () => `<div id="target" class="card" nm-bind-class.active="on" nm-bind-style.color="'red'"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        const target = page.$("#target");
        expect(target.classList.contains("active")).toBe(true);
        expect(target.style.color).toBe("red");
    });

    it("still settles the class of an outer swap's target from the old to the new", async () => {
        const page = await mount(
            `<div nm-scope><button id="b" nm-on-click="$get('/x')"></button><div id="target" class="old"></div></div>`,
            { server: () => `<div id="target" class="new"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(page.$("#target").className).toBe("new");
    });

    it("leaves the target of an inner swap and its wrapper alone, and settles the new children", async () => {
        const page = await mount(
            `<div nm-scope>
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target" class="keep"><p id="p" class="old"></p></div>
            </div>`,
            { server: () => `<div id="target" nm-swap="inner" class="wrapper"><p id="p" class="new"></p></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(page.$("#target").className).toBe("keep");
        expect(page.$("#p").className).toBe("new");
    });
});
