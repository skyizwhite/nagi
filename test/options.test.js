import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mountWaiting = (html) => {
    const answers = [];
    return mount(html, { server: () => new Promise((resolve) => answers.push(resolve)) }).then((page) => ({ page, answers }));
};

describe("dedupe", () => {
    it("sends the same write again when it is false", async () => {
        const { page, answers } = await mountWaiting(
            `<div nm-scope><button id="b" nm-on-click="$post('/cart/add', { id: 1 }, { dedupe: false })"></button></div>`,
        );
        page.$("#b").click();
        page.$("#b").click();
        expect(page.requests).toHaveLength(2);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("takes options as the fourth argument of $fetch", async () => {
        const { page, answers } = await mountWaiting(
            `<div nm-scope><button id="b" nm-on-click="$fetch('/x', 'PUT', { a: 1 }, { dedupe: false })"></button></div>`,
        );
        page.$("#b").click();
        page.$("#b").click();
        expect(page.requests).toHaveLength(2);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });
});

describe("timeout", () => {
    it("aborts a request that takes too long, sends fetcherr, and lets the write be sent again", async () => {
        const { page, answers } = await mountWaiting(
            `<div nm-scope="{ _errs: [] }" nm-on-fetcherr="_errs = [..._errs, e.detail.err.name]">
                <button id="b" nm-on-click="$post('/order', { a: 1 }, { timeout: 20 })"></button>
            </div>`,
        );
        page.$("#b").click();
        await later(50);
        const scope = page.scope("#b");
        expect(scope._errs).toEqual(["TimeoutError"]);
        expect(scope.$fetching).toBe(false);
        page.$("#b").click();
        expect(page.requests).toHaveLength(2);
        answers[1]("");
        await page.settle();
    });

    it("leaves a request that answers in time alone", async () => {
        const page = await mount(
            `<div nm-scope="{ _err: null }" nm-on-fetcherr="_err = e.detail"><button id="b" nm-on-click="$get('/x', null, { timeout: 1000 })"></button></div>
            <div id="target">old</div>`,
            { server: () => `<div id="target">new</div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").textContent).toBe("new");
        expect(page.scope("#b")._err).toBeNull();
    });
});

describe("$abort", () => {
    it("aborts every request of the scope, reads and writes, with no fetcherr", async () => {
        const { page, answers } = await mountWaiting(
            `<div nm-scope="{ _err: null }" nm-on-fetcherr="_err = e.detail">
                <button id="r" nm-on-click="$get('/read')"></button>
                <button id="w" nm-on-click="$post('/write')"></button>
                <button id="stop" nm-on-click="$abort()"></button>
            </div>
            <div id="target">old</div>`,
        );
        page.$("#r").click();
        page.$("#w").click();
        page.$("#stop").click();
        await later(10);
        const scope = page.scope("#r");
        expect(scope.$fetching).toBe(false);
        expect(scope._err).toBeNull();
        page.$("#w").click();
        expect(page.requests).toHaveLength(3);
        answers.forEach((answer) => answer(`<div id="target">late</div>`));
        await page.settle();
    });
});

describe("elements outside any scope", () => {
    it("share one state for requests", async () => {
        const { page, answers } = await mountWaiting(`
            <button id="a" nm-on-click="$post('/order')"></button>
            <button id="b" nm-on-click="$post('/order')"></button>
        `);
        page.$("#a").click();
        page.$("#b").click();
        expect(page.requests).toHaveLength(1);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });
});
