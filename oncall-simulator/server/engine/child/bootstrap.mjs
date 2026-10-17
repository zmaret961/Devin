// Worker entry point: registers the tsx loader in this thread, then runs the TypeScript child agent.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
