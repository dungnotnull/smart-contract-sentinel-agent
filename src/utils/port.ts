import { createServer } from "node:net";

export function getAvailablePort(startPort: number = 8545): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      resolve(getAvailablePort(startPort + 1));
    });
  });
}
