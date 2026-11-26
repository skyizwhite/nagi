import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

const send = async (call, html = "", options = {}) => {
    const page = await mount(
        `<div nm-scope>${html}<button id="b" nm-on-click="${call}"></button></div>`,
        { server: () => "", ...options },
    );
    page.$("#b").click();
    await page.settle();
    return page;
};

describe("what a request sends", () => {
    it("repeats the key for each item of an array, and leaves out null and undefined", async () => {
        const page = await send(`$get('/x', { tags: ['a', 'b'], none: null, gone: undefined, n: 0 })`);
        expect(page.requests[0].url).toBe("http://localhost/x?tags=a&tags=b&n=0");
    });

    it("sends the fields of a form element as FormData", async () => {
        const page = await mount(
            `<form id="f" nm-scope nm-on-submit.prevent="$post('/save', this)">
                <input name="title" value="Hi">
                <input name="tag" value="a"><input name="tag" value="b">
            </form>`,
            { server: () => "" },
        );
        page.$("#f").dispatchEvent(new page.window.Event("submit", { cancelable: true }));
        await page.settle();
        expect(page.requests[0].body).toEqual([["title", "Hi"], ["tag", "a"], ["tag", "b"]]);
    });

    it("sends a file in FormData", async () => {
        const page = await mount(`<div id="f" nm-scope></div>`, { server: () => "" });
        const file = new page.window.File(["hello"], "a.txt", { type: "text/plain" });
        const data = new page.window.FormData();
        data.append("doc", file);
        page.$("#f").nmProxy.$post("/upload", data);
        await page.settle();
        const [[name, sent]] = page.requests[0].body;
        expect(name).toBe("doc");
        expect(sent.name).toBe("a.txt");
    });

    it("sends FormData and URLSearchParams as they are", async () => {
        const page = await send(
            `$post('/a', (() => { const f = new FormData(); f.append('k', 'v'); return f })()); $post('/b', new URLSearchParams('x=1&x=2'))`,
        );
        expect(page.requests[0].body).toEqual([["k", "v"]]);
        expect(page.requests[1].body).toBe("x=1&x=2");
    });

    it("puts FormData in the query of a GET, leaving out files", async () => {
        const page = await send(
            `$get('/x', (() => { const f = new FormData(); f.append('q', 'a'); f.append('doc', new File(['x'], 'x.txt')); return f })())`,
        );
        expect(page.requests[0].url).toBe("http://localhost/x?q=a");
    });

    it("takes a URL object", async () => {
        const page = await send(`$get(new URL('/x?a=1', location.href), { b: 2 })`);
        expect(page.requests[0].url).toBe("http://localhost/x?a=1&b=2");
    });

    it("tells FormData writes with different fields apart", async () => {
        let answers = [];
        const page = await mount(
            `<div nm-scope>
                <button id="a" nm-on-click="const f = new FormData(); f.append('v', '1'); $post('/save', f)"></button>
                <button id="b" nm-on-click="const f = new FormData(); f.append('v', '2'); $post('/save', f)"></button>
            </div>`,
            { server: () => new Promise((resolve) => answers.push(resolve)) },
        );
        page.$("#a").click();
        page.$("#b").click();
        page.$("#a").click();
        expect(page.requests.map((r) => r.body)).toEqual([[["v", "1"]], [["v", "2"]]]);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });
});

describe("$fetching", () => {
    it("is true while a request is out, and can be bound", async () => {
        let answer;
        const page = await mount(
            `<div nm-scope>
                <button id="b" nm-on-click="$get('/x')"></button>
                <span id="s" nm-bind-hidden="!$fetching"></span>
            </div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        expect(page.$("#s").hidden).toBe(true);
        page.$("#b").click();
        expect(page.$("#s").hidden).toBe(false);
        answer("");
        await page.settle();
        expect(page.$("#s").hidden).toBe(true);
    });
});

describe("what a request sends, after review", () => {
    it("sends files inside an object as FormData, a FileList as its files", async () => {
        const page = await mount(`<div id="d" nm-scope></div>`, { server: () => "" });
        const window = page.window;
        const a = new window.File(["1"], "a.txt");
        const b = new window.File(["2"], "b.txt");
        page.$("#d").nmProxy.$post("/up", { title: "x", doc: a, docs: [b] });
        await page.settle();
        expect(page.requests[0].body.map(([k, v]) => [k, typeof v === "string" ? v : v.name])).toEqual([
            ["title", "x"],
            ["doc", "a.txt"],
            ["docs", "b.txt"],
        ]);
    });

    it("warns about an object value that is not a file, and leaves it out", async () => {
        const page = await send(`$get('/x', { a: 1, nested: { b: 2 } })`);
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
        expect(page.warnings).toHaveLength(1);
    });

    it("sends the form an element is in when the element is passed", async () => {
        const page = await mount(
            `<form nm-scope><input name="q" value="hi"><button id="b" type="button" nm-on-click="$post('/x', this)"></button></form>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].body).toEqual([["q", "hi"]]);
    });

    it("logs an element that is in no form, and sends nothing", async () => {
        const page = await send(`$post('/x', this)`);
        expect(page.requests).toHaveLength(0);
        expect(page.errors).toHaveLength(1);
    });

    it("sends the submitter of a submit event it is passed", async () => {
        const page = await mount(
            `<form id="f" nm-scope nm-on-submit.prevent="$post('/x', e)">
                <input name="q" value="hi">
                <button id="del" name="action" value="delete">Delete</button>
            </form>`,
            { server: () => "" },
        );
        const event = new page.window.SubmitEvent("submit", { cancelable: true, submitter: page.$("#del") });
        page.$("#f").dispatchEvent(event);
        await page.settle();
        expect(page.requests[0].body).toEqual([["q", "hi"], ["action", "delete"]]);
    });

    it("tells apart two files of the same name and size", async () => {
        const answers = [];
        const page = await mount(`<div id="d" nm-scope></div>`, {
            server: () => new Promise((resolve) => answers.push(resolve)),
        });
        const scope = page.$("#d").nmProxy;
        scope.$post("/up", { doc: new page.window.File(["1"], "photo.jpg") });
        scope.$post("/up", { doc: new page.window.File(["2"], "photo.jpg") });
        expect(page.requests).toHaveLength(2);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });
});
