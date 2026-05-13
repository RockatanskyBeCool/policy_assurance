import { describe, expect, it } from "vitest";
import { parseModelJson } from "../src/extraction/json-repair-service.js";

describe("parseModelJson", () => {
  it("parses raw JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("repairs markdown fenced JSON with trailing comma", () => {
    expect(parseModelJson('```json\n{"a":1,}\n```')).toEqual({ a: 1 });
  });
});
