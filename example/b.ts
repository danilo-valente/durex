/// <reference lib="webworker" />

import { basename } from 'https://deno.land/std@0.206.0/path/basename.ts';
import { main, onSignal } from "../lib/worker.ts";

main(import.meta, (x: number) => {
  for (let i = 0; i < 1000000; i++);

  return x * 2;
});

onSignal((signal) => {
  console.log(`[${basename(import.meta.url)}] Received signal: ${signal}`);
});