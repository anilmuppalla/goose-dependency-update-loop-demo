import { rest } from "msw";

export const handlers = [
  rest.get("https://api.example.test/users/:id", (req, res, ctx) =>
    res(
      ctx.status(200),
      ctx.json({ id: req.params.id, name: "Ada" }),
    ),
  ),
];
