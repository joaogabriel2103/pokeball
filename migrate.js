import fs from 'fs';
import mongoose from 'mongoose';
import TaskModel from './models/Task.js';
import UserModel from './models/User.js';
import RoutineModel from './models/Routine.js';
import { Server, Workflow, Option, Manual } from './models/Generic.js';

// --- Configuração ---
const MONGO_URI = 'mongodb://localhost:27017/ShowcasePro';
const DB_FILE_PATH = './data/db.json';

// Conecte ao banco
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB.'))
    .catch(err => {
        console.error('❌ Erro na conexão com MongoDB:', err);
        process.exit(1);
    });

const data = JSON.parse(fs.readFileSync(DB_FILE_PATH, 'utf-8'));

// Mapa dos nomes das coleções no JSON para os Modelos Mongoose
const collectionsMap = {
    users: UserModel,
    tasks: TaskModel,
    rotines: RoutineModel,
    servers: Server,
    workflows: Workflow,
    options: Option,
    manuals: Manual
};

const migrate = async () => {
    console.log("--- Iniciando migração de substituição ---");

    for (const [key, Model] of Object.entries(collectionsMap)) {
        if (data[key]) {
            console.log(`Limpando coleção: ${key}...`);
            // 1. LIMPA A COLEÇÃO EXISTENTE (DELETE MANY)
            await Model.deleteMany({});
            
            console.log(`Inserindo ${data[key].length} documentos em ${key}...`);
            // 2. INSERE OS NOVOS DADOS DO JSON
            await Model.insertMany(data[key]);
            console.log(`✅ Coleção ${key} atualizada.`);
        } else {
            console.log(`⚠️ Aviso: A chave "${key}" não foi encontrada no db.json ou está vazia.`);
        }
    }
    
    console.log("--- Migração de substituição concluída! ---");
    process.exit(0);
};

migrate();