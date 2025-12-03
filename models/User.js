import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  email: String,
  password: String, // Considere usar bcrypt no futuro!
  role: String,
  initials: String,
  color: String,
  history: [],
  userAction: String
});

export default mongoose.model('users', UserSchema);