// server.js - ShowcasePro (HTTP Validation Mode + CRUD Completo, Threads e Notificações In-App)

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
import ProductionOrder from './models/ProductionOrder.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 📂 DIAGNÓSTICO E SETUP ---
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

if (!fs.existsSync(PUBLIC_DIR)) console.error('❌ ERRO CRÍTICO: Pasta "public" não encontrada!');
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
    financeiroEmail: 'ativosswc@showcasepro.com.br',
    googleChatWebhook: [
         'https://chat.googleapis.com/v1/spaces/AAQAn3lW-gI/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=9S2SEYXgKXonAEtTPuTsz17wcL0-6WhwxwXWd0ouHFk'
    ]
};

const app = express();
const PORT = 3000;

// --- 🗺️ MODELO DE NOTIFICAÇÕES (IN-APP) ---
const NotificationSchema = new mongoose.Schema({
    id: { type: String, required: true },
    target: { type: String, required: true }, // 'T.I', 'Comercial', 'Todos', ou e-mail específico
    title: { type: String, required: true },
    message: { type: String },
    link: { type: String }, // Ex: 'orders/123'
    readBy: { type: [String], default: [] }, // E-mails de quem já leu
    createdAt: { type: Date, default: Date.now }
});
const NotificationModel = mongoose.model('Notification', NotificationSchema);

// --- MAPA DE COLEÇÕES ---
const models = {
    tasks: TaskModel,
    users: UserModel,
    rotines: RoutineModel,
    servers: Server,
    workflows: Workflow,
    options: Option,
    manuals: Manual,
    orders: ProductionOrder
};

// --- CONEXÃO MONGODB ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ShowcasePro';
mongoose.set('debug', false); // Desligado para não poluir o terminal

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ Conectado ao MongoDB');
        const adminExists = await UserModel.findOne({ email: 'swc' });
        if (!adminExists) {
            await UserModel.create({
                id: 'admin-id-fixed', name: 'Admin Showcase', email: 'swc', password: 'swc123', 
                role: 'Admin', initials: 'AD', color: 'bg-gray-900', history: [], userAction: 'System'
            });
        }
    })
    .catch(err => console.error('❌ Erro Fatal no MongoDB:', err));

// --- HELPERS ---
const saveBase64 = (str) => {
    if(!str || typeof str !== 'string') return str;
    // Agora aceita tanto Imagem quanto PDF
    if(str.startsWith('data:image') || str.startsWith('data:application/pdf')) {
        try {
            const mime = str.split(';')[0].split(':')[1];
            const ext = mime.split('/')[1]; 
            const data = str.split(',')[1];
            const name = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
            fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(data, 'base64'));
            return `/uploads/${name}`;
        } catch(e) { return null; }
    }
    return str;
};

const processImages = (d) => {
    if(!d || typeof d !== 'object') return d;
    if(Array.isArray(d)) return d.map(x => typeof x==='string' && (x.startsWith('data:image') || x.startsWith('data:application/pdf')) ? saveBase64(x) : processImages(x));

    for(let k in d) {
        // Agora procura por imagens E PDFs em qualquer lugar do objeto
        if (typeof d[k] === 'string' && (d[k].startsWith('data:image') || d[k].startsWith('data:application/pdf'))) {
            d[k] = saveBase64(d[k]);
        } else if(['server_photos','box_photos'].includes(k)) {
            d[k] = Array.isArray(d[k]) ? d[k].map(saveBase64).filter(x=>x) : d[k];
        } else if(typeof d[k] === 'object' && d[k] !== null) {
            if (!['steps', 'checklist', 'disks', 'cards', 'ram'].includes(k)) {
                processImages(d[k]);
            }
        }
    }
    return d;
}

