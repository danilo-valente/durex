export type Unknown = unknown | Promise<unknown>;

export class Mutex {
  #signal?: Promise<void>;
  #unlock?: () => void;

  get signal() {
    return this.#signal;
  }

  unlock() {
    this.#signal = undefined;
    this.#unlock?.();
  }

  lock() {
    this.#signal = new Promise<void>((resolve) => {
      this.#unlock = resolve;
    });
  }

  async with(callback: () => Unknown) {
    this.#signal && await this.#signal;

    this.lock();

    const result = callback();
    
    result instanceof Promise && await result;

    this.unlock();
  }

  shutdown() {
    this.#signal = Promise.reject(new Error("Shutdown"));
  }
}
