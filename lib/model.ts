export type StateId = {
  workflowId: string;
  executionId: string;
  activityId: string;
  invocationId: string;
};

export const CheckpointId = (stateId: StateId): string =>
  [
    stateId.workflowId,
    stateId.executionId,
    stateId.activityId,
    stateId.invocationId,
  ].join(":");

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

export type ErrorMessage = Message<"error", {
  message: string;
  stack?: string;
}>;

export type WorkflowMessage<
  TType extends MessageType,
  TData extends MessageData,
> = Message<TType, TData> & {
  stateId: StateId;
};

export type InputMessage<TInput> = WorkflowMessage<"input", TInput>;
export type OutputMessage<TOutput> = WorkflowMessage<"output", TOutput>;

export type ExceptionMessage = WorkflowMessage<"exception", {
  message: string;
  stack?: string;
}>;

export default {
  setup: <TData extends MessageData>(data: TData): SetupMessage<TData> => ({
    type: "setup",
    data,
  }),

  signal: (signal: Deno.Signal): SignalMessage => ({
    type: "signal",
    data: signal,
  }),

  error: (error: Error): ErrorMessage => ({
    type: "error",
    data: {
      message: error.message,
      stack: error.stack,
    },
  }),

  input: <TInput>(
    stateId: StateId,
    input: TInput,
  ): InputMessage<TInput> => ({
    type: "input",
    stateId,
    data: input,
  }),

  output: <TOutput>(
    stateId: StateId,
    output: TOutput,
  ): OutputMessage<TOutput> => ({
    type: "output",
    stateId,
    data: output,
  }),

  exception: (
    stateId: StateId,
    error: Error,
  ): ExceptionMessage => ({
    type: "exception",
    stateId,
    data: {
      message: error.message,
      stack: error.stack,
    },
  }),
};
