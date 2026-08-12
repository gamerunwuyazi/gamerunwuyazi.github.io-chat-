import {
  createSession,
  verifySession,
  generatePOWChallenge,
  verifyPOWSolution
} from 'human-verify/backend';

export function setupVerifyRoutes(app) {
  // 1. 创建验证会话（1.1.2 起需要前端上报视口尺寸，后端按视口生成全屏透明挑战图）
  app.post('/api/verify/challenge', (req, res) => {
    try {
      const session = createSession({ viewport: req.body?.viewport });
      res.json(session);
    } catch (err) {
      console.error('创建验证会话失败:', err.message);
      res.status(500).json({ error: '创建验证会话失败' });
    }
  });

  // 2. 行为验证 + POW 挑战
  app.post('/api/verify/pow-challenge', (req, res) => {
    try {
      const { sessionId, encryptedData, threshold } = req.body;

      if (!sessionId || !encryptedData) {
        return res.status(400).json({ error: '缺少必要参数' });
      }

      const result = verifySession(sessionId, encryptedData, threshold || 50);

      if (!result.success) {
        return res.status(400).json({ error: result.error || '会话验证失败' });
      }

      if (!result.passed) {
        return res.json({
          passed: false,
          score: result.score,
          reason: result.reason || '行为验证未通过'
        });
      }

      const pow = generatePOWChallenge(sessionId);
      res.json({
        passed: true,
        score: result.score,
        token: result.token,
        pow
      });
    } catch (err) {
      console.error('POW 挑战生成失败:', err.message);
      res.status(500).json({ error: 'POW 挑战生成失败' });
    }
  });
}