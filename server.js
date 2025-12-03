// server.js - ShowcasePro V44 (MongoDB Migration)
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; 
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer'; 
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Importação dos Modelos
import TaskModel from './models/Task.js';
import UserModel from './models/User.js';
import RoutineModel from './models/Routine.js';
import { Server, Workflow, Option, Manual } from './models/Generic.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 📂 DIAGNÓSTICO E SETUP ---
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

if (!fs.existsSync(PUBLIC_DIR)) console.error('❌ ERRO: Pasta "public" não encontrada!');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- ⚙️ CONFIGURAÇÕES ---
const CONFIG = {
    email: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        user: 'alertas@showcasepro.com.br', 
        pass: 'cafe iysx tkwj obny' 
    },
    emailDestino: 'jgoncalves@showcasepro.com.br', 
    googleChatWebhook: 'https://chat.googleapis.com/v1/spaces/AAQAASwfdZU/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=lIV_dz3W8AqVLDSZ69TNC6w_Srmj3CA-AgHTpI2SAvM'
};

const app = express();
const PORT = 3000;

// --- 🗺️ MAPA DE COLEÇÕES PARA MODELOS ---
// Isso permite manter suas rotas genéricas funcionando!
const models = {
    tasks: TaskModel,
    users: UserModel,
    rotines: RoutineModel,
    servers: Server,
    workflows: Workflow,
    options: Option,
    manuals: Manual
};

// --- CONEXÃO MONGODB ---
// Substitua pela sua string de conexão ou use variável de ambiente (recomendado)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ShowcasePro';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB'))
    .catch(err => console.error('❌ Erro no MongoDB:', err));

// --- HELPERS ---
const saveBase64 = (str) => {
    if(!str || typeof str !== 'string' || !str.startsWith('data:image')) return str;
    try {
        const ext = str.split(';')[0].split('/')[1];
        const data = str.split(',')[1];
        const name = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(data, 'base64'));
        return `/uploads/${name}`;
    } catch(e) { return null; }
};

const processImages = (d) => {
    if(!d || typeof d !== 'object') return d;
    // Se for array, processa cada item
    if(Array.isArray(d)) return d.map(x => typeof x==='string' && x.startsWith('data:image') ? saveBase64(x) : processImages(x));
    
    // Processamento recursivo de objetos
    // Mongoose objects tem método .toObject(), mas aqui estamos lidando com o body da request (POJO)
    for(let k in d) {
        if(['server_photos','box_photos'].includes(k)) {
            d[k] = Array.isArray(d[k]) ? d[k].map(saveBase64).filter(x=>x) : d[k];
        } else if(typeof d[k] === 'object') {
            processImages(d[k]);
        }
    }
    return d;
};

const isBusinessDay = (dateStr) => {
    if(!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay();
    return day !== 0 && day !== 6; 
};

// --- EMAIL & CHAT ---
const transporter = nodemailer.createTransport({
    host: CONFIG.email.host, port: CONFIG.email.port, secure: CONFIG.email.secure,
    auth: { user: CONFIG.email.user, pass: CONFIG.email.pass }
});

const sendToChat = async (textMessage) => {
    if (!CONFIG.googleChatWebhook) return;
    try {
        const resp = await fetch(CONFIG.googleChatWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textMessage })
        });
        if (!resp.ok) console.error(`❌ Erro Chat: ${await resp.text()}`);
    } catch (e) { console.error('❌ Falha Conexão Chat:', e.message); }
};

// --- LÓGICA DE NEGÓCIO ---

const sendSuccessNotification = async (task, user) => {
    const today = new Date().toLocaleDateString('pt-BR');
    const checklistDetails = (task.checklist || []).map(item => `✅ ${item.step}`).join('\n');

    const richMessage = `🎉 *ATIVIDADE CONCLUÍDA*\n\n📌 *Tarefa:* ${task.title}\n👤 *Responsável:* ${user || 'Não identificado'}\n📅 *Data:* ${today}\n🔁 *Tipo:* ${task.frequency || 'Única'}\n\n📋 *Checklist Realizado:*\n${checklistDetails || 'Nenhum sub-item.'}\n\nShowCase PRO`;

    sendToChat(richMessage);
    try {
        await transporter.sendMail({
            from: `"ShowCase PRO Alertas" <${CONFIG.email.user}>`,
            to: CONFIG.emailDestino,
            subject: `✅ [CONCLUÍDO] ${task.title}`,
            text: richMessage
        });
    } catch (e) { console.error('Erro envio email sucesso:', e); }
};

