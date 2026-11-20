import assert from "node:assert/strict";
import { test } from "node:test";
import { addUploads, createUserCase, runSessionCase } from "../src/lib/cases";
import { spanish } from "../src/lib/es";

// Phase 4: a real household's own case, in the app's household voice, in Spanish.
delete process.env.ANTHROPIC_API_KEY;

test("a household's case speaks to the household, and its packets say who approved them", async () => {
  const id = createUserCase({ consent: true, address: "4810 Lyons Ave, Houston, TX 77020", language: "es" });
  await addUploads(id, [new File([new Uint8Array(20)], "foto.jpg", { type: "image/jpeg" })],
    "El huracán nos pegó el 9 de octubre y se llevó parte del techo. Somos dueños de la casa. Perdimos toda la comida, sin luz 4 días. FEMA nos negó la ayuda y tengo la carta.");
  const s = await runSessionCase(id);
  const food = s.packets.find((p) => p.programId === "food-assistance")!;
  assert.match(food.bilingualCover.en, /on behalf of the household at 4810 Lyons Ave/);
  assert.match(food.bilingualCover.en, /approved by the household before sending/);
  assert.match(food.bilingualCover.es, /aprobado por la familia/);
  assert(s.plan.some((t) => t.title === "Ask 2-1-1 Texas to connect you with a food pantry near you."));
  assert.match(s.followUp!.why, /You mentioned you have it/);
  const shown = [...s.warnings, ...s.plan.flatMap((t) => [t.title, t.detail]), s.followUp!.why, ...s.matches.flatMap((m) => m.reasons.filter((r) => !r.startsWith("Deadline")))];
  assert.deepEqual(shown.filter((x) => spanish(x) === undefined), []);
});
