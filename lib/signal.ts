import { log } from "./log.ts";
import { Mutex, Unknown } from "./util.ts";

export type Signal<TParams> = {
  readonly workflowId: string;
  readonly params: TParams;
};

export type SignalHandler<TParams> = (
  workflowId: string,
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

  postSignal(signal: Signal<TParams>): Promise<void>;

  onSignal(handler: SignalHandler<TParams>): void;

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
  readonly #workflows = new Set<string>();

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

      const { workflowId, params } = value[kSignal];

      const { resolve, reject } = this.#callbacks[workflowId] ?? {};
      delete this.#callbacks[workflowId];

      try {
        const resultOrPromise = await this.#handler?.(workflowId, params);
        const result = resultOrPromise instanceof Promise
          ? await resultOrPromise
          : resultOrPromise;

        log("[ -- ]", workflowId, "->", result);

        if (resolve) {
          resolve(result);
        } else {
          console.warn(`${workflowId}] Dangling workflow`);
        }
      } catch (e) {
        // TODO: messageerror
        if (reject) {
          reject(e);
        } else {
          console.error(`[${workflowId}] Dangling error:`, e);
        }
      }
    });
  }

  get size() {
    return this.#workflows.size;
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

  postSignal(signal: Signal<TParams>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.#workflows.add(signal.workflowId);
      
      this.#callbacks[signal.workflowId] = { resolve, reject };

      const message: KvSignalMessage<TParams> = { [kSignal]: signal };

      this.#kv.enqueue(message)
        .then()
        .catch((...args) => {
          this.#workflows.delete(signal.workflowId);
          return reject(...args);
        });
    });
  }

  onSignal(handler: SignalHandler<TParams>): void {
    this.#handler = handler;
  }
}