const checkAndNotifyDelays = async () => {
    const now = new Date();
    const today = now.toLocaleDateString('pt-BR').split('/').reverse().join('-');

    if (!isBusinessDay(today)) return;

    // Busca tasks pendentes no Mongo
    const pendingTasks = await TaskModel.find({
        dueDate: today,
        status: { $ne: 'Concluído' }
    });

    if (pendingTasks.length > 0) {
        console.log(`⚠️ [16:00] Cobrando ${pendingTasks.length} tarefas pendentes.`);
        const taskList = pendingTasks.map(t => `• ${t.title} (Resp: ${t.assignedTo || 'T.I'})`).join('\n');
        const alertMsg = `⚠️ *ALERTA DE PENDÊNCIAS* - ${today}\n\nAs seguintes atividades agendadas para HOJE ainda não foram finalizadas:\n\n${taskList}\n\nFavor regularizar imediatamente.`;

        sendToChat(alertMsg);
        // ... (código de email igual ao original)
    }
};

const generateScheduledTasks = async (dateTarget) => {
    if (!isBusinessDay(dateTarget)) return; 
    
    const dateObj = new Date(dateTarget + 'T00:00:00');
    const dayOfWeek = dateObj.getDay(); 
    const isMonday = dayOfWeek === 1; 
    const isFirstOfMonth = dateTarget.endsWith('-01'); 

    // Busca rotinas no Mongo
    const rotines = await RoutineModel.find({});
    
    const routinesToProcess = rotines.filter(r => {
        if (r.frequency === 'Diária') return true;
        if (r.frequency === 'Semanal' && isMonday) return true;
        if (r.frequency === 'Mensal' && isFirstOfMonth) return true;
        return false;
    });

    let count = 0;
    for (const routine of routinesToProcess) {
        // Verifica duplicidade no Mongo
        const exists = await TaskModel.findOne({ dueDate: dateTarget, templateId: routine.id });
        
        if (!exists) {
            await TaskModel.create({
                id: uuidv4(),
                title: routine.title,
                templateId: routine.id,
                dueDate: dateTarget,
                frequency: routine.frequency,
                status: 'Pendente',
                assignedTo: routine.assignedTo,
                checklist: (routine.steps || []).map(s => ({ 
                    step: s.title || s.step, 
                    manual: s.manual, 
                    completed: false 
                })),
                history: [],
                createdAt: new Date()
            });
            count++;
        }
    }

    if (count > 0) console.log(`✅ Geradas ${count} novas tarefas para ${dateTarget}`);
};

// --- MIDDLEWARES ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

// Removemos o middleware que lia o lowdb a cada requisição
// O MongoDB gerencia a conexão persistentemente

// --- ROTAS ---

app.get('/', (req, res) => {
    if (fs.existsSync(INDEX_HTML)) res.sendFile(INDEX_HTML);
    else res.status(404).send('ERRO: index.html não encontrado.');
});

