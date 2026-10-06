import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { openDatabase } from './db/connection.js';

export function createApp({ db, dbPath } = {}) {
  const app = express();
  app.locals.db = db || openDatabase(dbPath);

  app.use(cors());
  app.use(express.json({ limit: '4mb' }));

  // API Routes
  app.use('/api', routes);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'online',
      project: 'Smart SD-WAN Network Optimizer',
      version: '1.2.0',
      timestamp: new Date().toISOString()
    });
  });

  // Malformed JSON bodies and anything else that slips through
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: status === 400 ? 'The request body is not valid JSON.' : 'Unexpected server error.'
    });
  });

  return app;
}
