import { ParamsMessage, ResultMessage } from "./model.ts";

export type StateKey = [workflowId: string, script: string];

export interface Store {
  save<T>(key: StateKey, state: T): Promise<void>;
  restore<T>(key: StateKey): Promise<{ exists: boolean; state: T }>;
}

interface Activity<P, R> {
  (workflowId: string, params: P): Promise<R>;
  close(): void;
}

type PromiseExecutor<T> = ConstructorParameters<typeof Promise<T>>[0];
type PromiseHandlers<T> = Parameters<PromiseExecutor<T>>;
type PromiseContext<T> = { resolve: PromiseHandlers<T>[0]; reject: PromiseHandlers<T>[1]; timeoutId: number };

type WorkerContext = {
  worker: Worker;
  invocations: Map<string, PromiseContext<TOutput>>;
  close(): void;
};

export const Cluster = (base: string | URL) => {
  const contexts = new Map<string, WorkerContext>();

  const initWorker = (store: Store, script: string) => {
    const worker = new Worker(new URL(script, base).href, { type: 'module' });

    const context: WorkerContext = {
      worker: worker,
      invocations: new Map(),
      close() {
        for (const { reject, timeoutId } of this.invocations.values()) {
          clearTimeout(timeoutId);
          reject(new Error('Worker terminated'));
        }

        this.invocations.clear();

        worker.removeEventListener('message', listener);
        worker.terminate();
      },
    };

    contexts.set(script, context);

    const listener = async (e: MessageEvent) => {
      const { workflowId, output }: ResultMessage<TOutput> = e.data;

      const { resolve, reject, timeoutId } = context.invocations.get(workflowId) ?? {};
      context.invocations.delete(workflowId);

      try {
        clearTimeout(timeoutId);

        await store.save([workflowId, script], output);

        if (resolve) {
          resolve(output);
        } else {
          console.warn(`[${workflowId}] Dangling workflow`);
        }
      } catch (err) {
        if (reject) {
          reject(err);
        } else {
          console.error(`[${workflowId}] Dangling error:`, err);
        }
      }
    };

    worker.addEventListener('message', listener);

    return context;
  };

  const getWorker = (store: Store, script: string) => {
    return contexts.get(script) || initWorker(store, script);
  };

  const close = () => {
    for (const context of contexts.values()) {
      context.close();
    }
  };

  return {
    getWorker,
    close,
  };
};

export type Cluster = ReturnType<typeof Cluster>;

export const initActivity = <TInput, TOutput>(cluster: Cluster, store: Store, script: string, timeout: number) => {
  const { worker, invocations } = cluster.getWorker(store, script);

  // TODO: handle errors

  const invoke: Activity<TInput, TOutput> = async (workflowId, input) => {
    const result = await store.restore<TOutput>([workflowId, script]);

    if (result.exists) {
      return result.state;
    }

    return new Promise<TOutput>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(`[${workflowId}] ${script} timed out after ${timeout}`);
      }, timeout);

      invocations.set(workflowId, { resolve, reject, timeoutId });

      const message: ParamsMessage<TInput> = { workflowId, input };

      worker.postMessage(message);
    });
  };

  invoke.close = () => {};

  return invoke;
};

// type WorkflowDeps<TP, TR> = Record<string, Activity<TP, TR>>;

// type WorkflowSetup<TP, TR> = (
//   Activity: <P extends TP, R extends TR>(script: string, timeout: number) => Activity<P, R>
// ) => D;

// type WorkflowExecutor = <TP, TR, I>(args: I, activities: WorkflowDeps<TP, TR>) => Promise<void>;

// export const Workflow = async <TP, TR, P extends TP, R extends TR>(
//   store: Store,
//   setup: WorkflowSetup<TP, TR>,
//   executor: WorkflowExecutor,
// ) => {
//   const activities = setup(initActivity<P, R>.bind(null, store));

//   return <I>(workflowId: string, ...args: I[]) => executor(args, activities);
// };

interface WorkspaceActivity<TInput, TOutput> {
  (params: TInput): Promise<TOutput>;
  followedBy<TNextResult>(...config: Parameters<ActivityFactory<unknown>>): WorkspaceActivity<TOutput, TNextResult>;
}

interface ActivityFactory<TParams> {
  <TInput, TOutput>(script: string, timeout: number): WorkspaceActivity<TInput, TOutput>;
  entry<TOutput>(...config: Parameters<ActivityFactory<TParams>>): WorkspaceActivity<TParams, TOutput>;
}

type WorkflowExecutor<TParams extends unknown[], TResult> = (
  Activity: ActivityFactory<TParams>,
  ...params: TParams
) => Promise<TResult>;

interface WorkflowMain<TParams extends unknown[], TResult> {
  (workflowId: string, ...params: TParams): Promise<TResult>;
  close(): void;
}

const Workflow = <TParams extends unknown[], TResult>(
  cluster: Cluster,
  store: Store,
  executor: WorkflowExecutor<TParams, TResult>,
): WorkflowMain<TParams, TResult> => {
  const shutdownHooks = new Set<() => void>();

  const workflow: WorkflowMain<TParams, TResult> = (workflowId, ...params: TParams) => {
    const activityFactory = <TInput, TOutput>(...config: Parameters<ActivityFactory<TParams>>) => {
      const activity = initActivity<TInput, TOutput>(cluster, store, ...config);

      const workspaceActivity = (input: TInput) => {
        shutdownHooks.add(activity.close);

        return activity(workflowId, input);
      };

      workspaceActivity.followedBy = <TNextResult>(...config: Parameters<ActivityFactory<TParams>>) =>
        activityFactory<TOutput, TNextResult>(...config);

      return workspaceActivity;
    };

    // activityFactory.entry = <TParams, TOutput>(...config: Parameters<ActivityFactory>) =>
    //   activityFactory<TParams, TOutput>(...config);

    activityFactory.entry = <TParams, TOutput>(...config: Parameters<ActivityFactory<TParams>>) =>
      activityFactory<TParams, TOutput>(...config);

    return executor(activityFactory, ...params);
  };

  workflow.close = () => {
    for (const shutdownHook of shutdownHooks) {
      shutdownHook();
    }
  };

  return workflow;
};

export default Workflow;