const isBusinessDay = (dateStr) => {
    if(!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay();
    return day !== 0 && day !== 6;
};

// --- EMAIL & CHAT & IN-APP ---
const transporter = nodemailer.createTransport({
    host: CONFIG.email.host, port: CONFIG.email.port, secure: CONFIG.email.secure,
    auth: { user: CONFIG.email.user, pass: CONFIG.email.pass }
});

const sendToChat = async (textMessage, threadKey = null) => {
    if (!CONFIG.googleChatWebhook || !Array.isArray(CONFIG.googleChatWebhook)) return;
    
    const envios = CONFIG.googleChatWebhook.map(async (url) => {
        try {
            let fetchUrl = url;
            if (threadKey) {
                // Formata a chave para evitar caracteres que o Google odeie
                const safeKey = encodeURIComponent(threadKey.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50).toLowerCase());
                const separator = fetchUrl.includes('?') ? '&' : '?';
                fetchUrl += `${separator}messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD&threadKey=${safeKey}`;
            }
            
            let resp = await fetch(fetchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: textMessage }) });
            
            // Aqui é onde ensinamos o terminal a "falar" os erros HTTP do Google
            if (!resp.ok) {
                const errorText = await resp.text();
                console.error(`❌ Erro no Google Chat (Status ${resp.status}):`, errorText);
                
                // PLANO B: Se o Google recusar (Erro 400) por causa da Thread, tenta mandar como mensagem simples
                if (threadKey && resp.status === 400) {
                    console.log('🔄 Chat recusou a Thread. Tentando reenviar como mensagem avulsa...');
                    resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: textMessage }) });
                    
                    if (!resp.ok) console.error(`❌ Falha no Plano B do Chat:`, await resp.text());
                    else console.log('✅ Mensagem entregue ao Chat (Plano B concluído).');
                }
            } else {
                console.log('✅ Mensagem entregue ao Chat com sucesso.');
            }
        } catch (e) { 
            // Só cai aqui se a internet cair ou der timeout
            console.error(`❌ Falha de Rede ao contatar o Chat:`, e.message); 
        }
    });
    
    await Promise.all(envios);
};

// Nova Função para criar alertas no Sininho do Sistema
const sendInAppNotification = async (target, title, message, link = '') => {
    try {
        await NotificationModel.create({ id: uuidv4(), target, title, message, link, createdAt: new Date() });
    } catch (e) { console.error("❌ Erro In-App Notif:", e.message); }
};

// --- GERAÇÃO DE TAREFAS ---
const generateScheduledTasks = async (dateTarget) => {
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

    for (const routine of routinesToProcess) {
        const exists = await TaskModel.findOne({ dueDate: dateTarget, templateId: routine.id });
        if (!exists) {
            const stepsSafe = Array.isArray(routine.steps) ? routine.steps : [];
            await TaskModel.create({
                id: uuidv4(), title: routine.title, templateId: routine.id, dueDate: dateTarget, frequency: routine.frequency,
                status: 'Pendente', assignedTo: routine.assignedTo, history: [], createdAt: new Date(),
                checklist: stepsSafe.map(s => ({ step: s.title || s.step || "Item sem nome", manual: s.manual || "", completed: false }))
            });
        }
    }
};

const checkAndNotifyDelays = async () => {
    const today = new Date().toLocaleDateString('pt-BR').split('/').reverse().join('-');
    if (!isBusinessDay(today)) return;
    const pendingTasks = await TaskModel.find({ dueDate: today, status: { $ne: 'Concluído' }, isDeleted: { $ne: true } });
    if (pendingTasks.length > 0) {
        const taskList = pendingTasks.map(t => `• ${t.title} (Resp: ${t.assignedTo || 'T.I'})`).join('\n');
        sendToChat(`⚠️ *ALERTA DE PENDÊNCIAS* - ${today}\n\n${taskList}\n\nFavor regularizar.`);
        await sendInAppNotification('T.I', 'Pendências do Dia', `Existem ${pendingTasks.length} tarefas não concluídas hoje.`, 'rotom');
    }
};

// --- MIDDLEWARES ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

// --- ROTAS BÁSICAS ---
app.get('/', (req, res) => {
    if (fs.existsSync(INDEX_HTML)) res.sendFile(INDEX_HTML);
    else res.status(404).send('ERRO: index.html não encontrado.');
});

