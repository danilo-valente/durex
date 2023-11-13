import { ulid } from "https://deno.land/x/ulid@v0.3.0/mod.ts";
import { log } from "./log.ts";
import { Mutex, Unknown } from "./util.ts";

export type Signal<TParams> = {
  readonly executionId: string;
  readonly params: TParams;
};

export type SignalHandler<TParams> = (
  executionId: string,
  params: TParams,
) => Unknown;

export interface Channel<TParams> {
  /**
   * Begins dispatching messages received on the port. This is implicitly called
   * when assigning a value to `this.onmessage`.
   */
  start(): void;

  /**
   * Disconnects the port, so that it is no longer active.
   */
  close(): void;

  postSignal(params: TParams, executionId?: string): Promise<void>;

  onSignal(handler: SignalHandler<TParams>): () => void;

  // TODO: onError();
}

type Resolve<T> = (value: T | PromiseLike<T>) => void;
type Reject = (reason?: any) => void;
type Handler<T> = { resolve: Resolve<T>; reject: Reject };

const kSignal = "__durex_signal__";

type KvSignalMessage<TParams> = {
  [kSignal]: Signal<TParams>;
};

const hasSignal = <TParams>(
  value: unknown,
): value is KvSignalMessage<TParams> =>
  !!value && typeof value === "object" && kSignal in value;

// TODO: extends MessagePort implements Channel
export class KvQueueChannel<TParams> implements Channel<TParams> {
  readonly #executions = new Set<string>();

  readonly #callbacks: Record<string, Handler<void>> = {};

  readonly #mutex = new Mutex();

  readonly #kv: Deno.Kv;

  readonly result: Promise<void>;

  #handler?: SignalHandler<TParams>;

  constructor(kv: Deno.Kv) {
    this.#kv = kv;

    this.#mutex.lock();

    this.result = kv.listenQueue(async (value: unknown) => {
      if (!hasSignal<TParams>(value)) {
        return;
      }

      if (this.#mutex.signal) {
        await this.#mutex.signal;
      }

      const { executionId, params } = value[kSignal];

      const { resolve, reject } = this.#callbacks[executionId] ?? {};
      delete this.#callbacks[executionId];

      try {
        const resultOrPromise = await this.#handler?.(executionId, params);
        const result = resultOrPromise instanceof Promise
          ? await resultOrPromise
          : resultOrPromise;

        log("[ -- ]", executionId, "->", result);

        this.#executions.delete(executionId);

        if (resolve) {
          resolve(result);
        } else {
          console.warn(`${executionId}] Dangling workflow`);
        }
      } catch (e) {
        // TODO: messageerror
        if (reject) {
          reject(e);
        } else {
          console.error(`[${executionId}] Dangling error:`, e);
        }
      }
    });
  }

  get size() {
    return this.#executions.size;
  }

  start(): void {
    this.#mutex.unlock();
  }

  close(): void {
    this.#mutex.lock();

    for (const { reject } of Object.values(this.#callbacks)) {
      reject?.(new Error("Channel closed"));
    }
  }

  postSignal(params: TParams, executionId: string = ulid()): Promise<void> {
    const signal: Signal<TParams> = { executionId, params };

    return new Promise<void>((resolve, reject) => {
      this.#executions.add(signal.executionId);

      this.#callbacks[signal.executionId] = { resolve, reject };

      const message: KvSignalMessage<TParams> = { [kSignal]: signal };

      // console.log(Date.now() - params);
      this.#kv.enqueue(message)
        .then(() => {
        })
        .catch((err) => {
          this.#executions.delete(signal.executionId);
          return reject(err);
        });
    });
  }

  onSignal(handler: SignalHandler<TParams>): () => void {
    this.#handler = handler;

    return () => {
      if (this.#handler === handler) {
        this.#handler = undefined;
      }
    };
  }
}

export class InMemoryQueueChannel<TParams> implements Channel<TParams> {
  readonly #mutex = new Mutex();

  readonly result = Promise.resolve();

  #size = 0;

  #handler?: SignalHandler<TParams>;

  constructor() {
    this.#mutex.lock();
  }

  get size() {
    return this.#size;
  }

  async #listener(value: unknown) {
    if (!hasSignal<TParams>(value)) {
      return;
    }

    if (this.#mutex.signal) {
      await this.#mutex.signal;
    }

    const { executionId, params } = value[kSignal];

    const resultOrPromise = await this.#handler?.(executionId, params);
    const result = resultOrPromise instanceof Promise
      ? await resultOrPromise
      : resultOrPromise;

    log("[ -- ]", executionId, "->", result);
  }

  start(): void {
    this.#mutex.unlock();
  }

  close(): void {
    this.#mutex.lock();
  }

  postSignal(params: TParams, executionId: string = ulid()): Promise<void> {
    const signal: Signal<TParams> = { executionId, params };

    const message: KvSignalMessage<TParams> = { [kSignal]: signal };

    this.#size++;

    return this.#listener(message);
  }

  onSignal(handler: SignalHandler<TParams>): () => void {
    this.#handler = handler;

    return () => {
      if (this.#handler === handler) {
        this.#handler = undefined;
      }
    };
  }
}
