/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />
/// <reference lib="webworker" />

import { log } from "./log.ts";
import Message, {
  InputMessage,
  MessageData,
  SetupMessage,
  SignalMessage,
} from "./model.ts";

addEventListener("error", (e) => {
  log("error", e.error);
  postMessage(Message.error(e.error, "worker"));
});

export const main = <TInput, TOutput>(
  { url }: ImportMeta,
  fn: (input: TInput) => TOutput | Promise<TOutput>,
) => {
  const script = new URL(url).pathname.split("/").pop()!;

  const listener = (workflowId: string, input: TInput) => {
    log(`[${script}]`, workflowId);

    const reply = (output: TOutput) =>
      postMessage(
        Message.output(workflowId, output),
      );

    const output = fn(input);
    if (output instanceof Promise) {
      output.then(reply).catch((err) => {
        log(`[${script}]`, workflowId, err);
        postMessage(Message.error(err, workflowId));
      });
    } else {
      reply(output);
    }
  };

  addEventListener("message", (e: MessageEvent<InputMessage<TInput>>) => {
    const { workflowId, data: input }: InputMessage<TInput> = e.data;
    if (e.data.type === "input") {
      listener(workflowId, input);
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

export const onSignal = (fn: (signal: Deno.Signal) => void) => {
  const listener = (e: MessageEvent<SignalMessage>) => {
    const { type, data } = e.data;

    if (type === "signal") {
      fn(data);
    }
  };

  addEventListener("message", listener);
};
