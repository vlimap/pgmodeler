const User = require('./User');
const Project = require('./Project');
const Feedback = require('./Feedback');

User.hasMany(Project, {
  foreignKey: 'userId',
  as: 'projects',
  onDelete: 'CASCADE',
});

Project.belongsTo(User, {
  foreignKey: 'userId',
  as: 'owner',
});

User.hasMany(Feedback, {
  foreignKey: 'userId',
  as: 'feedback',
  onDelete: 'SET NULL',
});

Feedback.belongsTo(User, {
  foreignKey: 'userId',
  as: 'author',
});

module.exports = {
  User,
  Project,
  Feedback,
};
