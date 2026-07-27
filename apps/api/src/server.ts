import 'dotenv/config';
import { createApp } from './app';
import { connectDB } from './lib/db';
import { logger } from './lib/logger';

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  await connectDB(process.env.MONGO_URI ?? 'mongodb://localhost:27017/medlink');
  const app = createApp();
  app.listen(PORT, () => logger.info(`api listening on ${PORT}`));
}

main().catch((err) => {
  logger.error(err, 'failed to start server');
  process.exit(1);
});
