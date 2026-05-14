import {
  getGroupById,
  uploadGroupAvatar,
  createGroup,
  getUserGroups,
  getAvailableGroupMembers,
  getGroupInfo,
  getGroupMembers,
  removeGroupMember,
  setGroupAdmin,
  addGroupMembers,
  generateGroupToken,
  validateGroupToken,
  joinGroupWithToken,
  leaveGroup,
  dissolveGroup,
  updateGroupName,
  updateGroupDescription,
  muteGroupMember,
  unmuteGroupMember,
  setMuteAll,
  getMuteStatus
} from '../services/groupService.js';

export function setupRoutes(app, io) {
  app.get('/api/group/:id', (req, res) => {
    getGroupById(req, res);
  });

  app.post('/api/upload-group-avatar/:groupId', (req, res) => {
    uploadGroupAvatar(req, res);
  });

  app.post('/api/create-group', (req, res) => {
    createGroup(req, res);
  });

  app.get('/api/user-groups/:userId', (req, res) => {
    getUserGroups(req, res);
  });

  app.get('/api/available-group-members/:groupId', (req, res) => {
    getAvailableGroupMembers(req, res);
  });

  app.get('/api/group-info/:groupId', (req, res) => {
    getGroupInfo(req, res);
  });

  app.get('/api/group-members/:groupId', (req, res) => {
    getGroupMembers(req, res);
  });

  app.post('/api/remove-group-member', (req, res) => {
    removeGroupMember(req, res);
  });

  app.post('/api/set-group-admin', (req, res) => {
    setGroupAdmin(req, res);
  });

  app.post('/api/add-group-members', (req, res) => {
    addGroupMembers(req, res);
  });

  app.post('/api/generate-group-token', (req, res) => {
    generateGroupToken(req, res);
  });

  app.get('/api/validate-group-token/:token', (req, res) => {
    validateGroupToken(req, res);
  });

  app.post('/api/join-group-with-token', (req, res) => {
    joinGroupWithToken(req, res);
  });

  app.post('/api/leave-group', (req, res) => {
    leaveGroup(req, res);
  });

  app.post('/api/dissolve-group', (req, res) => {
    dissolveGroup(req, res);
  });

  app.post('/api/update-group-name', (req, res) => {
    updateGroupName(req, res);
  });

  app.post('/api/update-group-description', (req, res) => {
    updateGroupDescription(req, res);
  });

  app.post('/api/mute-group-member', (req, res) => {
    muteGroupMember(req, res);
  });

  app.post('/api/unmute-group-member', (req, res) => {
    unmuteGroupMember(req, res);
  });

  app.post('/api/set-mute-all', (req, res) => {
    setMuteAll(req, res);
  });

  app.get('/api/mute-status/:groupId', (req, res) => {
    getMuteStatus(req, res);
  });
}