app.post('/api/notify', async (req, res) => {
    // ... (Código original da notificação pode ser mantido igual)
    // Apenas copiei a lógica original aqui por brevidade, ela não depende do DB
    const { hostname, pdf, user, details, specs } = req.body;
    const msg = `✅ *Entrega de Servidor Finalizada*\n\n${specs || ''}\n\n👤 *Responsável:* ${user}\n📋 *Obs:* ${details || '-'}`;
    try {
        sendToChat(msg);
        if (pdf) {
            await transporter.sendMail({
                from: `"ShowCase PRO Alertas" <${CONFIG.email.user}>`,
                to: CONFIG.emailDestino,
                subject: `[Entrega] ${hostname}`,
                text: msg,
                attachments: [{ filename: `Relatorio_${hostname}.pdf`, content: Buffer.from(pdf.split(',')[1], 'base64') }]
            });
        }
        res.json({ success: true });
    } catch (error) { res.json({ success: false, error: error.message }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Busca no Mongo. Usamos regex para simular o split('@') do código original se necessário,
        // ou buscamos diretamente.
        // Adaptando a lógica original: (x.email === email || x.email.split('@')[0] === email)
        const users = await UserModel.find({}); 
        const u = users.find(x => (x.email === email || x.email.split('@')[0] === email) && x.password === password);
        
        u ? res.json(u) : res.status(401).json({ error: 'Inválido' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tasks/:id/status', async (req, res) => {
    try {
        const t = await TaskModel.findOne({ id: req.params.id });
        if(t) { 
            const oldStatus = t.status;
            t.status = req.body.status;
            if (req.body.status === 'Concluído' && oldStatus !== 'Concluído') {
                sendSuccessNotification(t, req.body.userAction);
            }
            await t.save(); 
            res.json(t); 
        } else res.status(404).json({});
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tasks/:id/step', async (req, res) => {
    try {
        const t = await TaskModel.findOne({ id: req.params.id });
        if(t && t.checklist[req.body.stepIndex]) { 
            t.checklist[req.body.stepIndex].completed = req.body.completed;
            // Mongoose array change detection as vezes precisa disso:
            t.markModified('checklist'); 
            await t.save(); 
            res.json(t); 
        } else res.status(404).json({});
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- ROTAS GENÉRICAS (CRUD UNIVERSAL ADAPTADO) ---
Object.keys(models).forEach(col => {
    const Model = models[col];

    app.get(`/api/${col}`, async (req, res) => {
        try {
            let query = {};
            if (col === 'tasks' && req.query.date) {
                if (isBusinessDay(req.query.date)) await generateScheduledTasks(req.query.date); 
                query.dueDate = req.query.date;
            }
            const list = await Model.find(query);
            res.json(list);
        } catch(e) { res.status(500).json({ error: e.message }); }
    });
    
    app.get(`/api/${col}/:id`, async (req, res) => {
        try {
            const item = await Model.findOne({ id: req.params.id });
            item ? res.json(item) : res.status(404).json({ error: 'Item not found' });
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    app.post(`/api/${col}`, async (req, res) => {
        try {
            let d = processImages(req.body); 
            d.id = uuidv4(); // Mantém ID UUID
            
            if(col === 'servers') { 
                d.history = []; 
                if(!d.createdAt) d.createdAt = new Date(); 
                if(!d.status) d.status = 'Início'; 
            }
            if(col === 'tasks' && !d.createdAt) d.createdAt = new Date();

            const newItem = await Model.create(d);
            res.json(newItem);
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    app.put(`/api/${col}/:id`, async (req, res) => {
        try {
            // Primeiro busca o antigo para lógica de histórico
            const old = await Model.findOne({ id: req.params.id });
            if(!old) return res.status(404).json({ error: 'Not found' });

            let up = processImages(req.body);
            
            // Lógica de Histórico de Servidores
            if (col === 'servers' && up.userAction) {
                let msg = up.status && up.status !== old.status ? `Status: ${up.status}` : 'Atualizado';
                // push no início do array (unshift equivalent)
                up.history = [{ msg, user: up.userAction, timestamp: new Date() }, ...(old.history || [])];
                delete up.userAction;
            }

            // Atualiza
            const updated = await Model.findOneAndUpdate({ id: req.params.id }, up, { new: true });
            res.json(updated);
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    app.delete(`/api/${col}/:id`, async (req, res) => {
        try {
            await Model.deleteOne({ id: req.params.id });
            res.json({});
        } catch(e) { res.status(500).json({ error: e.message }); }
    });
});

// --- AGENDADOR ---
// Mantido igual, apenas roda no init do server
setInterval(() => {
    const now = new Date();
    if (now.getHours() === 6 && now.getMinutes() === 0) {
        const today = now.toLocaleDateString('pt-BR').split('/').reverse().join('-');
        console.log('⏰ Cron: Verificando rotinas...');
        generateScheduledTasks(today);
    }
    if (now.getHours() === 16 && now.getMinutes() === 0) {
        checkAndNotifyDelays();
    }
    // Backup de arquivo JSON não é mais necessário com MongoDB,
    // mas se quiser manter dumps do Mongo, seria outro comando (mongodump).
}, 60000);

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server V44 (MongoDB) Rodando na porta ${PORT}`));