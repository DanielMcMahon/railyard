import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import { archiveDirForDate, searchArchives } from "./archive";

describe("archive paths", () => {
  it("builds Archive/YYYY/MM/DD/ticketId", () => {
    const d = archiveDirForDate("abc-123", new Date("2026-07-19T12:00:00Z"));
    assert.match(d, /Archive[/\\]2026[/\\]07[/\\]19[/\\]abc-123$/);
  });
});

describe("archive search", () => {
  it("returns an array from disk index", () => {
    const empty = searchArchives({ agent: "reviewer", minCost: 2 });
    assert.ok(Array.isArray(empty));
  });
});

describe("archive dir writable", () => {
  it("can create nested archive folder", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ry-arch-"));
    const dir = path.join(root, "2026", "07", "19", "t1");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "summary.md"), "# ok", "utf8");
    assert.equal(fs.readFileSync(path.join(dir, "summary.md"), "utf8"), "# ok");
  });
});
