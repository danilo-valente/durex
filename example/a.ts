/// <reference lib="webworker" />

import { basename } from 'https://deno.land/std@0.206.0/path/basename.ts';
import { main, onSignal } from "../lib/worker.ts";

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

const wasmAdd = wasmInstance.instance.exports.add as (x: number, n: number) => number;

main(import.meta, (x: number) => wasmAdd(x, 1000000));

onSignal((signal) => {
  console.log(`[${basename(import.meta.url)}] Received signal: ${signal}`);
});