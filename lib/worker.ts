/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />
/// <reference lib="webworker" />

import { ParamsMessage, ResultMessage } from "./model.ts";

export const main = <TInput, TOutput>(
  { url }: ImportMeta,
  fn: (input: TInput) => TOutput | Promise<TOutput>,
) => {
  const script = new URL(url).pathname.split("/").pop()!;

  const listener = (e: MessageEvent<ParamsMessage<TInput>>) => {
    const { workflowId, input }: ParamsMessage<TInput> = e.data;
    console.info(`[${script}]`, workflowId);

    const reply = (output: TOutput) =>
      postMessage(
        { workflowId, output } satisfies ResultMessage<TOutput>,
      );

    const output = fn(input);
    if (output instanceof Promise) {
      output.then(reply);
    } else {
      reply(output);
    }
  };

  addEventListener("message", listener);
  // TODO: addEventListener("error", (e) => {});
  // TODO: addEventListener("unhandledrejection", (e) => {});
};
