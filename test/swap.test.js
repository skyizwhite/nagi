import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { frame, later } from "./support.js";

describe("strategies", () => {
    const swap = async (answer, html = `<div id="target" class="t"><span>old</span></div>`) => {
        const page = await mount(button(`$get('/x')`) .replace(`<div id="target">old</div>`, html), {
            server: () => answer,
        });
        page.$("#b").click();
        await page.settle();
        return page;
    };

    const mountSwap = (html, answer) =>
        mount(
            `<div id="d" n-scope="{ hits: 0, gone: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                ${html}
            </div>`,
            { server: () => answer },
        );

    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    const button = (call, scope = "{}") => `
        <div id="d" n-scope="${scope}"><button id="b" n-on-click="${call}"></button></div>
        <div id="target">old</div>
    `;

    it("replaces the element with the same id by default", async () => {
        const page = await swap(`<div id="target"><b>new</b></div>`);
        expect(page.$("#target").outerHTML).toBe(`<div id="target"><b>new</b></div>`);
    });

    it("replaces only the children with n-swap=inner", async () => {
        const page = await swap(`<div id="target" n-swap="inner"><b>new</b></div>`);
        expect(page.$("#target").outerHTML).toBe(`<div id="target" class="t"><b>new</b></div>`);
    });

    it.each([
        ["before", `<b>new</b><div id="target" class="t"><span>old</span></div>`],
        ["after", `<div id="target" class="t"><span>old</span></div><b>new</b>`],
        ["prepend", `<div id="target" class="t"><b>new</b><span>old</span></div>`],
        ["append", `<div id="target" class="t"><span>old</span><b>new</b></div>`],
    ])("puts the children %s the element", async (strategy, expected) => {
        const page = await swap(`<div id="target" n-swap="${strategy}"><b>new</b></div>`);
        expect(page.$("#target").parentElement.innerHTML).toContain(expected);
    });

    it("swaps every element of the answer that has an id", async () => {
        const page = await swap(
            `<div id="target">one</div><div id="d2">two</div>`,
            `<div id="target">old</div><div id="d2">old</div>`,
        );
        expect(page.$("#target").textContent).toBe("one");
        expect(page.$("#d2").textContent).toBe("two");
    });

    it("warns about an element with no id or no target, and skips it", async () => {
        const page = await swap(`<p>no id</p><div id="nowhere">x</div>`);
        expect(page.warnings).toHaveLength(2);
        expect(page.$("#target").textContent).toBe("old");
    });

    it("binds what it swaps in", async () => {
        const page = await swap(
            `<div id="target" n-scope="{ n: 9 }"><span id="s" n-bind-textcontent="n"></span></div>`,
        );
        expect(page.$("#s").textContent).toBe("9");
    });

    it("logs a strategy that only contains a valid one, and goes on with the rest", async () => {
        const page = await mountSwap(
            `<div id="target">old</div><div id="other">old</div>`,
            `<div id="target" n-swap="afterend">new</div><div id="other">new</div>`,
        );
        await swapOnce(page);
        expect(page.$("#target").textContent).toBe("old");
        expect(page.$("#other").textContent).toBe("new");
        expect(page.errors).toHaveLength(1);
    });
});

describe("inner swaps", () => {
    const mountSwap = (html, answer) =>
        mount(
            `<div id="d" n-scope="{ hits: 0, gone: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                ${html}
            </div>`,
            { server: () => answer },
        );

    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("binds the target of an inner swap only once", async () => {
        const page = await mountSwap(
            `<div id="target" n-on-ping="hits++"></div>`,
            `<div id="target" n-swap="inner"><span>new</span></div>`,
        );
        await swapOnce(page);
        await swapOnce(page);
        page.$("#target").dispatchEvent(new page.window.Event("ping"));
        expect(page.$("#d").nagiProxy.hits).toBe(1);
    });

    it("keeps the scope of the target of an inner swap, and binds the new children to it", async () => {
        const page = await mount(
            `<button id="b" n-on-click="$get('/x')"></button>
            <div id="target" n-scope="{ n: 1 }"></div>`,
            { server: () => `<div id="target" n-swap="inner"><span id="s" n-bind-textcontent="n"></span></div>` },
        );
        const scope = page.$("#target").nagiProxy;
        scope.n = 5;
        await swapOnce(page);
        expect(page.$("#target").nagiProxy).toBe(scope);
        expect(page.$("#s").textContent).toBe("5");
        scope.n = 6;
        expect(page.$("#s").textContent).toBe("6");
    });
});

