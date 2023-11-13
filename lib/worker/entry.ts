/// <reference lib="deno.worker" />
/// <reference lib="webworker" />

/**
 * As with regular modules, you can use top-level await in worker modules.
 * However, you should be careful to always register the message handler before the first await, since messages can be lost otherwise.
 * This is not a bug in Deno, it's just an unfortunate interaction of features, and it also happens in all browsers that support module workers.
 *
 * Reference: https://docs.deno.com/runtime/manual/runtime/workers
 */

type Events = DedicatedWorkerGlobalScopeEventMap;

const coldListen = <K extends keyof Events>(type: K) => {
  const openings: Events[K][] = [];

  const listener = (e: Events[K]) => {
    openings.push(e);
  };

  addEventListener(type, listener);

  return () => {
    removeEventListener(type, listener);

    return openings;
  };
};

const flushers = {
  messages: coldListen("message"),
  messageerrors: coldListen("messageerror"),
  errors: coldListen("error"),
};

const init = () => {
  const events = [
    ...flushers.messages(),
    ...flushers.messageerrors(),
    ...flushers.errors(),
  ];

  for (const event of events) {
    dispatchEvent(event);
  }
};

declare global {
  namespace Durex {
    function init(): void;
  }
}

globalThis.Durex = {
  init,
};
