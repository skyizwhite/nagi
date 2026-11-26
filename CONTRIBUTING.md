# Contributing Guidelines
First off, thank you for taking the time to contribute to Nomini! Contributions are always appreciated, and they can range from spelling and grammar fixes to whole new features, or even just bug reporting.

All in all, this is a pretty small project, with loosely defined contributing guidelines. If you're editing the source of Nomini, that can be found in `nomini.js`. Otherwise, the website is in `www/`.

## Tests
Tools are managed with [mise](https://mise.jdx.dev). To run the tests:

```sh
mise install
npm install
npm test        # or `mise run test`
```

Each test loads `nomini.js` into a fresh [happy-dom](https://github.com/capricorn86/happy-dom) window through `mount()` in `test/helpers.js`, which also stands in for the server that `$get`/`$post` talk to. A bug that is still open is kept in `test/known-bugs.test.js` as an `it.fails` test, so that fixing it makes the suite say so.

If you're proposing a major feature, please do it in Issues before opening a PR. This will give us time to review and consider it before any code needs to be written.

## AI Policy
I have nothing against the use of Large Language Models (ChatGPT, Claude, Gemini, Qwen, etc.) to assist in open-source projects. However, there are some guidelines that I expect everyone (including maintainers) to abide by:
1. **Fully understand what the AI generates**
2. **Be able to defend your choices, even if they were AI assisted**
3. **Review AI code critically to ensure it meets project standards**

TL;DR: AI is permitted for use in the writing of code and docs. Just please keep in mind that the term *AI slop* was coined for a reason.
