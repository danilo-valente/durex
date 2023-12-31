import { StateId } from "./model.ts";
import { StateData, Store } from "./server.ts";

class KvStore implements Store {
  readonly #kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.#kv = kv;
  }

  private key(
    { workflowId, executionId, activityId, invocationId }: StateId,
  ): string[] {
    return [
      "workflows",
      workflowId,
      "executions",
      executionId,
      "activies",
      activityId,
      "invocations",
      invocationId,
    ];
  }

  async save<T>(id: StateId, state: T) {
    await this.#kv.set(this.key(id), state);
  }

  async restore<T>(id: StateId): Promise<StateData<T>> {
    const { value, versionstamp } = await this.#kv.get<T>(this.key(id));

    return versionstamp ? { exists: true, state: value } : { exists: false };
  }
}

export default KvStore;
