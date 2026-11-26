import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("builds without blocks", () => {
    it("debounces in the core build, which has no fetch block", async () => {
        const page = await mount(
            `<div nm-scope="{ got: [] }"><input id="i" nm-on-input="$debounce(() => got = [...got, this.value], 30)"></div>`,
            { without: ["template", "form", "fetch", "morph", "helpers", "events"] },
        );
        const input = page.$("#i");
        input.value = "a";
        input.dispatchEvent(new page.window.Event("input"));
        await page.settle();
        expect(page.scope("#i").got).toEqual(["a"]);
        expect(page.errors).toEqual([]);
    });

    it("keeps a timer for each handler of an element in the core build", async () => {
        const page = await mount(
            `<div nm-scope="{ got: [] }">
                <input id="i" nm-on-input="$debounce(() => got.push('input'), 20)" nm-on-ping="$debounce(() => got.push('ping'), 20)">
            </div>`,
            { without: ["template", "form", "fetch", "morph", "helpers", "events"] },
        );
        const input = page.$("#i");
        input.dispatchEvent(new page.window.Event("input"));
        input.dispatchEvent(new page.window.Event("ping"));
        await page.settle();
        expect([...page.scope("#i").got].sort()).toEqual(["input", "ping"]);
    });

    it("passes the event to a handler in a build without the events block", async () => {
        const page = await mount(
            `<div nm-scope="{ got: null }"><input id="i" nm-on-input="got = e.type"></div>`,
            { without: ["events"] },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        expect(page.scope("#i").got).toBe("input");
    });

    it("listens to a modified event by its name in a build without the events block", async () => {
        const page = await mount(
            `<div nm-scope="{ got: 0 }"><button id="b" nm-on-click.prevent="got++"></button></div>`,
            { without: ["events"] },
        );
        page.$("#b").click();
        expect(page.scope("#b").got).toBe(1);
    });

    it("warns that modifiers are not handled", async () => {
        const page = await mount(`<div nm-scope><form nm-on-submit.prevent="0"></form></div>`, { without: ["events"] });
        expect(page.warnings).toHaveLength(1);
    });
});
