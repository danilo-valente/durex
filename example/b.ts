/// <reference lib="webworker" />

import { main } from "../lib/worker.ts";

main(import.meta, (x: number) => {
  for (let i = 0; i < 1000000; i++);

  return x * 2;
});
