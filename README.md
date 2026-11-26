# Nagi (凪)

Nagi is a small library for reactive HTML and partial page updates. It is a fork of [Nomini](https://github.com/nonnorm/nomini) by nonnorm, reworked so that every binding is an attribute of its own and easy to write from a template engine.

Nagi lets you:
- Add lightweight reactive state directly in your HTML
- Bind DOM properties and classes with automatic dependency tracking
- Listen to any event with inline handlers
- Make requests and swap their answers into any part of the page
- Keep everything declarative and local

## Why Nagi?
- Write plain JavaScript, no special DSLs to learn
- One attribute per binding, so templates can add, leave out or pass along each one
- Event handlers with modifiers and access to reactive variables
- Requests send exactly what you give them

## What Nagi is *not*
Nagi is deliberately minimal. It **does not** try to be:
- A template language
- A performant virtual DOM
- A full-featured set of helpers for every use case
- A global state management system

Nagi stays small by keeping the mental model simple: **Boring HTML + islands of reactivity + server-driven pages**

## Development

Tools are managed with [mise](https://mise.jdx.dev).

```sh
mise install
npm install
npm test        # or `mise run test`
```

`scripts/build.sh` writes `dist/nagi.min.js` and `dist/nagi.core.min.js`, and `scripts/devour.sh` builds a copy without the blocks you name.

## License

MIT. Nagi keeps the copyright of Nomini, its origin; see [LICENSE](./LICENSE).
