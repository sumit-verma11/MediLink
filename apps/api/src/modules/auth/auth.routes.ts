import { Router } from 'express';
import { RegisterInput, LoginInput } from '@medlink/shared';
import { validate } from '../../middleware/validate';
import { registerHandler, loginHandler, refreshHandler, logoutHandler } from './auth.controller';
import { authLimiter } from '../../middleware/rateLimit';

export const authRouter = Router();
authRouter.use(authLimiter);

authRouter.post('/register', validate(RegisterInput), registerHandler);
authRouter.post('/login', validate(LoginInput), loginHandler);
authRouter.post('/refresh', refreshHandler);
authRouter.post('/logout', logoutHandler);
