import { KvQueueChannel } from "../lib/signal.ts";

const kv = await Deno.openKv("./kv.sqlite3");

const channel = new KvQueueChannel(kv);

channel.onSignal((signal) => {
  console.log("Got signal", signal);
});

channel.postSignal({
  workflowId: "1",
  params: {
    x: 1,
  },
});

channel.start();

setTimeout(() => {
  channel.close();
  kv.close();
}, 3000);
