import Workflow, { Cluster, StateKey, Store } from "../lib/server.ts";

const kv = await Deno.openKv("./kv.sqlite3");

const cluster = Cluster(import.meta.url);

try {
  await main(parseInt(Deno.args[0]));
  console.log("Exiting...");
} catch (e) {
  console.error(e);
}

async function main(count: number) {
  const store: Store = {
    async save<T>([workflowId, script]: StateKey, state: T) {
      await kv.set(["executions", workflowId, "activies", script], state);
    },

    async restore<T>([workflowId, script]: StateKey) {
      const { value, versionstamp } = await kv.get<T>([
        "executions",
        workflowId,
        "activies",
        script,
      ]);

      return { exists: !!versionstamp, state: value };
    },
  };

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

  type QueueMessage = { workflowId: string; x: number };

  const jobs = [];
  const handlers = {};

  const listener = kv.listenQueue(async (value) => {
    const { workflowId, x } = value as QueueMessage;

    const { resolve, reject } = handlers[workflowId] ?? {};
    delete handlers[workflowId];

    try {
      const result = await workflow(workflowId, x);

      console.info("[ -- ]", workflowId, "->", result);

      if (resolve) {
        resolve(result);
      } else {
        console.warn(`${workflowId}] Dangling workflow`);
      }
    } catch (e) {
      if (reject) {
        reject(e);
      } else {
        console.error(`[${workflowId}] Dangling error:`, e);
      }
    }
  });

  for (let x = 0; x < count; x++) {
    const workflowId = Math.random().toString(36).slice(2);

    jobs.push(
      new Promise((resolve, reject) => {
        handlers[workflowId] = { resolve, reject };

        kv.enqueue({ workflowId, x })
          .then()
          .catch(reject);
      }),
    );
  }

  await new Promise<void>((resolve, reject) => {
    const watcher = setInterval(() => {
      const remaining = Object.keys(handlers).length;

      if (remaining === 0) {
        clearInterval(watcher);
        resolve();
      } else {
        console.info(`Waiting for ${remaining} workflows to finish...`);
      }
    }, 1000);
  });

  await Promise.all(jobs);

  console.info("Closing workflows...");
  workflow.close();

  console.info("Closing cluster...");
  cluster.close();

  console.info("Closing kv...");
  kv.close();

  console.info("Waiting for listener to finish...");
  await listener;
}
