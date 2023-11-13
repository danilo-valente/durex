import KvStore from "../lib/kv-store.ts";
import { Cluster } from "../lib/server.ts";
import { KvQueueChannel } from "../lib/signal.ts";
import { ClusterWorkflow } from "../lib/workflow.ts";

const kv = await Deno.openKv("./kv.sqlite3");

const store = new KvStore(kv);

const cluster = Cluster({
  base: import.meta.url,
  shutdownTimeout: 1000,
});

const channel = new KvQueueChannel<number>(kv);

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
    main: async (Activity, x: number) => {
      const step1 = Activity<number, number>({
        script: "./a.ts",
        timeout: 100000,
        wrap: true,
      });
      const step2 = Activity<number, number>({
        script: "./b.ts",
        timeout: 1000,
        wrap: true,
      });
      const step3 = Activity<number, string>({
        script: "./c.ts",
        timeout: 1000,
        wrap: true,
      });

      console.info(`Running workflow with params: ${x}`);

      return step1(x).then(step2).then(step3);
    },
  });

  let errorCount = 0;
  let resultCount = 0;
  
  workflow.listen(channel, (executionId, x, err, result) => {
    if (err) {
      errorCount++;
      console.error(`[${executionId}] Error: ${err}`);
    } else {
      resultCount++;
      console.info(`[${executionId}] Result: ${result}`);
    }
  });

  channel.start();

  for (let x = -1; x <= count; x++) {
    const executionId = Math.random().toString(36).slice(2);

    channel.postSignal(x);
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

  console.info(`Done! ${errorCount} errors, ${resultCount} results.`);
}
