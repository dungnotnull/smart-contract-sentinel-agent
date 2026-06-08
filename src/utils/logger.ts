/**
 * Structured JSON logger using pino.
 * SILENT in tests, DEBUG in dev, INFO in prod.
 * Never logs private keys, bearer tokens, or guardian wallet mnemonics.
 */

import pino from "pino";

const level = (() => {
  const env = process.env.NODE_ENV;
  if (env === "test") return "silent";
  if (env === "development") return "debug";
  return "info";
})();

export const logger = pino.pino({
  level,
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  redact: ["privateKey", "guardianPrivateKey", "mnemonic", "authorization", "password"],
  serializers: {
    err: pino.stdSerializers.err,
  },
});