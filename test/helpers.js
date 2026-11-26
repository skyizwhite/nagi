import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { afterEach } from "vitest";

const source = readFileSync(new URL("../nomini.js", import.meta.url), "utf8");

const windows = new Set();

afterEach(async () => {
    for (const window of windows) await window.happyDOM.close();
    windows.clear();
});

const respond = (answer) => {
    if (answer instanceof Response) return answer;
    if (typeof answer === "string") answer = { body: answer };
    const { body = "", status = 200, headers = {} } = answer ?? {};
    return new Response(body, { status, headers });
};

/**
 * Loads nomini into a fresh window holding `html`, and runs its init.
 *
 * `server(request)` answers each fetch nomini makes. `request` has the
 * `url`, `method`, `headers` and `body` (as a string) that were sent, and
 * the answer is a string, a `{ body, status, headers }` object or a
 * `Response`, or a promise of one.
 */
export const mount = async (html, { server } = {}) => {
    const window = new Window({ url: "http://localhost/" });
    windows.add(window);

    const requests = [];
    window.TextDecoderStream = TextDecoderStream;
    window.fetch = async (url, opts = {}) => {
        const request = {
            url: new URL(url, window.location.href).href,
            method: opts.method ?? "GET",
            headers: { ...opts.headers },
            body: opts.body === undefined ? undefined : String(opts.body),
        };
        requests.push(request);
        if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        if (!server) throw new Error(`No server for ${request.method} ${request.url}`);
        return respond(await server(request));
    };

    const errors = [];
    const warnings = [];
    window.console.error = (...args) => errors.push(args);
    window.console.warn = (...args) => warnings.push(args);

    const { document } = window;
    document.body.innerHTML = html;
    window.eval(source);
    document.dispatchEvent(new window.Event("DOMContentLoaded"));

    const $ = (selector) => document.querySelector(selector);

    return {
        window,
        document,
        $,
        requests,
        errors,
        warnings,
        /** The reactive scope of the nearest `nm-data` around `selector`. */
        scope: (selector) => $(selector).closest("[nm-data]").nmProxy,
        /** Waits for timers, pending fetches and the swaps they make. */
        settle: () => settle(window),
    };
};

const settle = async (window) => {
    // A fetch answer is read outside the window's timers before nomini sets
    // the timer that swaps it, so give the read a moment on each round.
    for (let round = 0; round < 3; round++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await window.happyDOM.waitUntilComplete();
    }
};