describe("cleanup", () => {
    const mountSwap = (html, answer) =>
        mount(
            `<div id="d" n-scope="{ hits: 0, gone: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                ${html}
            </div>`,
            { server: () => answer },
        );

    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    const destroyed = `
        <div id="target" n-on-destroy="gone = [...gone, 'target']">
            <span n-on-destroy="gone = [...gone, 'child']"></span>
        </div>
    `;

    it("dispatches destroy on the bound elements it replaces", async () => {
        const page = await mount(
            `<div n-scope="{ gone: [] }" id="d">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target"><span n-on-destroy="gone = [...gone, 'span']"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nagiProxy.gone).toEqual(["span"]);
    });

    it("sends destroy to the target and what is in it on an outer swap", async () => {
        const page = await mountSwap(destroyed, `<div id="target"></div>`);
        await swapOnce(page);
        expect(page.$("#d").nagiProxy.gone).toEqual(["target", "child"]);
    });

    it("sends destroy only to the children on an inner swap", async () => {
        const page = await mountSwap(destroyed, `<div id="target" n-swap="inner"></div>`);
        await swapOnce(page);
        expect(page.$("#d").nagiProxy.gone).toEqual(["child"]);
    });

    it.each(["before", "after", "prepend", "append"])("sends no destroy on a %s swap", async (strategy) => {
        const page = await mountSwap(destroyed, `<div id="target" n-swap="${strategy}"><b>new</b></div>`);
        await swapOnce(page);
        expect(page.$("#d").nagiProxy.gone).toEqual([]);
    });

    it("stops the debounce of an element it removed", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ got: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target"><input id="i" n-on-input="$debounce(() => got = [...got, 'ran'], 30)"></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(page.$("#d").nagiProxy.got).toEqual([]);
    });

    it("removes the window listeners of an element it removed", async () => {
        const target = `<div id="target" n-on-keydown.window="hits++"></div>`;
        const page = await mount(
            `<div id="d" n-scope="{ hits: 0 }">
                <button id="b" n-on-click="$get('/x')"></button>
                ${target}
            </div>`,
            { server: () => target },
        );
        for (let i = 0; i < 3; i++) {
            page.$("#b").click();
            await page.settle();
        }
        page.window.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "a" }));
        expect(page.$("#d").nagiProxy.hits).toBe(1);
    });
});

describe("cssMorph", () => {
    const swapTwice = async (fragment, before = `<div id="t" class="old"></div>`) => {
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button>${before}</div>`,
            { server: () => fragment },
        );
        for (let i = 0; i < 2; i++) {
            page.$("#b").click();
            await page.settle();
            await later(30);
        }
        return page;
    };

    it("keeps the classes and styles binds set after an outer swap", async () => {
        const page = await mount(
            `<div n-scope n-let-on="true">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" class="card" n-bind-class.active="on" n-bind-style.color="'red'"></div>
            </div>`,
            { server: () => `<div id="target" class="card" n-bind-class.active="on" n-bind-style.color="'red'"></div>` },
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
            `<div n-scope n-let-on="true">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" class="card collapsed" n-bind-class.active="on"></div>
            </div>`,
            { server: () => `<div id="target" class="card expanded" n-bind-class.active="on"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect([...page.$("#target").classList].sort()).toEqual(["active", "card", "expanded"]);
    });

    it("puts back a className bind after an outer swap", async () => {
        const page = await mount(
            `<div n-scope n-let-cls="'card open'">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" class="card" n-bind-classname="cls"></div>
            </div>`,
            { server: () => `<div id="target" class="card" n-bind-classname="cls"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(page.$("#target").className).toBe("card open");
    });

    it("still settles the class of an outer swap's target from the old to the new", async () => {
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="target" class="old"></div></div>`,
            { server: () => `<div id="target" class="new"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(page.$("#target").className).toBe("new");
    });

    it("leaves the target of an inner swap and its wrapper alone, and settles the new children", async () => {
        const page = await mount(
            `<div n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" class="keep"><p id="p" class="old"></p></div>
            </div>`,
            { server: () => `<div id="target" n-swap="inner" class="wrapper"><p id="p" class="new"></p></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(page.$("#target").className).toBe("keep");
        expect(page.$("#p").className).toBe("new");
    });

    it("keeps classes and styles set at init by other code after an outer swap", async () => {
        const page = await mount(
            `<div n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="t" class="old" style="color: blue"></div>
            </div>`,
            { server: () => `<div id="t" class="new" style="margin: 1px" n-on-init="$el.classList.add('ready'); $el.style.padding = '2px'"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await later(30);
        const t = page.$("#t");
        expect([...t.classList].sort()).toEqual(["new", "ready"]);
        expect(t.style.padding).toBe("2px");
        expect(t.style.margin).toBe("1px");
        expect(t.style.color).toBe("");
    });

    it("keeps what init sets when the old element had it too", async () => {
        const page = await swapTwice(`<div id="t" class="new" n-on-init="$el.classList.add('ready'); $el.style.padding = '2px'"></div>`);
        const t = page.$("#t");
        expect([...t.classList].sort()).toEqual(["new", "ready"]);
        expect(t.style.padding).toBe("2px");
    });

    it("keeps a class init takes away from the answer's markup", async () => {
        const page = await swapTwice(`<div id="t" class="loading" n-on-init="$el.classList.remove('loading')"></div>`);
        expect(page.$("#t").classList.contains("loading")).toBe(false);
    });
});
