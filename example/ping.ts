import InMemoryStore from "../lib/in-memory-store.ts";
import KvStore from "../lib/kv-store.ts";
import { Cluster } from "../lib/server.ts";
import { InMemoryQueueChannel, KvQueueChannel } from "../lib/signal.ts";
import { ClusterWorkflow } from "../lib/workflow.ts";

const useKv = Deno.args[1] === "kv";
const kv = useKv ? await Deno.openKv("./kv.sqlite3") : null;

const store = kv ? new KvStore(kv) : new InMemoryStore();

const cluster = Cluster({
  base: import.meta.url,
  shutdownTimeout: 1000,
});

const channel = kv
  ? new KvQueueChannel<number>(kv)
  : new InMemoryQueueChannel<number>();

try {
  await main(parseInt(Deno.args[0]));
  console.log("Exiting...");
} catch (e) {
  console.error(e);
}

async function main(count: number) {
  const workflow = new ClusterWorkflow({
    cluster,
    store,
    workflowId: "example",
    main: async (Activity, signaled: number) => {
      const started = Date.now();
      const ping = Activity<void, number>({
        script: "./pong.ts",
        timeout: 100,
        wrap: true,
      });

      const sent = Date.now();
      const received = await ping();
      const returned = Date.now();

      return [
        started - signaled,
        sent - started,
        received - sent,
        returned - received,
      ];
    },
  });

  let processed = 0;
  let completed = 0;
  let timings = [0, 0, 0, 0];
  let batchResolve: () => void;

  const promise = new Promise<typeof timings>((resolve) => {
    batchResolve = () => {
      resolve([
        Math.ceil(timings[0] / completed),
        Math.ceil(timings[1] / completed),
        Math.ceil(timings[2] / completed),
        Math.ceil(timings[3] / completed),
      ]);
    };
  });

  workflow.listen(channel, (executionId, _, err, result) => {
    if (err) {
      console.error(`[${executionId}] Error: ${err.stack}`);
    } else {
      // console.info(`[${executionId}] Result: ${result}`);

      completed++;
      timings = [
        timings[0] + result[0],
        timings[1] + result[1],
        timings[2] + result[2],
        timings[3] + result[3],
      ];
    }

    processed++;
    if (processed === count) {
      batchResolve();
    }
  });

  channel.start();

  const promises = [];

  for (let i = 0; i < count; i++) {
    promises.push(
      channel.postSignal(Date.now()),
    );
  }

  await Promise.allSettled(promises);

  console.log(await promise);

  console.info("Closing workflows...");
  workflow.close();

  console.info("Closing cluster...");
  cluster.close();

  console.info("Closing KV...");
  kv?.close();

  console.info("Waiting for listener to finish...");
  await channel.result;
}
