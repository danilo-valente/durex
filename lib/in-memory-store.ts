import { StateId } from "./model.ts";
import { StateData, Store } from "./server.ts";

class InMemoryStore implements Store {
  readonly map: Map<string, unknown> = new Map();

  private key(
    { workflowId, executionId, activityId, invocationId }: StateId,
  ): string {
    return [
      "workflows",
      workflowId,
      "executions",
      executionId,
      "activies",
      activityId,
      "invocations",
      invocationId,
    ].join(":");
  }

  async save<T>(id: StateId, state: T) {
    this.map.set(this.key(id), state);
  }

  async restore<T>(id: StateId): Promise<StateData<T>> {
    const key = this.key(id);
    if (!this.map.has(key)) {
      return { exists: false };
    }

    return {
      exists: true,
      state: this.map.get(key) as T,
    };
  }
}

export default InMemoryStore;
