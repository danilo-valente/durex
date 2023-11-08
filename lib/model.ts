export type ParamsMessage<TInput> = { workflowId: string; input: TInput };
export type ResultMessage<TOutput> = { workflowId: string; output: TOutput };
