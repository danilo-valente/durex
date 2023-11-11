import KvStore from "../lib/kv-store.ts";
import Workflow, { Cluster } from "../lib/server.ts";
import { KvQueueChannel } from "../lib/signal.ts";

const kv = await Deno.openKv("./kv.sqlite3");

const store = new KvStore(kv);

const cluster = Cluster({
  base: import.meta.url,
  shutdownTimeout: 1000,
});

const channel = new KvQueueChannel<{ x: number }>(kv);

try {
  await main(parseInt(Deno.args[0]));
  console.log("Exiting...");
} catch (e) {
  console.error(e);
}

async function main(count: number) {
  const workflow = Workflow(
    cluster,
    store,
    async (Activity, x: number) => {
      const step1 = Activity.entry<number>("./a.ts", 1000);
      const step2 = step1.followedBy<number>("./b.ts", 1000);
      const step3 = step2.followedBy<string>("./c.ts", 1000);

      return step1(x).then(step2).then(step3);
    },
  );

  channel.onSignal(async (workflowId, params) => {
    const result = await workflow(workflowId, params.x);

    console.log("[ -- ]", workflowId, "->", result);
  });

  channel.start();

  for (let x = 0; x < count; x++) {
    const workflowId = Math.random().toString(36).slice(2);

    channel.postSignal({
      workflowId,
      params: { x },
    });
  }

  await new Promise<void>((resolve, reject) => {
    const watcher = setInterval(() => {
      const remaining = channel.size;

      if (remaining === 0) {
        clearInterval(watcher);
        resolve();
      } else {
        console.info(`Waiting for ${remaining} workflows to finish...`);
      }
    }, 1000);
  });

  console.info("Closing workflows...");
  workflow.close();

  console.info("Closing cluster...");
  cluster.close();

  console.info("Closing KV...");
  kv.close();

  console.info("Waiting for listener to finish...");
  await channel.result;
}
