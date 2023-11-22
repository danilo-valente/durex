import { timeEnd, timeStart } from "./log.ts";
import Message, {
  CheckpointId,
  ExceptionMessage,
  OutputMessage,
  StateId,
} from "./model.ts";

export type StateData<T> = {
  exists: true;
  state: T;
} | { exists: false };

export interface Store {
  save<T>(id: StateId, state: T): Promise<void>;
  restore<T>(id: StateId): Promise<StateData<T>>;
}

type PromiseExecutor<T> = ConstructorParameters<typeof Promise<T>>[0];
type PromiseHandlers<T> = Parameters<PromiseExecutor<T>>;
type PromiseContext<T> = {
  resolve: PromiseHandlers<T>[0];
  reject: PromiseHandlers<T>[1];
  signal?: AbortSignal;
};

type WorkerContext = {
  worker: Worker;
  invocations: Map<string, PromiseContext<unknown>>;
  close(signal?: Deno.Signal): void;
};

export type ClusterConfig = {
  base: string | URL;
  shutdownTimeout: number;
};

export const Cluster = ({ base, shutdownTimeout }: ClusterConfig) => {
  const contexts = new Map<string, WorkerContext>();

  const wrapWorker = (script: string) => {
    const wrapperPath = "./worker/wrapper.ts";
    const wrapperUrl = new URL(wrapperPath, import.meta.url);
    wrapperUrl.searchParams.set("worker", new URL(script, base).href);

    return new Worker(wrapperUrl, {
      type: "module",
      name: `${wrapperPath}?worker=${script}`,
    });
  };

  const initContext = (store: Store, script: string, wrap: boolean) => {
    const worker = wrap
      ? wrapWorker(script)
      : new Worker(new URL(script, base), {
        type: "module",
        name: script,
      });

    // TODO: send setup message

    const context: WorkerContext = {
      worker: worker,
      invocations: new Map(),
      close(signal: Deno.Signal = "SIGINT") {
        for (const { reject, signal } of this.invocations.values()) {
          if (!signal?.aborted) {
            reject(new Error("Worker terminated"));
          }
        }

        this.invocations.clear();

        worker.removeEventListener("message", listener);

        worker.postMessage(Message.signal(signal));

        // TODO: clear timeout if worker self closes
        setTimeout(() => {
          worker.terminate();
        }, shutdownTimeout);
      },
    };

    contexts.set(script, context);

    const listener = async (e: MessageEvent) => {
      const { type, stateId, data }: OutputMessage<unknown> | ExceptionMessage =
        e.data;

      const checkpointId = CheckpointId(stateId);

      const { resolve, reject, signal } =
        context.invocations.get(checkpointId) ??
          {
            resolve() {
              console.warn(`[${checkpointId}] Dangling resolve`);
            },
            reject() {
              console.error(`[${checkpointId}] Dangling reject`);
            },
          };

      context.invocations.delete(checkpointId);

      if (signal?.aborted) {
        return;
      }

      if (type === "exception") {
        const error = new Error(data.message, {
          cause: data.stack,
        });

        reject(error);
        return;
      }

      const timerTag = `[${stateId.activityId} -> ${stateId.executionId}]]`;
      timeStart(timerTag);

      try {
        await store.save(stateId, data);

        resolve(data);
      } catch (err) {
        reject(err);
      } finally {
        timeEnd(timerTag);
      }
    };

    worker.addEventListener("message", listener);
    // worker.addEventListener("messageerror", listener);
    // worker.addEventListener("error", listener);

    return context;
  };

  const getContext = (store: Store, script: string, wrap: boolean) => {
    return contexts.get(script) || initContext(store, script, wrap);
  };

  const close = () => {
    for (const context of contexts.values()) {
      context.close();
    }
  };

  return {
    getContext,
    close,
  };
};

export type Cluster = ReturnType<typeof Cluster>;

export type Invocation<TOutput> = {
  id: string;
  controller: AbortController;
  result: Promise<TOutput>;
};

export type ActivityArgs = {
  context: WorkerContext;
  store: Store;
  workflowId: string;
  activityId: string;
  timeout: number;
};

export type InvokeArgs<TInput> = {
  executionId: string;
  invocationId: string;
  input: TInput;
};

export class Activity<TInput, TOutput> {
  readonly #context: WorkerContext;
  readonly #store: Store;
  readonly #workflowId: string;
  readonly #activityId: string;
  readonly #timeout: number;

  constructor({
    context,
    store,
    workflowId,
    activityId,
    timeout,
  }: ActivityArgs) {
    this.#context = context;
    this.#store = store;
    this.#workflowId = workflowId;
    this.#activityId = activityId;
    this.#timeout = timeout;
  }

  invoke(
    { executionId, invocationId, input }: InvokeArgs<TInput>,
  ): Invocation<TOutput> {
    const stateId: StateId = {
      workflowId: this.#workflowId,
      executionId,
      activityId: this.#activityId,
      invocationId,
    };

    const controller = new AbortController();

    const result = new Promise<TOutput>((resolve, reject) => {
      const { worker, invocations } = this.#context;

      controller.signal.addEventListener("abort", reject);

      const timerTag = `[${stateId.activityId} -> ${stateId.executionId}]]`;
      timeStart(timerTag);

      this.#store.restore<TOutput>(stateId)
        .then((storedState) => {
          if (storedState.exists) {
            return resolve(storedState.state);
          }

          // TODO: ensure worker caching before scheduling timer
          const timeoutId = setTimeout(() => {
            controller.abort(
              `[${stateId}] Timed out after ${this.#timeout}`,
            );
          }, this.#timeout);

          const checkpointId = CheckpointId(stateId);

          invocations.set(checkpointId, {
            resolve(result) {
              clearTimeout(timeoutId);
              resolve(result);
            },
            reject(reason) {
              clearTimeout(timeoutId);
              reject(reason);
            },
            signal: controller.signal,
          });

          // TODO: exchange messages using protobuf (https://pbkit.dev/) and/or gRPC
          worker.postMessage(
            Message.input(stateId, input),
          );

          // TODO: listen to signals and forward them to the workers
        })
        .catch(reject)
        .finally(() => {
          timeEnd(timerTag);
        });
    });

    return {
      id: invocationId,
      controller,
      result,
    };
  }
}
