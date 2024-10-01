import pino from "pino";

export const logger = pino({
  name: "fission-points-indexer",
  level: "info",
  transport: {
    target: "pino-pretty", // Optional: for pretty-printing logs in development
    options: {
      colorize: true, // Optional: colorize the output
    },
  },
});
