import mongoose from 'mongoose';

const TaskSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // Mantém compatibilidade UUID
  title: String,
  templateId: String,
  dueDate: String, // Mantive String (YYYY-MM-DD) para compatibilidade com sua lógica isBusinessDay
  frequency: String,
  status: { type: String, default: 'Pendente' },
  assignedTo: { type: [String], default: []},
  notes: { type: String, default: ''},
  checklist: [{
    step: String,
    manual: String,
    completed: { type: Boolean, default: false }
  }],
  history: [mongoose.Schema.Types.Mixed],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('tasks', TaskSchema); // 'tasks' força o nome da coleção