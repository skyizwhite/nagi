import { readFileSync } from "node:fs";
import { Window } from "happy-dom";

const source = readFileSync(new URL("../nomini.js", import.meta.url), "utf8");

const windows = new Set();

/** Closes every window `mount` opened. `test/setup.js` runs it after each test. */
export const closeWindows = async () => {
    for (const window of windows) await window.happyDOM.close();
    windows.clear();
};

const respond = (answer) => {
    if (answer instanceof Response) return answer;
    if (typeof answer === "string") answer = { body: answer };
    const { body = "", status = 200, headers = {} } = answer ?? {};
    return new Response(body, { status, headers });
};

const abortError = () => new DOMException("The operation was aborted.", "AbortError");

/**
 * Hands out `response` with a body that settles `done` once its reader has
 * read it to the end or given up on it, and that errors with an AbortError,
 * as a browser's does, if `signal` aborts before then.
 */
const trackBody = (response, signal, done) => {
    if (!response.body) {
        done();
        return response;
    }
    const reader = response.body.getReader();
    let abort;
    const body = new ReadableStream({
        start(controller) {
            abort = () => {
                controller.error(abortError());
                reader.cancel().catch(() => {});
                done();
            };
            signal?.addEventListener("abort", abort, { once: true });
        },
        async pull(controller) {
            const { done: ended, value } = await reader.read();
            if (signal?.aborted) return;
            if (ended) {
                signal?.removeEventListener("abort", abort);
                controller.close();
                done();
            } else controller.enqueue(value);
        },
        cancel(reason) {
            signal?.removeEventListener("abort", abort);
            done();
            return reader.cancel(reason);
        },
    });
    return new Response(body, response);
};

/**
 * Loads nomini into a fresh window holding `html`, and runs its init.
 *
 * `server(request)` answers each fetch nomini makes. `request` has the
 * `url`, `method`, `headers` and `body` (as a string) that were sent, and
 * the answer is a string, a `{ body, status, headers }` object or a
 * `Response`, or a promise of one. Aborting a request rejects its fetch, or
 * errors its body if it has been answered, with an AbortError.
 *
 * `beforeInit(window)` runs after the HTML is in place and before nomini is
 * loaded, to set up what nomini should find when it starts.
 */
export const mount = async (html, { server, beforeInit } = {}) => {
    const window = new Window({ url: "http://localhost/" });
    windows.add(window);

    const requests = [];
    const pending = new Set();

    window.TextDecoderStream = TextDecoderStream;
    window.fetch = (url, opts = {}) => {
        const request = {
            url: new URL(url, window.location.href).href,
            method: opts.method ?? "GET",
            headers: Object.fromEntries(new Headers(opts.headers)),
            body: opts.body === undefined ? undefined : String(opts.body),
        };
        requests.push(request);

        let done;
        const work = new Promise((resolve) => (done = resolve));
        pending.add(work);
        work.then(() => pending.delete(work));

        const { signal } = opts;
        return new Promise((resolve, reject) => {
            const abort = () => {
                done();
                reject(abortError());
            };
            if (signal?.aborted) return abort();
            signal?.addEventListener("abort", abort, { once: true });

            new Promise((answered) => {
                if (!server) throw new Error(`No server for ${request.method} ${request.url}`);
                answered(server(request));
            })
                .then((answer) => {
                    if (signal?.aborted) return;
                    signal?.removeEventListener("abort", abort);
                    resolve(trackBody(respond(answer), signal, done));
                })
                .catch((err) => {
                    done();
                    reject(err);
                });
        });
    };

    const errors = [];
    const warnings = [];
    window.console.error = (...args) => errors.push(args);
    window.console.warn = (...args) => warnings.push(args);

    const { document } = window;
    document.body.innerHTML = html;
    beforeInit?.(window);
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
        /**
         * Waits until every fetch has been answered and its body read, and
         * the window's timers (nomini's swap timer, debounces) have run.
         * Hangs if a server answer never comes, so answer before settling.
         */
        settle: () => settle(window, pending),
    };
};

const settle = async (window, pending) => {
    do {
        await Promise.all(pending);
        // Let the reader handle the end of the body before looking for the
        // timers it sets.
        await new Promise((resolve) => setTimeout(resolve));
        await window.happyDOM.waitUntilComplete();
    } while (pending.size > 0);
};
