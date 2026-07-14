# Frozen MSW 1.x to 2.x migration context

Source: [official MSW 1.x to 2.x migration guide](https://mswjs.io/docs/migrations/1.x-to-2.x)

This short, paraphrased note is the frozen migration context supplied to the
bounded repair run. The run must not fetch or substitute live migration
content while model credentials are present.

For the handler in this repository:

- Replace the `rest` handler namespace with `http`.
- A resolver no longer receives separate `req`, `res`, and `ctx` arguments. It
  receives one information object; path parameters are available from its
  `params` property.
- Replace response composition such as `res(ctx.json(body))` with
  `HttpResponse.json(body)`.
- Put the HTTP status in the response initializer. JSON responses can pass
  `{ status: number }` as the second argument to `HttpResponse.json`; an empty
  response can use `new HttpResponse(null, { status: number })`.

These are the only migration facts needed for `test/handlers.ts`. Anything
outside this context is `NEEDS_HUMAN` for this run.
