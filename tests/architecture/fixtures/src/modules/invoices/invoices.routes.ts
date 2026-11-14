// VIOLATION: a module receives configuration through its deps, it never imports config.
import { config } from '@config/index';

export const routesConfig = config;
