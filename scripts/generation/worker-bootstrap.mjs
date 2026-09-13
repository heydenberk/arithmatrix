// worker_threads do not inherit the main thread's tsx loader, so each worker
// registers it for itself before loading the TypeScript entry point.
import { register } from 'tsx/esm/api';
register();
await import('./worker.ts');