app.get('/api/logs', (req, res) => {
    const logPath = '/root/.pm2/logs/showcase-pro-out.log';
    if (fs.existsSync(logPath)) {
        try { res.send(fs.readFileSync(logPath, 'utf-8').split('\n').slice(-200).join('\n')); } 
        catch (e) { res.status(500).send(e.message); }
    } else { res.send("Logs não disponíveis."); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await UserModel.findOne({ email: email, password: password });
        if (user) res.json({ id: user.id, name: user.name, email: user.email, role: user.role, initials: user.initials, color: user.color });
        else res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API NOTIFICAÇÕES IN-APP ---
app.get('/api/notifications', async (req, res) => {
    try {
        const { email, role } = req.query;
        const limitDate = new Date(); limitDate.setDate(limitDate.getDate() - 7); 
        const roleMap = (role || '').toLowerCase();
        const targetRole = roleMap.includes('t.i') || roleMap.includes('admin') ? 'T.I' : 'Comercial';

        const list = await NotificationModel.find({
            createdAt: { $gte: limitDate },
            $or: [{ target: email }, { target: targetRole }, { target: 'Todos' }, { target: 'Admin' }]
        }).sort({ createdAt: -1 });
        
        res.json(list);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        await NotificationModel.findOneAndUpdate({ id: req.params.id }, { $addToSet: { readBy: req.body.email } });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- API CRUD GENÉRICA ---
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
                if(!d.createdAt) d.createdAt = new Date(); if(!d.status) d.status = 'Início'; delete d.userAction;
            }
            if(col === 'tasks' && !d.createdAt) d.createdAt = new Date();
            const newItem = await Model.create(d);

            if (col === 'orders' && newItem.linkedServerId) {
                await models.servers.findOneAndUpdate({ id: newItem.linkedServerId }, { $set: { client: newItem.client?.name || '', product: newItem.product?.description || '', purpose: newItem.contractType || '' } });
            }
            res.json(newItem);
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    app.put(`/api/${col}/:id`, async (req, res) => {
        try {
            let up = processImages(req.body); let updateObject = { ...up };
            let oldOrder = null; if (col === 'orders') oldOrder = await Model.findOne({ id: req.params.id });
            
            if (col === 'servers' && up.userAction) {
                const old = await Model.findOne({ id: req.params.id });
                if(!old) return res.status(404).json({ error: 'Not found' });
                let msg = up.status && up.status !== old.status ? `Status: ${up.status}` : 'Atualizado';
                updateObject.history = [{ msg, user: up.userAction, timestamp: new Date() }, ...(old.history || [])]; delete updateObject.userAction;
            }
            
            delete updateObject.id;
            const updated = await Model.findOneAndUpdate({ id: req.params.id }, { $set: updateObject }, { new: true });

            if (col === 'orders' && updated && updated.linkedServerId && updated.status !== 'Cancelado') {
                await models.servers.findOneAndUpdate({ id: updated.linkedServerId }, { $set: { client: updated.client?.name || '', product: updated.product?.description || '', purpose: updated.contractType || '' } });
                
                // GATILHO: SE A ORDEM ACABOU DE SER ATRELADA (Antes não tinha, agora tem)
                if (oldOrder && !oldOrder.linkedServerId) {
                    await sendInAppNotification('T.I', 'Servidor Atrelado!', `O Comercial vinculou o pedido de ${updated.client?.name} a uma máquina na bancada.`, `pokeball/${updated.linkedServerId}`);
                }
            }
            updated ? res.json(updated) : res.status(404).json({ error: 'Item not found' });
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    app.delete(`/api/${col}/:id`, async (req, res) => {
        try { await Model.deleteOne({ id: req.params.id }); res.json({}); } 
        catch(e) { res.status(500).json({ error: e.message }); }
    });
});

// --- ROTA DE NOTIFICAÇÃO HÍBRIDA (TAREFAS + SERVIDORES + ORDENS) ---
// --- ROTA DE NOTIFICAÇÃO HÍBRIDA (TAREFAS + SERVIDORES + ORDENS) ---
app.post('/api/notify', async (req, res) => {
    try {
        if (req.body.type === 'order_created') {
            const { client, product, contractType, services, observations, requester, requesterEmail, emails, isLinked, orderId } = req.body;
            const destList = [...new Set([CONFIG.financeiroEmail || 'ativosswc@showcasepro.com.br', CONFIG.emailDestino, ...(emails || [])])].filter(e=>e).join(', ');
            let addr = {}; try { addr = typeof client.address === 'string' ? JSON.parse(client.address) : client.address; } catch(e) {}

            const cleanName = (str) => (str || '').replace(/[\/\\:*?"<>|]/g, '').trim();
            const safeProduct = cleanName(product.description) || 'Produto'; const safeClient = cleanName(client.name) || 'Cliente';
            
            // CRIA UM ID ÚNICO E VISUAL PARA SEPARAR AS THREADS
            const shortId = orderId ? orderId.split('-')[0].toUpperCase() : crypto.randomBytes(3).toString('hex').toUpperCase();
            const threadSubject = `[Pedido #${shortId}] SAÍDA: ${safeProduct} - ${safeClient}`;
            const threadHash = crypto.createHash('md5').update(orderId || threadSubject).digest('hex'); 
            const customMessageId = `<${threadHash}@showcasepro.system>`;

            let msg = `🚀 *NOVA SOLICITAÇÃO DE MONTAGEM*\n\n👤 *Solicitante:* ${requester}\n🏢 *Cliente:* ${client.name}\n📑 *CNPJ/CPF:* ${client.cnpj} ${client.ie ? ' | *I.E:* ' + client.ie : ''}\n📞 *Contato:* ${client.contactName} - ${client.contactPhone}\n📧 *E-mail do Cliente:* ${client.contactEmail || 'Não informado'}\n📍 *Endereço:* ${addr.street || ''}, ${addr.number || ''} - ${addr.city || ''}/${addr.state || ''} (CEP: ${addr.cep || ''})\n\n📦 *EQUIPAMENTO:*\n- Produto: ${product.description}\n`;
            
            if (product.configuration) msg += `- Detalhes/Obs: ${product.configuration}\n`;
            msg += `\n📝 *CONTRATO:* ${contractType}\n`; if (services && services.length > 0) msg += `\n🛠️ *SERVIÇOS ADICIONAIS:*\n- ${services.join('\n- ')}\n`; if (observations) msg += `\n📌 *OBSERVAÇÕES GERAIS:*\n${observations}\n`;
            msg += `\n⚙️ *STATUS:* ${isLinked ? 'Já em bancada (Atrelado pela TI)' : 'Aguardando Início (T.I)'}\n\nShowCase PRO`;

            await sendInAppNotification('T.I', 'Nova Solicitação', `O Comercial solicitou a montagem de um ${safeProduct} para ${safeClient}.`, 'orders');
            await sendToChat(msg, threadSubject);
            if(destList) { await transporter.sendMail({ from: `"ShowCase PRO" <${CONFIG.email.user}>`, to: destList, replyTo: requesterEmail, subject: threadSubject, messageId: customMessageId, text: msg }); }
            return res.json({ success: true });
        }

        if (req.body.type === 'server_dispatch') {
            const { hostname, pdf, user, details, client, fullClient, model, serial, product, disks, ram, cards, orderEmails, clientContactEmail, packageInfo, orderId } = req.body;
            const cleanName = (str) => (str || '').replace(/[\/\\:*?"<>|]/g, '').trim(); const safeProduct = cleanName(product) || 'Produto'; const clientName = fullClient && fullClient.name ? fullClient.name : client; const safeClient = cleanName(clientName) || 'Cliente';
            
            // USA O MESMO ID ÚNICO PARA RESPONDER NA THREAD CERTA
            const shortId = orderId ? orderId.split('-')[0].toUpperCase() : crypto.randomBytes(3).toString('hex').toUpperCase();
            const threadSubject = `[Pedido #${shortId}] SAÍDA: ${safeProduct} - ${safeClient}`; 
            const threadHash = crypto.createHash('md5').update(orderId || threadSubject).digest('hex'); 
            const customMessageId = `<${threadHash}@showcasepro.system>`;
            const pdfFileName = `${safeProduct} - ${safeClient}.pdf`; 

            let bodyContent = '';
            if (fullClient) {
                let addr = {}; try { addr = typeof fullClient.address === 'string' ? JSON.parse(fullClient.address) : (fullClient.address || {}); } catch(e) {}
                bodyContent += `Cliente: ${fullClient.name || client || ''}\nCNPJ: ${fullClient.cnpj || ''} ${fullClient.ie ? '- IE: ' + fullClient.ie : ''}\nAos cuidados de: ${fullClient.contactName || ''} - ${fullClient.contactPhone || ''}\nEndereço: ${`${addr.street || ''}, ${addr.number || 'S/N'} - ${addr.city || ''} ${addr.state || ''}`.trim().replace(/^, /, '').replace(/ - $/, '').toUpperCase()}\nCEP: ${addr.cep || ''}\n`;
            } else { bodyContent += `Cliente: ${client || ''}\n`; }
            
            bodyContent += `Equipamento: ${product || ''}\n\n-------------------------------------------------\n🛠️ DETALHES TÉCNICOS:\n- Servidor ${model || 'Modelo N/A'}, S/N: ${serial || 'N/A'}\n`;
            if (disks && Array.isArray(disks)) disks.forEach(d => bodyContent += `- SSD/Disco ${d.model || ''}, S/N: ${d.serial || 'N/A'}\n`); if (ram && Array.isArray(ram)) ram.forEach(m => bodyContent += `- Memória RAM ${m.model || ''}, S/N: ${m.serial || 'N/A'}\n`); if (cards && Array.isArray(cards)) cards.forEach(c => bodyContent += `- ${c.type || 'Placa'} ${c.model || ''}, S/N: ${c.serial || 'N/A'}\n`);
            bodyContent += `\n👤 Técnico Responsável: ${user}\n📋 Obs: ${details || '-'}`;
            
            if (packageInfo) {
                bodyContent += `\n\n📦 DADOS PARA EXPEDIÇÃO E N.F.:\n`;
                if (packageInfo.deliveryMode && packageInfo.deliveryDate) {
                    const fDate = packageInfo.deliveryDate.split('-').reverse().join('/');
                    bodyContent += `- Modo de Entrega: ${packageInfo.deliveryMode}\n`;
                    bodyContent += `- Data Prevista: ${fDate}\n`;
                }
                bodyContent += `- Dimensões: ${packageInfo.length}cm (C) x ${packageInfo.width}cm (L) x ${packageInfo.depth}cm (A)\n`;
                bodyContent += `- Peso Bruto: ${packageInfo.weight} kg\n`;
            }

            let pdfDownloadLink = '';
            if (pdf) { try { const base64Data = pdf.split(',')[1]; const urlSafeName = `Laudo_${Date.now()}_${safeClient.replace(/\s+/g, '')}.pdf`; fs.writeFileSync(path.join(UPLOADS_DIR, urlSafeName), Buffer.from(base64Data, 'base64')); pdfDownloadLink = `\n\n📄 *Baixar Laudo (PDF):* http://localhost:3000/uploads/${urlSafeName}`; } catch(e) { } }

            await sendInAppNotification('Comercial', 'Equipamento Finalizado', `A T.I gerou o laudo final para ${safeClient}.`, 'status');
            await sendToChat(`*${threadSubject}*\n\n${bodyContent}${pdfDownloadLink}`, threadSubject); 
            const destInternal = [...new Set([CONFIG.financeiroEmail, CONFIG.emailDestino, ...(orderEmails || [])])].filter(e=>e).join(', ');
            
            if (pdf && destInternal) { await transporter.sendMail({ from: `"ShowCase PRO" <${CONFIG.email.user}>`, to: destInternal, subject: `Re: ${threadSubject}`, inReplyTo: customMessageId, references: [customMessageId], text: bodyContent, attachments: [{ filename: pdfFileName, content: Buffer.from(pdf.split(',')[1], 'base64') }] }); }
            //if (clientContactEmail && clientContactEmail.trim() !== "") { await transporter.sendMail({ from: `"ShowCase PRO" <${CONFIG.email.user}>`, to: clientContactEmail, subject: `Expedição de Equipamento - ShowCase PRO`, text: `Olá,\n\nO equipamento ${product || ''} da ${clientName || ''} acaba de ser expedido pela nossa equipe técnica.\n\nAtenciosamente,\nEquipe ShowCase PRO` }); }
            return res.json({ success: true });
        }
        
        if (req.body.type === 'order_canceled') {
            const { client, product, requester, requesterEmail, emails, orderId } = req.body;
            const destList = [...new Set([CONFIG.financeiroEmail || 'ativosswc@showcasepro.com.br', CONFIG.emailDestino, ...(emails || [])])].filter(e=>e).join(', ');
            const cleanName = (str) => (str || '').replace(/[\/\\:*?"<>|]/g, '').trim(); const safeProduct = cleanName(product) || 'Produto'; const safeClient = cleanName(client) || 'Cliente';
            const shortId = orderId ? orderId.split('-')[0].toUpperCase() : crypto.randomBytes(3).toString('hex').toUpperCase();
            const threadSubject = `[Pedido #${shortId}] SAÍDA: ${safeProduct} - ${safeClient}`;
            const threadHash = crypto.createHash('md5').update(orderId || threadSubject).digest('hex'); const customMessageId = `<${threadHash}@showcasepro.system>`;
            
            let msg = `❌ *SOLICITAÇÃO CANCELADA / EXCLUÍDA*\n\nA solicitação para o cliente *${safeClient}* (Equipamento: ${safeProduct}) acabou de ser CANCELADA por ${requester}.\n\nFavor desconsiderar a montagem e o faturamento desta ordem.\n\nShowCase PRO`;

            await sendInAppNotification('T.I', 'Solicitação Cancelada', `A ordem de ${safeClient} foi excluída.`, 'orders');
            await sendToChat(msg, threadSubject);
            if(destList) { await transporter.sendMail({ from: `"ShowCase PRO" <${CONFIG.email.user}>`, to: destList, replyTo: requesterEmail, subject: `Re: ${threadSubject}`, inReplyTo: customMessageId, references: [customMessageId], text: msg }); }
            return res.json({ success: true });
        }

        if (req.body.type === 'task') {
            const { title, user, date, frequency, checklist } = req.body;
            let msg = `🎉 *ATIVIDADE CONCLUÍDA*\n\n📌 *Tarefa:* ${title}\n👤 *Responsável:* ${user}\n📅 *Data:* ${date}\n`; if(frequency) msg += `🔁 *Tipo:* ${frequency}\n`;
            if (checklist && Array.isArray(checklist) && checklist.length > 0) { msg += `\n📋 *Checklist Realizado:*\n`; checklist.forEach(item => { msg += `${item.completed ? '✅' : '⬜'} ${item.step}\n`; }); }
            msg += `\nShowCase PRO`;

            await sendInAppNotification('Todos', 'Tarefa Concluída', `${user} concluiu: ${title}`, 'rotom');
            await sendToChat(msg); await transporter.sendMail({ from: `"ShowCase PRO" <${CONFIG.email.user}>`, to: CONFIG.emailDestino, subject: `Tarefa Concluída: ${title}`, text: msg });
            return res.json({ success: true });
        }

        if (req.body.type === 'server_created_manual') {
            const { client, product, purpose, user, orderId } = req.body;
            const destList = [...new Set([CONFIG.financeiroEmail || 'ativosswc@showcasepro.com.br'])].filter(e=>e).join(', ');
            const cleanName = (str) => (str || '').replace(/[\/\\:*?"<>|]/g, '').trim(); const safeProduct = cleanName(product) || 'Produto'; const safeClient = cleanName(client) || 'Cliente';
            const shortId = orderId ? orderId.split('-')[0].toUpperCase() : crypto.randomBytes(3).toString('hex').toUpperCase();
            const threadSubject = `⚠️ T.I NA BANCADA [Ref #${shortId}] - ${safeClient}`; 
            const threadHash = crypto.createHash('md5').update(orderId || threadSubject).digest('hex'); const customMessageId = `<${threadHash}@showcasepro.system>`;
            
            let msg = `⚠️ *MONTAGEM INICIADA SEM SOLICITAÇÃO COMERCIAL*\n\nA equipe de T.I (*${user}*) iniciou a montagem de um novo equipamento diretamente na bancada.\n\n🏢 *Cliente:* ${client || 'N/A'}\n📦 *Produto:* ${product || 'N/A'}\n📝 *Finalidade:* ${purpose || 'N/A'}\n\n📌 *Atenção:* Verifiquem se há necessidade de formalizar a Solicitação no sistema.\n\nShowCase PRO`;

            await sendInAppNotification('Comercial', '⚠️ Montagem Avulsa', `A T.I iniciou um servidor na bancada sem pedido atrelado.`, 'status');
            await sendToChat(msg, threadSubject);
            if(destList) { await transporter.sendMail({ from: `"ShowCase PRO" <${CONFIG.email.user}>`, to: destList, subject: threadSubject, messageId: customMessageId, text: msg }); }
            return res.json({ success: true });
        }

    } catch (error) { console.error("Erro na notificação:", error); res.json({ success: false, error: error.message }); }
});

// ROBÔ DE VERIFICAÇÃO DE NOTAS FISCAIS (CICLO DE 60 DIAS - DEMONSTRAÇÃO)
const checkDemonstracaoNF = async () => {
    try {
        const ProductionOrder = mongoose.model('ProductionOrder');
        // Busca todas as ordens de "Demonstração" que já tem NF e ainda não foram notificadas
        const orders = await ProductionOrder.find({ 
            contractType: { $regex: /Demonstra/i }, 
            status: 'Concluído', 
            nfNumber: { $exists: true, $ne: null },
            nfNotified55: false 
        }).populate('client');

        const today = new Date();

        for (let o of orders) {
            // Calcula a diferença de dias desde a criação do pedido (ou da anexação)
            const diffTime = Math.abs(today - o.createdAt);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays >= 55) {
                const msg = `⚠️ *ALERTA DE VENCIMENTO DE N.F. (DEMONSTRAÇÃO)*\n\nO equipamento do cliente *${o.client?.name || 'Cliente'}* completou ${diffDays} dias em Demonstração.\nA Nota Fiscal atual (${o.nfNumber}) vencerá em breve (Ciclo de 60 dias).\n\nPor favor, providencie o retorno do equipamento ou a substituição/faturamento da N.F.\n\nShowCase PRO`;
                
                // Avisa no Chat e manda E-mail pro Financeiro
                await sendToChat(msg, `⚠️ N.F. Vencendo - ${o.client?.name}`);
                await transporter.sendMail({
                    from: `"ShowCase PRO" <${CONFIG.email.user}>`,
                    to: CONFIG.financeiroEmail || CONFIG.emailDestino,
                    subject: `⚠️ Alerta de N.F. a Vencer (Demonstração) - ${o.client?.name}`,
                    text: msg
                });

                // Salva no banco que já avisou para não mandar de novo amanhã
                o.nfNotified55 = true;
                await o.save();
                console.log(`✅ Aviso de 55 dias enviado para a N.F. ${o.nfNumber}`);
            }
        }
    } catch (e) { console.error('❌ Erro no Robô de N.F:', e.message); }
};

// Roda a verificação assim que o servidor liga, e depois repete a cada 12 horas
setTimeout(checkDemonstracaoNF, 10000); 
setInterval(checkDemonstracaoNF, 12 * 60 * 60 * 1000);

setInterval(() => {
    const now = new Date();
    if (now.getHours() === 6 && now.getMinutes() === 0) generateScheduledTasks(now.toLocaleDateString('pt-BR').split('/').reverse().join('-'));
    if (now.getHours() === 16 && now.getMinutes() === 0) checkAndNotifyDelays();
}, 60000);

app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Server HTTP V61 (Notificações Integradas) Rodando na porta ${PORT}`); });