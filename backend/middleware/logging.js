import { logger } from 'hono/logger';

function secureLogger() {
  return logger((args) => {
    const redacted = args
      .replace(/password["']?\s*[:=]\s*["']?[\w@#$%^&*!]+/gi, 'password=[REDACTED]')
      .replace(/credential[s]?["']?\s*[:=]\s*["'][^"']+["']/gi, 'credentials=[REDACTED]')
      .replace(/token["']?\s*[:=]\s*["'][^"']+["']/gi, 'token=[REDACTED]')
      .replace(/connection["']?\s*[:=]\s*["'][^"']+["']/gi, 'connection=[REDACTED]')
      .replace(/secret["']?\s*[:=]\s*["'][^"']+["']/gi, 'secret=[REDACTED]');

    console.log(redacted);
  });
}

export { secureLogger };