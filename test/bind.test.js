import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("properties", () => {
    it("sets a sub-property with <prop>.<sub>", async () => {
        const page = await mount(`
            <div nm-scope="{ c: 'red' }"><span id="s" nm-bind-style.color="c"></span></div>
        `);
        await page.settle();
        expect(page.$("#s").style.color).toBe("red");
    });

    it("binds an element outside any scope to the helpers alone", async () => {
        const page = await mount(`<span id="s" nm-bind-textcontent="typeof $get"></span>`);
        await page.settle();
        expect(page.$("#s").textContent).toBe("function");
    });

    it("finds the element's property by its name in lowercase", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 3 }"><span id="s" nm-bind-tabindex="n" nm-bind-textcontent="n * 2"></span></div>
        `);
        expect(page.$("#s").tabIndex).toBe(3);
        expect(page.$("#s").textContent).toBe("6");
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

    it("finds a property with capitals in a row", async () => {
        const page = await mount(`
            <div nm-scope="{ html: '<b>x</b>' }"><div id="b" nm-bind-innerhtml="html"></div></div>
        `);
        expect(page.$("#b").innerHTML).toBe("<b>x</b>");
    });

    it("logs a property that cannot be written", async () => {
        const page = await mount(`<div nm-scope><span nm-bind-dataset="{ a: 1 }" nm-bind-tagname="'p'"></span></div>`);
        expect(page.errors).toHaveLength(2);
    });
});

describe("values", () => {
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

    it("keeps the other attributes of an element when one holds only spaces or a comment", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 0 }"><button id="b" nm-bind-title=" " nm-bind-lang="// later" nm-on-click="n++"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").n).toBe(1);
    });

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
});

describe("classes", () => {
    it("toggles a class with class.<name>", async () => {
        const page = await mount(`
            <div nm-scope="{ on: false }"><span id="s" nm-bind-class.active="on"></span></div>
        `);
        await page.settle();
        expect(page.$("#s").classList.contains("active")).toBe(false);

        page.scope("#s").on = true;
        await page.settle();
        expect(page.$("#s").classList.contains("active")).toBe(true);
    });

    it("toggles a class name with dots in it", async () => {
        const page = await mount(`<div nm-scope="{}"><span id="s" nm-bind-class.py-1.5="true"></span></div>`);
        expect(page.$("#s").classList.contains("py-1.5")).toBe(true);
    });

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

    it("leaves a class written in the HTML when the value had it too", async () => {
        const page = await mount(`
            <div nm-scope="{ on: true }"><span id="s" class="btn" nm-bind-class="on ? 'btn active' : ''"></span></div>
        `);
        const span = page.$("#s");
        expect([...span.classList]).toEqual(["btn", "active"]);
        page.scope("#s").on = false;
        expect([...span.classList]).toEqual(["btn"]);
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
});

describe("style and dataset", () => {
    it("leaves what follows the dot as written", async () => {
        const page = await mount(`
            <div nm-scope="{ on: true }"><span id="s" nm-bind-class.ring-2="on" nm-bind-style.background-color="on ? 'red' : ''"></span></div>
        `);
        expect(page.$("#s").classList.contains("ring-2")).toBe(true);
        expect(page.$("#s").style.backgroundColor).toBe("red");
    });

    it("sets a CSS custom property with style.--name", async () => {
        const page = await mount(`<div nm-scope="{}"><span id="s" nm-bind-style.--accent="'red'"></span></div>`);
        expect(page.$("#s").style.getPropertyValue("--accent")).toBe("red");
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

    it("warns about a style name the element's style does not have, and still sets it", async () => {
        const page = await mount(`<div nm-scope><span id="s" nm-bind-style.--x="'1'" nm-bind-style.backgroundcolor="'red'"></span></div>`);
        expect(page.warnings).toHaveLength(1);
        expect(page.errors).toEqual([]);
    });
});

describe("the old nm-bind object", () => {
    it("ignores the old nm-bind object", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 1 }"><span id="s" nm-bind="{ textContent: () => n }">old</span></div>
        `);
        expect(page.$("#s").textContent).toBe("old");
    });

    it("logs an element still using the old nm-bind object", async () => {
        const page = await mount(`<div nm-scope="{}"><span nm-bind="{ textContent: () => 1 }"></span></div>`);
        expect(page.errors).toHaveLength(1);
    });
});
