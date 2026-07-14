import { rest } from "msw";

export const handlers = [
  rest.get("https://api.example.test/users/:id", (req, res, ctx) => {
    if (req.params.id === "missing") {
      return res(ctx.status(404));
    }

    return res(
      ctx.status(200),
      ctx.json({ id: req.params.id, name: "Ada" }),
    );
  }),
];
