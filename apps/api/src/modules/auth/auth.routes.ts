import { Router } from 'express';
import { RegisterInput, LoginInput } from '@medlink/shared';
import { validate } from '../../middleware/validate';
import { registerHandler, loginHandler } from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', validate(RegisterInput), registerHandler);
authRouter.post('/login', validate(LoginInput), loginHandler);
