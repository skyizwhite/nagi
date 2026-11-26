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

    it("takes a value whose first line is a comment", async () => {
        const page = await mount(`<div nm-let-name="'Ann'"><span id="s" nm-bind-textcontent="// label
            name"></span></div>`);
        expect(page.$("#s").textContent).toBe("Ann");
    });

    it("logs a value with more than one statement", async () => {
        const page = await mount(`<div nm-let-n="1"><span id="s" nm-bind-textcontent="n; n + 1">x</span></div>`);
        expect(page.$("#s").textContent).toBe("x");
        expect(page.errors).toHaveLength(1);
    });

    it("splits the keys of a class object on spaces", async () => {
        const page = await mount(`<div nm-let-on="true"><span id="s" nm-bind-class="{ 'btn primary': on }"></span></div>`);
        expect([...page.$("#s").classList]).toEqual(["btn", "primary"]);
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

    it("warns about a style name the element's style does not have, and still sets it", async () => {
        const page = await mount(`<div nm-scope><span id="s" nm-bind-style.--x="'1'" nm-bind-style.backgroundcolor="'red'"></span></div>`);
        expect(page.warnings).toHaveLength(1);
        expect(page.errors).toEqual([]);
    });

    it("logs a property that cannot be written", async () => {
        const page = await mount(`<div nm-scope><span nm-bind-dataset="{ a: 1 }" nm-bind-tagname="'p'"></span></div>`);
        expect(page.errors).toHaveLength(2);
    });
});

describe("#56 nm-on-*", () => {
    it("takes the name before the first dot as the event, and warns about modifiers it does not know", async () => {
        const page = await mount(`
            <div nm-let-got="0"><button id="b" nm-on-click.self="got++"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toBe(1);
        expect(page.warnings).toHaveLength(1);
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

    it("settles the class of an outer swap's bound target, and puts the bound classes back", async () => {
        const page = await mount(
            `<div nm-let-on="true">
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target" class="card collapsed" nm-bind-class.active="on"></div>
            </div>`,
            { server: () => `<div id="target" class="card expanded" nm-bind-class.active="on"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect([...page.$("#target").classList].sort()).toEqual(["active", "card", "expanded"]);
    });

    it("puts back a className bind after an outer swap", async () => {
        const page = await mount(
            `<div nm-let-cls="'card open'">
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target" class="card" nm-bind-classname="cls"></div>
            </div>`,
            { server: () => `<div id="target" class="card" nm-bind-classname="cls"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(page.$("#target").className).toBe("card open");
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
