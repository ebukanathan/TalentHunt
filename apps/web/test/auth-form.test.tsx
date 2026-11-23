import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "../src/components/admin/auth-form";

test("server-rendered sign-in cannot submit credentials through a native GET before hydration", () => {
  const html = renderToStaticMarkup(<LoginForm />);
  assert.match(html, /<form[^>]*method="post"/);
  for (const id of ["email", "password"]) assert.match(html, new RegExp(`<input(?=[^>]*id="${id}")(?=[^>]*disabled="")[^>]*>`));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Sign in<\/button>/);
  assert.match(html, /JavaScript is required to sign in/);
});
