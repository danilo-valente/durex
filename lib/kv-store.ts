import { StateKey, Store } from "./server.ts";

class KvStore implements Store {

  constructor(private kv: Deno.Kv) {}
  
  async save<T>([workflowId, script]: StateKey, state: T) {
    await this.kv.set(["executions", workflowId, "activies", script], state);
  }

  async restore<T>([workflowId, script]: StateKey) {
    const { value, versionstamp } = await this.kv.get<T>([
      "executions",
      workflowId,
      "activies",
      script,
    ]);

    return { exists: !!versionstamp, state: value };
  }
}

export default KvStore;