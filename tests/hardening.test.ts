import assert from "node:assert/strict";
import { test } from "node:test";
import { addUploads, createUserCase, MAX_CLAUDE_READS, parseTyped, runSessionCase } from "../src/lib/cases";
import { runRequested } from "../src/lib/runRequest";
import { getCase } from "../src/lib/store";
import { isTypedKind } from "../src/lib/typedKinds";

// A key is set, but nothing here may reach the network: each path below has to
// decide not to call Claude before it gets that far.
process.env.ANTHROPIC_API_KEY = "sk-test-not-used";

test("an anonymous HTTP run of the shared demo case never calls Claude", async () => {
  const s = await runRequested({});
  assert.equal(s.extraction.claude, 0);
  assert.equal(s.extraction.fellBack, 0);
  assert.equal(s.extraction.mode, "rules");
});

test("a case that used its Claude reads falls back to rules without calling the API", async () => {
  const id = createUserCase({ address: "512 Willow Creek Dr, Houston, TX 77016", consent: true });
  await addUploads(id, [], "The storm ripped shingles off our roof on October 9, 2026. Rain came into the kitchen.");
  getCase(id)!.claudeReads = MAX_CLAUDE_READS;
  const s = await runSessionCase(id);
  assert.equal(s.extraction.claude, 0);
  assert(s.events.some((e) => e.action === "Fell back to rules" && /used up its Claude reads/.test(e.detail)));
  assert(s.needs.some((n) => n.key === "roof_damage"));
});

test("object prototype names are not document kinds", () => {
  assert.equal(isTypedKind("toString"), false);
  assert.equal(isTypedKind("constructor"), false);
  assert.throws(() => parseTyped([{ kind: "toString", text: "a long enough text" }]), /what kind of document/);
});
