import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("#11 names of outer scopes", () => {
    const html = `
        <div id="outer" nm-scope="{ count: 1, name: 'outer', items: [1, 2, 3], remove(id) { this.items = this.items.filter((i) => i !== id) } }">
            <section id="inner" nm-let-name="'inner'" nm-let-id="2">
                <span id="name" nm-bind-textcontent="name"></span>
                <span id="count" nm-bind-textcontent="count"></span>
                <span id="items" nm-bind-textcontent="items.join(',')"></span>
                <button id="inc" nm-on-click="count++"></button>
                <button id="rename" nm-on-click="name = 'x'"></button>
                <button id="remove" nm-on-click="remove(id)"></button>
            </section>
        </div>
    `;

    it("reads a name the inner scope lacks from the outer one, the inner one first", async () => {
        const page = await mount(html);
        expect(page.$("#name").textContent).toBe("inner");
        expect(page.$("#count").textContent).toBe("1");
    });

    it("runs an inner bind again when the outer value changes", async () => {
        const page = await mount(html);
        page.$("#outer").nmProxy.count = 5;
        expect(page.$("#count").textContent).toBe("5");
    });

    it("writes to the scope that has the name", async () => {
        const page = await mount(html);
        page.$("#inc").click();
        page.$("#rename").click();
        expect(page.$("#outer").nmProxy.count).toBe(2);
        expect(page.$("#outer").nmProxy.name).toBe("outer");
        expect(page.$("#inner").nmProxy.name).toBe("x");
        expect(Object.hasOwn(page.$("#inner").nmProxy, "count")).toBe(false);
    });

    it("calls an outer method with what it reads and writes reaching the outer scope", async () => {
        const page = await mount(html);
        page.$("#remove").click();
        expect(page.$("#items").textContent).toBe("1,3");
    });

    it("goes out more than one scope", async () => {
        const page = await mount(`
            <div nm-let-a="1"><div nm-let-b="2"><div nm-let-c="3"><span id="s" nm-bind-textcontent="a + b + c"></span></div></div></div>
        `);
        expect(page.$("#s").textContent).toBe("6");
    });

    it("evaluates an inner nm-let-* with the outer names", async () => {
        const page = await mount(`<div nm-let-base="10"><div id="d" nm-let-twice="base * 2"></div></div>`);
        expect(page.$("#d").nmProxy.twice).toBe(20);
    });

    it("uses the innermost scope's helpers", async () => {
        let answer;
        const page = await mount(
            `<div id="outer" nm-scope><div id="inner" nm-scope><button id="b" nm-on-click="$get('/x')"></button></div></div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#b").click();
        expect(page.$("#inner").nmProxy.$fetching).toBe(true);
        expect(page.$("#outer").nmProxy.$fetching).toBe(false);
        answer("");
        await page.settle();
    });
});
