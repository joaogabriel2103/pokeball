// server.js - ShowcasePro V50 (HTTPS PROD MODE)
// Atualizado com Notificações Híbridas (Tarefas + Servidores) e HTTPS Ativo

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
import https from 'https'; // HTTPS Mantido

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

if (!fs.existsSync(PUBLIC_DIR)) console.error('❌ ERRO CRÍTICO: Pasta "public" não encontrada!');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- 🔒 CONFIGURAÇÃO HTTPS ---
const httpsOptions = {
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
};

// --- ⚙️ CONFIGURAÇÕES ---
const CONFIG = {
    email: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        user: 'alertas@showcasepro.com.br',
        pass: 'cafe iysx tkwj obny'
    },
    emailDestino: 'ti@showcasepro.com.br',
    googleChatWebhook: [
         'https://chat.googleapis.com/v1/spaces/AAQAn3lW-gI/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=9S2SEYXgKXonAEtTPuTsz17wcL0-6WhwxwXWd0ouHFk', 'https://chat.googleapis.com/v1/spaces/AAQAASwfdZU/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=lIV_dz3W8AqVLDSZ69TNC6w_Srmj3CA-AgHTpI2SAvM']};

const app = express();
const PORT = 3000;

// --- 🗺️ MAPA DE COLEÇÕES PARA MODELOS ---
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
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ShowcasePro';
mongoose.set('debug', true);

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB (Debug Mode Ativo)'))
    .catch(err => console.error('❌ Erro Fatal no MongoDB:', err));

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
    if(Array.isArray(d)) return d.map(x => typeof x==='string' && x.startsWith('data:image') ? saveBase64(x) : processImages(x));

    for(let k in d) {
        if(['server_photos','box_photos'].includes(k)) {
            d[k] = Array.isArray(d[k]) ? d[k].map(saveBase64).filter(x=>x) : d[k];
        } else if(typeof d[k] === 'object' && d[k] !== null) {
            if (!['steps', 'checklist', 'disks', 'cards', 'ram'].includes(k)) {
                processImages(d[k]);
            }
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
    // Verifica se existe o array e se ele não está vazio
    if (!CONFIG.googleChatWebhook || !Array.isArray(CONFIG.googleChatWebhook)) return;

    // Criamos uma lista de tarefas (promessas) de envio
    const envios = CONFIG.googleChatWebhook.map(async (url) => {
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textMessage })
            });
            
            if (!resp.ok) {
                console.error(`❌ Erro Chat em ${url}: ${await resp.text()}`);
            } else {
                console.log(`✅ Mensagem enviada com sucesso para: ${url}`);
            }
        } catch (e) {
            console.error(`❌ Falha Conexão Chat em ${url}:`, e.message);
        }
    });

    // Executa todos os envios simultaneamente
    await Promise.all(envios);
};

