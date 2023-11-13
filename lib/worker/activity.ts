export interface Main {
  <TInput, TOutput>(input: TInput): TOutput | Promise<TOutput>;
}

export interface OnSignal {
  (signal: Deno.Signal): void;
}

export interface OnSetup {
  (): void;
}

export interface Worker {
  default: Main;
  onSignal?: OnSignal;
  onSetup?: OnSetup;
}