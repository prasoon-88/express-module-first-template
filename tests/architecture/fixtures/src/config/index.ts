// VIOLATION: config is a leaf and imports nothing from the application.
import { leaked } from '@shared/lib/leaky';

export const config = { leaked };
