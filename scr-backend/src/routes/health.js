export function setupRoutes(app, io) {
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'success',
      message: 'Server is running',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/session-check', async (req, res) => {
    const userId = req.userId;

    if (!userId) {
      return res.json({
        status: 'success',
        authenticated: false,
        message: 'No active session'
      });
    }

    res.json({
      status: 'success',
      authenticated: true,
      userId: userId,
      timestamp: new Date().toISOString()
    });
  });
}
