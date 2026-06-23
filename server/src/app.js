import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorMiddleware } from './middleware/error.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
if (env.NODE_ENV === 'development') app.use(morgan('dev'));

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many requests, please try again later' },
  })
);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// import router from './routes/index.js';
// app.use('/api', router);

app.use(errorMiddleware);

export default app;
