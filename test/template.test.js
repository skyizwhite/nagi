import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("n-use", () => {
    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("fills the element with the template, its children going in the slot", async () => {
        const page = await mount(`
            <template id="card"><article><h2>Title</h2><slot></slot></article></template>
            <div id="u" n-use="card"><p>body</p></div>
        `);
        expect(page.$("#u").innerHTML).toBe("<article><h2>Title</h2><p>body</p></article>");
    });

    it("binds what the template brings in", async () => {
        const page = await mount(`
            <template id="t"><span id="s" n-bind-textcontent="n"></span></template>
            <div n-scope="{ n: 4 }"><div n-use="t"></div></div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("4");
    });

    it("logs when the template does not exist", async () => {
        const page = await mount(`<div n-use="missing"></div>`);
        expect(page.errors).toHaveLength(1);
    });

    it("keeps the template of an n-use target around the new children", async () => {
        const page = await mount(
            `<template id="frame"><div class="frame"><slot></slot></div></template>
            <div n-scope="{ n: 3 }">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" n-use="frame"><p>old</p></div>
            </div>`,
            { server: () => `<div id="target" n-swap="inner"><p id="p" n-bind-textcontent="n">new</p></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").innerHTML).toBe(`<div class="frame"><p id="p" n-bind-textcontent="n">3</p></div>`);
    });
});
