/// <reference lib="webworker" />

import { main } from '../lib/worker.ts';

main(import.meta, (x: number) => `x = ${x}`);
