// models/Routine.js
import mongoose from 'mongoose';

const RoutineSchema = new mongoose.Schema({
    // 🔥 CORREÇÃO: ID manual obrigatório
    id: { type: String, required: true, unique: true },
    
    title: { type: String, required: true },
    frequency: String,
    
    // 🔥 CORREÇÃO: Aceita array de usuários
    assignedTo: { type: mongoose.Schema.Types.Mixed, required: true },
    
    // Normalização dos passos (steps)
    steps: [{
        title: String, 
        step: String, // O front as vezes envia 'step', as vezes 'title'
        manual: String
    }],
    
    createdAt: { type: Date, default: Date.now }
}, { strict: false });

export default mongoose.model('Routine', RoutineSchema);