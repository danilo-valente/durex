import "./entry.ts";
import { log } from "../log.ts";
import Message, {
  InputMessage,
  MessageData,
  SetupMessage,
  SignalMessage,
  StateId,
} from "../model.ts";
import * as Activity from "./activity.ts";

addEventListener("error", (e) => {
  log("error", e.error);
  postMessage(Message.error(e.error));
});

export const main = <TInput, TOutput>(
  url: string | URL,
  fn: Activity.Main,
) => {
  const script = new URL(url).pathname.split("/").pop()!;

  const listener = (stateId: StateId, input: TInput) => {
    log(`[${script}]`, stateId);

    const reply = (output: TOutput) =>
      postMessage(
        Message.output(stateId, output),
      );

    try {
      const output = fn(input);

      if (output instanceof Promise) {
        output.then(reply).catch((err) => {
          log(`[${script}]`, stateId, err);
          postMessage(Message.exception(stateId, err));
        });
      } else {
        reply(output);
      }
    } catch (err) {
      log(`[${script}]`, stateId, err);
      postMessage(Message.exception(stateId, err));
    }
  };

  addEventListener("message", (e: MessageEvent<InputMessage<TInput>>) => {
    const { stateId, data: input }: InputMessage<TInput> = e.data;

    if (e.data.type === "input") {
      listener(stateId, input);
    }
  });

  // TODO: addEventListener("error", (e) => {});
  // TODO: addEventListener("unhandledrejection", (e) => {});
};

export const onSetup = <TData extends MessageData>(
  fn: (data: TData) => void,
) => {
  const listener = (e: MessageEvent<SetupMessage<TData>>) => {
    const { type, data } = e.data;

    if (type === "setup") {
      fn(data);
    }
  };

  addEventListener("message", listener);
};

// TODO: refactor
const defaultSignalHandler = (e: MessageEvent<SignalMessage>) => {
  const { type, data: signal } = e.data;

  if (type === "signal" && signal === "SIGINT") {
    self.close();
  }
};

addEventListener("message", defaultSignalHandler);

export const onSignal = (fn: (signal: Deno.Signal) => void) => {
  removeEventListener("message", defaultSignalHandler);

  const listener = (e: MessageEvent<SignalMessage>) => {
    const { type, data } = e.data;

    if (type === "signal") {
      fn(data);
    }
  };

  addEventListener("message", listener);
};
