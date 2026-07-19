import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("https://api.example.test/users/:id", ({ params }) => {
    if (params.id === "missing") {
      return HttpResponse.json(null, { status: 404 });
    }

    return HttpResponse.json({ id: params.id, name: "Ada" });
  }),
];
