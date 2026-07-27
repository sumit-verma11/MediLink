import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app';
import { connectDB } from './lib/db';
import { logger } from './lib/logger';
import { initSocket } from './lib/socket';

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  await connectDB(process.env.MONGO_URI ?? 'mongodb://localhost:27017/medlink');
  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);
  httpServer.listen(PORT, () => logger.info(`api listening on ${PORT}`));
}

main().catch((err) => {
  logger.error(err, 'failed to start server');
  process.exit(1);
});
