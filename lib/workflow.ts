import { ulid } from "https://deno.land/x/ulid@v0.3.0/mod.ts";
import objectHash from "https://esm.sh/object-hash@3.0.0";

import { Activity, Cluster, Store } from "./server.ts";
import { Channel } from "./signal.ts";

type InitActivityArgs<TInput> = {
  script: string;
  timeout: number;
  wrap?: boolean;
  getInvocationId?: (input: TInput) => string;
};

type InvokeActivity<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

interface InitActivity {
  <TInput, TOutput>(
    args: InitActivityArgs<TInput>,
  ): InvokeActivity<TInput, TOutput>;
}

type WorkflowMain<TParams, TResult> = (
  Activity: InitActivity,
  params: TParams,
) => Promise<TResult>;

export interface ListenerCallback<TParams, TResult> {
  (executionId: string, params: TParams, error: Error): void;
  (executionId: string, params: TParams, error: null, result: TResult): void;
}

export interface Workflow<TParams, TResult> {
  run(params: TParams, executionId?: string): Promise<TResult>;
  listen(
    channel: Channel<TParams>,
    callback?: ListenerCallback<TParams, TResult>,
  ): () => void;
  close(): void;
}

export type ClusterWorkflowArgs<TParams, TResult> = {
  cluster: Cluster;
  store: Store;
  workflowId: string;
  main: WorkflowMain<TParams, TResult>;
};

export class ClusterWorkflow<TParams, TResult>
  implements Workflow<TParams, TResult> {
  readonly #workflowId: string;
  readonly #cluster: Cluster;
  readonly #store: Store;
  readonly #main: WorkflowMain<TParams, TResult>;
  readonly #shutdownHooks = new Set<() => void>();

  constructor({
    workflowId,
    cluster,
    store,
    main,
  }: ClusterWorkflowArgs<TParams, TResult>) {
    this.#workflowId = workflowId;
    this.#cluster = cluster;
    this.#store = store;
    this.#main = main;
  }

  run(params: TParams, executionId: string = ulid()): Promise<TResult> {
    const initActivity: InitActivity = <TInput, TOutput>({
      script,
      timeout,
      wrap = true,
      getInvocationId = (input: TInput) => objectHash.sha1(input ?? null),
    }: InitActivityArgs<TInput>) => {
      const activity = new Activity<TInput, TOutput>({
        context: this.#cluster.getContext(this.#store, script, wrap),
        store: this.#store,
        workflowId: this.#workflowId,
        activityId: script,
        timeout: timeout,
      });

      return (input: TInput) => {
        const invocationId = getInvocationId(input);

        const { result } = activity.invoke({
          executionId,
          invocationId,
          input,
        });

        return result;
      };
    };

    return this.#main(initActivity, params);
  }

  listen(
    channel: Channel<TParams>,
    callback?: ListenerCallback<TParams, TResult>,
  ): () => void {
    const off = channel.onSignal((executionId, params) => {
      this.run(params, executionId)
        .then((result) => callback?.(executionId, params, null, result))
        .catch((error) => callback?.(executionId, params, error))
  });

    return () => off();
  }

  close(): void {
    for (const shutdownHook of this.#shutdownHooks) {
      shutdownHook();
    }
  }
}