// --- GERAÇÃO DE TAREFAS AGENDADAS ---
const generateScheduledTasks = async (dateTarget) => {
    console.log(`📅 [CRON] Verificando tarefas para: ${dateTarget}`);
    if (!isBusinessDay(dateTarget)) return;

    const dateObj = new Date(dateTarget + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();
    const isMonday = dayOfWeek === 1;
    const isFirstOfMonth = dateTarget.endsWith('-01');

    const rotines = await RoutineModel.find({});

    const routinesToProcess = rotines.filter(r => {
        if (r.frequency === 'Diária') return true;
        if (r.frequency === 'Semanal' && isMonday) return true;
        if (r.frequency === 'Mensal' && isFirstOfMonth) return true;
        return false;
    });

    let count = 0;
    for (const routine of routinesToProcess) {
        const exists = await TaskModel.findOne({ dueDate: dateTarget, templateId: routine.id });

        if (!exists) {
            console.log(`➕ [CRON] Gerando tarefa: ${routine.title}`);
            const stepsSafe = Array.isArray(routine.steps) ? routine.steps : [];

            await TaskModel.create({
                id: uuidv4(),
                title: routine.title,
                templateId: routine.id,
                dueDate: dateTarget,
                frequency: routine.frequency,
                status: 'Pendente',
                assignedTo: routine.assignedTo,
                checklist: stepsSafe.map(s => ({
                    step: s.title || s.step || "Item sem nome",
                    manual: s.manual || "",
                    completed: false
                })),
                history: [],
                createdAt: new Date()
            });
            count++;
        }
    }
    if (count > 0) console.log(`✅ [CRON] Total gerado: ${count}`);
};

const checkAndNotifyDelays = async () => {
    const now = new Date();
    const today = now.toLocaleDateString('pt-BR').split('/').reverse().join('-');
    if (!isBusinessDay(today)) return;

    const pendingTasks = await TaskModel.find({ dueDate: today, status: { $ne: 'Concluído' } });

    if (pendingTasks.length > 0) {
        console.log(`⚠️ [ALERTA] ${pendingTasks.length} tarefas pendentes.`);
        const taskList = pendingTasks.map(t => `• ${t.title} (Resp: ${t.assignedTo || 'T.I'})`).join('\n');
        sendToChat(`⚠️ *ALERTA DE PENDÊNCIAS* - ${today}\n\n${taskList}\n\nFavor regularizar.`);
    }
};

// --- MIDDLEWARES ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// LOGGER
app.use((req, res, next) => {
    console.log(`\n📨 [REQ] ${req.method} ${req.url}`);
    if (['POST', 'PUT'].includes(req.method)) {
        const safeBody = JSON.stringify(req.body, (key, value) => {
            if (typeof value === 'string' && value.length > 200) return `[STRING LONGA ${value.length} chars]`;
            return value;
        }, 2);
        console.log(`📦 [BODY]: ${safeBody}`);
    }
    next();
});

app.use(express.static(PUBLIC_DIR));

// --- ROTAS BÁSICAS ---
app.get('/', (req, res) => {
    if (fs.existsSync(INDEX_HTML)) res.sendFile(INDEX_HTML);
    else res.status(404).send('ERRO: index.html não encontrado.');
});

app.get('/api/logs', (req, res) => {
    const logPath = '/root/.pm2/logs/showcase-pro-out.log';
    if (fs.existsSync(logPath)) {
        try {
            const logs = fs.readFileSync(logPath, 'utf-8');
            const lines = logs.split('\n').slice(-200).join('\n');
            res.send(lines);
        } catch (e) { res.status(500).send(e.message); }
    } else {
        res.send("Logs de arquivo não disponíveis. Verifique o console do servidor.");
    }
});

// --- API CRUD ---
app.delete('/api/options/:id', async (req, res) => {
    try {
        const option = await Option.findOne({ id: req.params.id });
        if (!option) return res.status(404).json({ error: 'Opção não encontrada' });
        if (option.type === 'purpose') {
            await Workflow.deleteOne({ purpose: option.value });
        }
        await Option.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/workflows/:purpose', async (req, res) => {
    try {
        const { purpose } = req.params;
        const { steps } = req.body;
        let workflow = await Workflow.findOne({ purpose: purpose });
        if (workflow) {
            workflow.steps = steps;
            await workflow.save();
        } else {
            workflow = await Workflow.create({ id: uuidv4(), purpose: purpose, steps: steps });
        }
        res.json(workflow);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await UserModel.findOne({ email: email, password: password });
        if (user) {
            res.json(user);
        } else {
            res.status(401).json({ error: 'Usuário ou senha incorretos' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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
            d.id = uuidv4();
            if(col === 'servers') {
                d.history = [{ msg: `Criado por ${d.userAction}`, user: d.userAction, timestamp: new Date() }];
                if(!d.createdAt) d.createdAt = new Date();
                if(!d.status) d.status = 'Início';
                delete d.userAction;
            }
            if(col === 'tasks' && !d.createdAt) d.createdAt = new Date();
            const newItem = await Model.create(d);
            res.json(newItem);
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    app.put(`/api/${col}/:id`, async (req, res) => {
        try {
            let up = processImages(req.body);
            let updateObject = { ...up };
            if (col === 'servers' && up.userAction) {
                const old = await Model.findOne({ id: req.params.id });
                if(!old) return res.status(404).json({ error: 'Not found' });
                let msg = up.status && up.status !== old.status ? `Status: ${up.status}` : 'Atualizado';
                updateObject.history = [{ msg, user: up.userAction, timestamp: new Date() }, ...(old.history || [])];
                delete updateObject.userAction;
            }
            delete updateObject.id;
            const updated = await Model.findOneAndUpdate({ id: req.params.id }, { $set: updateObject }, { new: true });
            updated ? res.json(updated) : res.status(404).json({ error: 'Item not found' });
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    app.delete(`/api/${col}/:id`, async (req, res) => {
        try {
            await Model.deleteOne({ id: req.params.id });
            res.json({});
        } catch(e) { res.status(500).json({ error: e.message }); }
    });
});

// --- Rota de Notificação HÍBRIDA (TAREFAS + SERVIDORES) ---
// --- Rota de Notificação HÍBRIDA (TAREFAS + SERVIDORES) ---
// Ajustada para nomear o PDF como "Produto - Cliente.pdf"
// --- Rota de Notificação HÍBRIDA (TAREFAS + SERVIDORES) ---
// Ajustada: Nome do PDF (Produto - Cliente) e Lista de Placas (Tipo + Modelo)
app.post('/api/notify', async (req, res) => {
    try {
        // CASO 1: Notificação de TAREFA
        if (req.body.type === 'task') {
            const { title, user, date, frequency, checklist } = req.body;

            let msg = `🎉 *ATIVIDADE CONCLUÍDA*\n\n`;
            msg += `📌 *Tarefa:* ${title}\n`;
            msg += `👤 *Responsável:* ${user}\n`;
            msg += `📅 *Data:* ${date}\n`;
            if(frequency) msg += `🔁 *Tipo:* ${frequency}\n`;

            if (checklist && Array.isArray(checklist) && checklist.length > 0) {
                msg += `\n📋 *Checklist Realizado:*\n`;
                checklist.forEach(item => {
                    const icon = item.completed ? '✅' : '⬜';
                    msg += `${icon} ${item.step}\n`;
                });
            }
            msg += `\nShowCase PRO`;

            await sendToChat(msg);
            await transporter.sendMail({
                from: `"ShowCase PRO" <${CONFIG.email.user}>`,
                to: CONFIG.emailDestino,
                subject: `Tarefa Concluída: ${title}`,
                text: msg
            });
            return res.json({ success: true });
        }

        // CASO 2: Notificação de SERVIDOR (Relatório)
        const {
            hostname, pdf, user, details,
            client, model, serial, product,
            disks, ram, cards
        } = req.body;

        const titleText = `Saída de Equipamento [${product || 'Produto'} - ${client || 'Cliente'}]`;

        // --- LOGICA DE NOME DO ARQUIVO PDF ---
        const cleanName = (str) => (str || '').replace(/[\/\\:*?"<>|]/g, '').trim();
        const safeProduct = cleanName(product) || 'Produto';
        const safeClient = cleanName(client) || 'Cliente';
        const pdfFileName = `${safeProduct} - ${safeClient}.pdf`;
        // ----------------------------------------

        let bodyContent = `✅ *SAÍDA DE EQUIPAMENTO REGISTRADA*\n\n`;
        bodyContent += `${product || 'Equipamento'}:\n`;
        bodyContent += `- Servidor ${model || 'Modelo N/A'}, S/N: ${serial || 'N/A'}\n`;

        // Discos
        if (disks && Array.isArray(disks) && disks.length > 0) {
            disks.forEach(d => {
                bodyContent += `- SSD/Disco ${d.model || ''}, S/N: ${d.serial || 'N/A'}\n`;
            });
        }

        // Memória RAM
        if (ram && Array.isArray(ram) && ram.length > 0) {
            ram.forEach(m => {
                bodyContent += `- Memória RAM ${m.model || ''}, S/N: ${m.serial || 'N/A'}\n`;
            });
        }

        // Placas de Expansão (CORRIGIDO AQUI)
        if (cards && Array.isArray(cards) && cards.length > 0) {
            cards.forEach(c => {
                // Agora usa o TIPO (c.type) em vez de "Expansão" fixo
                bodyContent += `- ${c.type || 'Placa'} ${c.model || ''}, S/N: ${c.serial || 'N/A'}\n`;
            });
        }

        bodyContent += `\n👤 *Técnico Responsável:* ${user}\n📋 *Obs:* ${details || '-'}`;

        const chatMsg = `*${titleText}*\n\n${bodyContent}`;
        sendToChat(chatMsg);

        if (pdf) {
            await transporter.sendMail({
                from: `"ShowCase PRO" <${CONFIG.email.user}>`,
                to: CONFIG.emailDestino,
                subject: titleText,
                text: bodyContent,
                attachments: [{
                    filename: pdfFileName,
                    content: Buffer.from(pdf.split(',')[1], 'base64')
                }]
            });
        }
        res.json({ success: true });

    } catch (error) {
        console.error("Erro no envio:", error);
        res.json({ success: false, error: error.message });
    }
});

// --- CRON JOBS ---
setInterval(() => {
    const now = new Date();
    if (now.getHours() === 6 && now.getMinutes() === 0) {
        const today = now.toLocaleDateString('pt-BR').split('/').reverse().join('-');
        generateScheduledTasks(today);
    }
    if (now.getHours() === 16 && now.getMinutes() === 0) {
        checkAndNotifyDelays();
    }
}, 60000);

// --- INICIALIZAÇÃO HTTPS ---
https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`🔒 Server HTTPS V50 (PROD MODE) Rodando na porta ${PORT}`);
});