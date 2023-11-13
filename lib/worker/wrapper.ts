import { assert } from "https://deno.land/std@0.206.0/assert/mod.ts";

import * as Activity from "./activity.ts";
import { main, onSetup, onSignal } from "./handlers.ts";

const url = new URL(import.meta.url);
const workerPath = url.searchParams.get("worker");
assert(workerPath, "worker is required");

const worker: Activity.Worker = await import(workerPath);

main(import.meta.url, (data) => worker.default(data));

if (worker.onSignal) {
  onSignal(worker.onSignal);
}

if (worker.onSetup) {
  onSetup(worker.onSetup);
}

Durex.init();
