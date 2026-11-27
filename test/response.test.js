import { describe, expect, it, vi } from "vitest";
import { mount } from "./helpers.js";
import { later } from "./support.js";

describe("swapping answers", () => {
    const swap = async (answer, html = `<div id="target" class="t"><span>old</span></div>`) => {
        const page = await mount(button(`$get('/x')`) .replace(`<div id="target">old</div>`, html), {
            server: () => answer,
        });
        page.$("#b").click();
        await page.settle();
        return page;
    };

    const button = (call, scope = "{}") => `
        <div id="d" n-scope="${scope}"><button id="b" n-on-click="${call}"></button></div>
        <div id="target">old</div>
    `;

    it("swaps an answer streamed in pieces as one", async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(`<div id="target">`));
                controller.enqueue(encoder.encode(`new</div>`));
                controller.close();
            },
        });
        const page = await swap(new Response(body));
        expect(page.$("#target").textContent).toBe("new");
    });

    it("swaps an answer whose pieces come far apart as one", async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            async start(controller) {
                controller.enqueue(encoder.encode(`<div id="target"><p>a`));
                await later(50);
                controller.enqueue(encoder.encode(`b</p></div>`));
                controller.close();
            },
        });
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/x')"></button></div>
            <div id="target">old</div>`,
            { server: () => new Response(body) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").innerHTML).toBe("<p>ab</p>");
        expect(page.warnings).toEqual([]);
    });

    it("takes an answer with no body as nothing to swap", async () => {
        const page = await mount(
            `<div n-scope="{ _err: null }" n-on-fetcherr="_err = e.detail.err">
                <button id="b" n-on-click="$get('/x')"></button>
            </div>
            <div id="target">old</div>`,
            { server: () => ({ status: 204 }) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._err).toBeNull();
        expect(page.$("#target").textContent).toBe("old");
        expect(page.scope("#b").$fetching).toBe(false);
    });
});

describe("aborted requests", () => {
    it("sends no fetcherr for a request it aborted, and stays fetching for the newer one", async () => {
        const answers = [];
        const page = await mount(
            `<div n-scope="{ _errs: [] }" n-on-fetcherr="_errs = [..._errs, e.detail.err]">
                <button id="b" n-on-click="$get('/x')"></button>
            </div>`,
            { server: () => new Promise((resolve) => answers.push(resolve)) },
        );
        page.$("#b").click();
        page.$("#b").click();
        await later(10);
        const scope = page.scope("#b");
        expect(scope._errs).toEqual([]);
        expect(scope.$fetching).toBe(true);

        answers[1]("");
        await page.settle();
        expect(scope.$fetching).toBe(false);
    });

    it("swaps the newer answer when it aborts a request whose body is being read", async () => {
        let reading;
        const read = new Promise((resolve) => (reading = resolve));
        const slow = new ReadableStream({ pull: () => reading() }, { highWaterMark: 0 });
        const answers = [new Response(slow), `<div id="target">second</div>`];
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/x')"></button></div>
            <div id="target">old</div>`,
            { server: () => answers.shift() },
        );
        page.$("#b").click();
        await read;
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").textContent).toBe("second");
    });

    it("swaps nothing from a request aborted while its body is arriving", async () => {
        const encoder = new TextEncoder();
        let send;
        const first = new ReadableStream({ start: (controller) => (send = controller) });
        const answers = [new Response(first), `<div id="other">second</div>`];
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/x')"></button></div>
            <div id="target">old</div><div id="other">old</div>`,
            { server: () => answers.shift() },
        );
        page.$("#b").click();
        await later(5);
        send.enqueue(encoder.encode(`<div id="target">first</div>`));
        await later(5);
        page.$("#b").click();
        await page.settle();
        await later(40);
        expect(page.$("#other").textContent).toBe("second");
        expect(page.$("#target").textContent).toBe("old");
    });

    it("aborts the request of a scope a swap removes", async () => {
        const signals = [];
        let answerInner;
        const page = await mount(
            `<div n-scope="{}"><button id="outer" n-on-click="$get('/outer')"></button></div>
            <div id="target" n-scope="{}">
                <button id="inner" n-on-click="$get('/inner')"></button>
            </div>
            <div id="late">old</div>`,
            {
                server: ({ url }) =>
                    url.endsWith("/inner")
                        ? new Promise((resolve) => (answerInner = resolve))
                        : `<div id="target"></div>`,
            },
        );
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#inner").click();
        page.$("#outer").click();
        await later(20);
        expect(signals[0].aborted).toBe(true);
        answerInner(`<div id="late">late</div>`);
        await page.settle();
        expect(page.$("#late").textContent).toBe("old");
    });

    it("aborts the read of an element inside a scope that a swap removes", async () => {
        let answerSlow;
        const page = await mount(
            `<div n-scope>
                <div id="list"><button id="slow" n-on-click="$get('/slow')"></button></div>
            </div>
            <div n-scope><button id="swap" n-on-click="$get('/swap')"></button></div>
            <div id="late">old</div>`,
            {
                server: ({ url }) =>
                    url.endsWith("/slow") ? new Promise((resolve) => (answerSlow = resolve)) : `<div id="list"></div>`,
            },
        );
        page.$("#slow").click();
        page.$("#swap").click();
        await later(20);
        answerSlow(`<div id="late">late</div>`);
        await page.settle();
        expect(page.$("#late").textContent).toBe("old");
    });

    it("aborts the read of an element outside any scope that a swap removes", async () => {
        let answerSlow;
        const page = await mount(
            `<div id="list"><button id="slow" n-on-click="$get('/slow')"></button></div>
            <button id="swap" n-on-click="$get('/swap')"></button>
            <div id="late">old</div>`,
            {
                server: ({ url }) =>
                    url.endsWith("/slow") ? new Promise((resolve) => (answerSlow = resolve)) : `<div id="list"></div>`,
            },
        );
        page.$("#slow").click();
        page.$("#swap").click();
        await later(20);
        answerSlow(`<div id="late">late</div>`);
        await page.settle();
        expect(page.$("#late").textContent).toBe("old");
    });
});

describe("errors", () => {
    const mountAsking = (answer, extra = "") =>
        mount(
            `<div n-scope="{ _err: null, _redirect: null }" n-on-fetcherr="_err = e.detail" n-on-fetchredirect="_redirect = e.detail.url">
                <button id="b" n-on-click="$post('/x')"></button>
                ${extra}
            </div>
            <div id="target">old</div>`,
            { server: () => answer },
        );

    it("dispatches fetcherr with the status and text for an error answer with nothing to swap", async () => {
        const page = await mount(
            `<div n-scope="{ _err: null }" n-on-fetcherr="_err = e.detail">
                <button id="b" n-on-click="$get('/x', { q: 1 })"></button>
            </div>
            <div id="target">old</div>`,
            { server: () => ({ status: 500, body: "Server broke" }) },
        );
        page.$("#b").click();
        await page.settle();

        const err = page.scope("#b")._err;
        expect([err.url, err.status, err.text]).toEqual(["/x?q=1", 500, "Server broke"]);
        expect(page.$("#target").textContent).toBe("old");
        expect(page.warnings).toEqual([]);
    });

    it("dispatches fetcherr when the answer's body fails partway", async () => {
        const page = await mount(
            `<div n-scope="{ _err: null }" n-on-fetcherr="_err = e.detail.err">
                <button id="b" n-on-click="$get('/x')"></button>
            </div>`,
            { server: () => new Response(new ReadableStream({ start: (c) => c.error(new Error("cut")) })) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._err.message).toBe("cut");
    });

    it("swaps an error answer aimed at the page, and still sends fetcherr, marked swapped", async () => {
        const page = await mountAsking({ status: 422, body: `<div id="target">fix the title</div>` });
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").textContent).toBe("fix the title");
        const err = page.scope("#b")._err;
        expect([err.status, err.swapped]).toEqual([422, true]);
    });

    it("sends fetcherr with the error when the request cannot be made", async () => {
        const page = await mountAsking(Promise.reject(new TypeError("offline")));
        page.$("#b").click();
        await page.settle();
        const err = page.scope("#b")._err;
        expect(err.err.message).toBe("offline");
        expect(err.status).toBeUndefined();
    });

    it("does not swap an error page whose ids are not on the page, and sends fetcherr", async () => {
        const page = await mountAsking({ status: 500, body: `<div id="summary">Traceback</div>` });
        page.$("#b").click();
        await page.settle();
        expect([page.scope("#b")._err.status, page.scope("#b")._err.swapped]).toEqual([500, false]);
        expect(page.warnings).toEqual([]);
    });

    it("sends fetcherr for a URL that cannot be fetched", async () => {
        const page = await mount(
            `<div n-scope="{ _err: null }" n-on-fetcherr="_err = e.detail">
                <button id="b" n-on-click="$get('http://[bad', { a: 1 })"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._err.url).toBe("http://[bad?a=1");
        expect(page.errors).toEqual([]);
    });

    it("sends fetcherr for a read whose error answer swaps out the scope that asked", async () => {
        const page = await mount(
            `<div id="w" n-scope><button id="b" n-on-click="$get('/x')"></button></div>`,
            { server: () => ({ status: 500, body: `<div id="w">failed</div>` }) },
        );
        const got = [];
        page.window.addEventListener("fetcherr", (e) => got.push(e.detail.status));
        page.$("#b").click();
        await page.settle();
        expect(page.$("#w").textContent).toBe("failed");
        expect(got).toEqual([500]);
    });

    it("sends fetcherr to document when the element that asked is gone", async () => {
        let answer;
        const page = await mount(
            `<div n-scope="{}"><button id="outer" n-on-click="$get('/outer')"></button></div>
            <div id="target" n-scope="{}"><button id="order" n-on-click="$post('/order')"></button></div>`,
            {
                server: ({ url }) =>
                    url.endsWith("/order") ? new Promise((resolve) => (answer = resolve)) : `<div id="target"></div>`,
            },
        );
        const errs = [];
        page.document.addEventListener("fetcherr", (e) => errs.push(e.detail.url));
        page.$("#order").click();
        page.$("#outer").click();
        await later(10);
        answer({ status: 500, body: "no" });
        await page.settle();
        expect(errs).toEqual(["/order"]);
    });
});

