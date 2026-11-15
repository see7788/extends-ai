import { Hono } from 'hono';
import configTomlRouter from './config-toml.js';

export default new Hono().route('/', configTomlRouter);
