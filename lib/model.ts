export type MessageType = string;
export type MessageData = unknown;

export type Message<TType extends MessageType, TData extends MessageData> = {
  type: TType;
  data: TData;
};

export type SetupMessage<TData extends MessageData> = Message<"setup", TData>;
export type SignalMessage = Message<
  "signal",
  Deno.Signal
>;

export type WorkflowMessage<
  TType extends MessageType,
  TData extends MessageData,
> = Message<TType, TData> & { workflowId: string };

export type InputMessage<TInput> = WorkflowMessage<"input", TInput>;
export type OutputMessage<TOutput> = WorkflowMessage<"output", TOutput>;
export type ErrorMessage = Message<"error", Error> & { workflowId?: string };

export default {
  setup: <TData extends MessageData>(data: TData): SetupMessage<TData> => ({
    type: "setup",
    data,
  }),

  signal: (signal: Deno.Signal): SignalMessage => ({
    type: "signal",
    data: signal,
  }),

  input: <TInput>(workflowId: string, input: TInput): InputMessage<TInput> => ({
    type: "input",
    workflowId,
    data: input,
  }),

  output: <TOutput>(
    workflowId: string,
    output: TOutput,
  ): OutputMessage<TOutput> => ({
    type: "output",
    workflowId,
    data: output,
  }),

  error: (error: Error, workflowId?: string): ErrorMessage => ({
    type: "error",
    workflowId,
    data: error,
  }),
};