import { setupRoutes as setupHealthRoutes } from './health.js';
import { setupRoutes as setupAdminRoutes } from './admin.js';
import { setupRoutes as setupUserRoutes } from './user.js';
import { setupRoutes as setupFriendRoutes } from './friend.js';
import { setupRoutes as setupGroupRoutes } from './group.js';
import { setupRoutes as setupMessageRoutes } from './message.js';
import { setupRoutes as setupFileRoutes } from './file.js';

export function setupAllRoutes(app, io) {
  setupHealthRoutes(app, io);
  setupAdminRoutes(app, io);
  setupFriendRoutes(app, io);
  setupUserRoutes(app, io);
  setupGroupRoutes(app, io);
  setupMessageRoutes(app, io);
  setupFileRoutes(app, io);
}
