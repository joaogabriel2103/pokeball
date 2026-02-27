// models/Task.js
import mongoose from 'mongoose';

const TaskSchema = new mongoose.Schema({
    // 🔥 CORREÇÃO: Define 'id' explicitamente para aceitar o UUID do server.js
    id: { type: String, required: true, unique: true },
    
    title: { type: String, required: true },
    
    // 🔥 CORREÇÃO: Mixed permite aceitar tanto String quanto Array (checkboxes do front)
    assignedTo: { type: mongoose.Schema.Types.Mixed, required: true },
    
    dueDate: String,
    frequency: String,
    status: { type: String, default: 'Pendente' },
    
    // Estrutura do checklist baseada no seu front-end
    checklist: [{
        step: String,
        manual: String,
        completed: { type: Boolean, default: false }
    }],
    
    notes: String,
    templateId: String,
    
    history: [{
        msg: String,
        user: String,
        timestamp: Date
    }],
    
    createdAt: { type: Date, default: Date.now }
}, { strict: false }); // Permite salvar campos extras se o front mudar

export default mongoose.model('Task', TaskSchema);