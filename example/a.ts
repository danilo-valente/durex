import { assert } from "https://deno.land/std@0.206.0/assert/assert.ts";
import { basename } from "https://deno.land/std@0.206.0/path/basename.ts";
import { OnSetup, OnSignal } from "../lib/worker/activity.ts";
import { log } from "../lib/log.ts";

/*
int add(int x, int n) {
  while (--n >= 0) {
    x++;
  }

  return x;
}
 */
const response = await fetch(import.meta.resolve("./add.wasm"));
const wasmInstance = await WebAssembly.instantiateStreaming(response);
const wasmAdd = wasmInstance.instance.exports.add as (
  x: number,
  n: number,
) => number;

export default (x: number) => {
  assert(x >= 0, "x must be positive");
  return wasmAdd(x, 1000000);
};

export const onSetup: OnSetup = () => {
  log(`[${basename(import.meta.url)}] Received setup data: ${data}`);
};

export const onSignal: OnSignal = (signal) => {
  log(`[${basename(import.meta.url)}] Received signal: ${signal}`);
};