describe("headers", () => {
    const mountAsking = (answer, extra = "") =>
        mount(
            `<div n-scope="{ _err: null, _redirect: null }" n-on-fetcherr="_err = e.detail" n-on-fetchredirect="_redirect = e.detail.url">
                <button id="b" n-on-click="$post('/x')"></button>
                ${extra}
            </div>
            <div id="target">old</div>`,
            { server: () => answer },
        );

    it("goes to the URL of n-redirect without swapping, after a fetchredirect event", async () => {
        const page = await mountAsking({ body: `<div id="target">new</div>`, headers: { "n-redirect": "/done" } });
        const assign = vi.spyOn(page.window.location, "assign").mockImplementation(() => {});
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._redirect).toBe("/done");
        expect(assign).toHaveBeenCalledWith("/done");
        expect(page.$("#target").textContent).toBe("old");
    });

    it("does not go when fetchredirect is cancelled", async () => {
        const page = await mount(
            `<div n-scope n-on-fetchredirect="e.preventDefault()"><button id="b" n-on-click="$post('/x')"></button></div>`,
            { server: () => ({ headers: { "n-redirect": "/done" } }) },
        );
        const assign = vi.spyOn(page.window.location, "assign").mockImplementation(() => {});
        page.$("#b").click();
        await page.settle();
        expect(assign).not.toHaveBeenCalled();
    });

    it("replaces the page's URL with n-replace-url after swapping", async () => {
        const page = await mountAsking({ body: `<div id="target">new</div>`, headers: { "n-replace-url": "/list?page=2" } });
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").textContent).toBe("new");
        expect(page.window.location.href).toBe("http://localhost/list?page=2");
    });

    it("warns about an n-replace-url it cannot use, and still counts the answer as done", async () => {
        const page = await mountAsking({ body: `<div id="target">new</div>`, headers: { "n-replace-url": "https://other.example/x" } });
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").textContent).toBe("new");
        expect(page.scope("#b")._err).toBeNull();
        expect(page.warnings).toHaveLength(1);
    });

    it("has replaced the URL by the time the swapped content inits", async () => {
        const page = await mountAsking({
            body: `<div id="target" n-let-path="location.pathname"><span id="p" n-bind-textcontent="path"></span></div>`,
            headers: { "n-replace-url": "/list" },
        });
        page.$("#b").click();
        await page.settle();
        expect(page.$("#p").textContent).toBe("/list");
    });
});
