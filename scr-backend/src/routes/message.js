import { sendMessage, getOfflineMessages, deleteDeletedSession } from '../services/messageService.js';

export function setupRoutes(app, io) {
  app.post('/api/send-message', (req, res) => {
    sendMessage(req, res);
  });

  app.get('/api/offline-messages', (req, res) => {
    getOfflineMessages(req, res);
  });

  app.post('/api/delete-deleted-session', (req, res) => {
    deleteDeletedSession(req, res);
  });
}
