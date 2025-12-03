import mongoose from 'mongoose';

const RoutineSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  frequency: String,
  assignedTo: { type: [String], default: [] }, // MUDA: de String para Array de Strings  steps: [mongoose.Schema.Types.Mixed] // Ou defina a estrutura exata se souber
});

export default mongoose.model('rotines', RoutineSchema);