import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("#25 async binds", () => {
    it("keeps the value of the newest run when an older one resolves last", async () => {
        const page = await mount(
            `<div nm-let-n="1"><span id="s" nm-bind-textcontent="(async () => { const v = n; await wait(v === 1 ? 40 : 5); return v })()"></span></div>`,
            { beforeInit: (window) => (window.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) },
        );
        page.scope("#s").n = 2;
        await later(80);
        expect(page.$("#s").textContent).toBe("2");
    });

    it("does not write once the bind's element was taken out by a swap", async () => {
        const page = await mount(
            `<div nm-scope>
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target"><span id="s" nm-bind-textcontent="(async () => { await wait(30); return 'late' })()">old</span></div>
            </div>`,
            {
                server: () => `<div id="target"></div>`,
                beforeInit: (window) => (window.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))),
            },
        );
        const span = page.$("#s");
        page.$("#b").click();
        await page.settle();
        await later(50);
        expect(span.textContent).toBe("old");
    });
});

describe("#63 modifiers in a build without events", () => {
    it("warns that modifiers are not handled", async () => {
        const page = await mount(`<div nm-scope><form nm-on-submit.prevent="0"></form></div>`, { without: ["events"] });
        expect(page.warnings).toHaveLength(1);
    });
});

describe("#62 cssMorph", () => {
    it("keeps classes and styles set at init by other code after an outer swap", async () => {
        const page = await mount(
            `<div nm-scope>
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="t" class="old" style="color: blue"></div>
            </div>`,
            { server: () => `<div id="t" class="new" style="margin: 1px" nm-on-init="this.classList.add('ready'); this.style.padding = '2px'"></div>` },
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
});

describe("#46 debounces", () => {
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
});
