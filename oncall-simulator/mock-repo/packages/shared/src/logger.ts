type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(service: string): Logger {
  const emit = (level: Level, msg: string, fields: Record<string, unknown> = {}) => {
    if (process.env.LOG_SILENT) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...fields });
    (level === 'error' ? console.error : console.log)(line);
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}
