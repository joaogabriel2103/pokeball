// server.js - ShowcasePro V43 (Flexible Login & Daily Focus)
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Low, JSONFile } from 'lowdb'; 
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; 
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 📂 DIAGNÓSTICO DE INICIALIZAÇÃO ---
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');

console.log('------------------------------------------------');
if (fs.existsSync(PUBLIC_DIR)) console.log('✅ Pasta "public" encontrada.');
else console.error('❌ ERRO: Pasta "public" não encontrada!');
console.log('------------------------------------------------');

// --- ⚙️ CONFIGURAÇÕES (COM SEUS DADOS) ---
const CONFIG = {
    email: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        user: 'alertas@showcasepro.com.br', 
        pass: 'cafe iysx tkwj obny' 
    },
    emailDestino: 'jgoncalves@showcasepro.com.br', 
    // Seu Webhook exato:
    googleChatWebhook: 'https://chat.googleapis.com/v1/spaces/AAQAASwfdZU/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=lIV_dz3W8AqVLDSZ69TNC6w_Srmj3CA-AgHTpI2SAvM'
};

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(__dirname, 'backups'); 
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

[DATA_DIR, BACKUP_DIR, UPLOADS_DIR].forEach(d => { if(!fs.existsSync(d)) fs.mkdirSync(d, {recursive:true}); });

const adapter = new JSONFile(DB_FILE);
const db = new Low(adapter);

// --- HELPERS DE ARQUIVO ---
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
        if(['server_photos','box_photos'].includes(k)) d[k] = Array.isArray(d[k]) ? d[k].map(saveBase64).filter(x=>x) : d[k];
        else if(typeof d[k] === 'object') processImages(d[k]);
    }
    return d;
};

// --- HELPERS DE DATA ---
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

// Função Centralizada de Chat com DEBUG
const sendToChat = async (textMessage) => {
    if (!CONFIG.googleChatWebhook) return;
    
    console.log('💬 Tentando enviar para Google Chat...');
    try {
        const resp = await fetch(CONFIG.googleChatWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textMessage })
        });

        if (!resp.ok) {
            // Se der erro (400, 404, etc), lê o corpo da resposta
            const errBody = await resp.text();
            console.error(`❌ Erro Google Chat [Status ${resp.status}]:`, errBody);
        } else {
            console.log('✅ Google Chat enviado com sucesso.');
        }
    } catch (e) {
        console.error('❌ Falha de Conexão com Google Chat:', e.message);
    }
};

// --- LÓGICA DE NEGÓCIO ---

// 1. Envio Imediato (Ao Concluir) - COM DETALHES
const sendSuccessNotification = async (task, user) => {
    const today = new Date().toLocaleDateString('pt-BR');
    
    // Monta lista de itens feitos
    const checklistDetails = (task.checklist || [])
        .map(item => `✅ ${item.step}`)
        .join('\n');

    const richMessage = 
`🎉 *ATIVIDADE CONCLUÍDA*

📌 *Tarefa:* ${task.title}
👤 *Responsável:* ${user || 'Não identificado'}
📅 *Data:* ${today}
🔁 *Tipo:* ${task.frequency || 'Única'}

📋 *Checklist Realizado:*
${checklistDetails || 'Nenhum sub-item.'}

_Sistema ShowcasePro_`;

    // 1. Envia Chat
    sendToChat(richMessage);

    // 2. Envia Email
    try {
        await transporter.sendMail({
            from: `"Showcase System" <${CONFIG.email.user}>`,
            to: CONFIG.emailDestino,
            subject: `✅ [CONCLUÍDO] ${task.title}`,
            text: richMessage
        });
    } catch (e) { console.error('Erro envio sucesso email:', e); }
};

// 2. Cobrança de Atrasos (Às 16:00)
const checkAndNotifyDelays = async () => {
    const now = new Date();
    const today = now.toLocaleDateString('pt-BR').split('/').reverse().join('-');

    if (!isBusinessDay(today)) return;

    await db.read();
    const tasks = db.data.tasks || [];

    const pendingTasks = tasks.filter(t => 
        t.dueDate === today && 
        t.status !== 'Concluído'
    );

    if (pendingTasks.length > 0) {
        console.log(`⚠️ [16:00] Cobrando ${pendingTasks.length} tarefas pendentes.`);
        
        const taskList = pendingTasks.map(t => `• ${t.title} (Resp: ${t.assignedTo || 'T.I'})`).join('\n');
        const alertMsg = `⚠️ *ALERTA DE PENDÊNCIAS* - ${today}\n\nAs seguintes atividades agendadas para HOJE ainda não foram finalizadas:\n\n${taskList}\n\nFavor regularizar imediatamente.`;

        sendToChat(alertMsg);

        try {
            await transporter.sendMail({
                from: `"Showcase System" <${CONFIG.email.user}>`,
                to: CONFIG.emailDestino,
                subject: `⚠️ [ALERTA] Pendências do dia - ${today}`,
                text: alertMsg
            });
        } catch (e) { console.error('Erro envio cobrança:', e); }
    }
};

// 3. Gerador de Rotinas (Diária, Semanal, Mensal)
const generateScheduledTasks = async (dateTarget) => {
    if (!isBusinessDay(dateTarget)) return; 
    
    await db.read();
    db.data ||= { servers:[], users:[], workflows:[], options:[], rotines:[], tasks:[], manuals:[] };

    // Analisa data para saber qual tipo de rotina gerar
    const dateObj = new Date(dateTarget + 'T00:00:00');
    const dayOfWeek = dateObj.getDay(); // 0=Dom, 1=Seg...
    const isMonday = dayOfWeek === 1; // 1 = Segunda-feira
    const isFirstOfMonth = dateTarget.endsWith('-01'); // Dia 01

    let count = 0;

    // Filtra rotinas ativas
    const routinesToProcess = (db.data.rotines || []).filter(r => {
        if (r.frequency === 'Diária') return true;
        if (r.frequency === 'Semanal' && isMonday) return true;
        if (r.frequency === 'Mensal' && isFirstOfMonth) return true;
        return false;
    });

    routinesToProcess.forEach(routine => {
        // Evita duplicidade: verifica se já existe tarefa dessa rotina para esta data
        const exists = (db.data.tasks || []).find(t => t.dueDate === dateTarget && t.templateId === routine.id);
        
        if (!exists) {
            db.data.tasks.push({
                id: uuidv4(),
                title: routine.title,
                templateId: routine.id,
                dueDate: dateTarget,
                frequency: routine.frequency,
                status: 'Pendente',
                assignedTo: routine.assignedTo,
                checklist: (routine.steps || routine.template || []).map(s => ({ 
                    step: s.title || s.step, 
                    manual: s.manual, 
                    completed: false 
                })),
                history: [],
                createdAt: new Date().toISOString()
            });
            count++;
        }
    });

    if (count > 0) {
        await db.write();
        console.log(`✅ Geradas ${count} novas tarefas para ${dateTarget}`);
    }
};

// --- MIDDLEWARES ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
    if (fs.existsSync(INDEX_HTML)) res.sendFile(INDEX_HTML);
    else res.status(404).send('ERRO: index.html não encontrado na pasta public.');
});

app.use(async (req,res,next) => { 
    await db.read(); 
    db.data ||= { servers:[], users:[], workflows:[], options:[], rotines:[], tasks:[], manuals:[] }; 
    next(); 
});

// --- AGENDADOR ---
setInterval(() => {
    const now = new Date();
    if (now.getHours() === 6 && now.getMinutes() === 0) {
        const today = now.toLocaleDateString('pt-BR').split('/').reverse().join('-');
        console.log('⏰ Cron: Verificando rotinas agendadas...');
        generateScheduledTasks(today);
    }
    if (now.getHours() === 16 && now.getMinutes() === 0) {
        checkAndNotifyDelays();
    }
    if (now.getHours() === 23 && now.getMinutes() === 59) {
        const ts = now.toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `db-backup-${ts}.json`));
    }
}, 60000);

// --- API ROUTES ---

app.post('/api/notify', async (req, res) => {
    const { hostname, pdf, user, details, specs } = req.body;
    
    const msg = `✅ *Entrega de Servidor Finalizada*\n\n` +
                `${specs || ''}\n\n` +
                `👤 *Responsável:* ${user}\n` +
                `📋 *Obs:* ${details || '-'}`;

    try {
        sendToChat(msg); // Usa a função centralizada

        if (pdf) {
            await transporter.sendMail({
                from: `"Showcase System" <${CONFIG.email.user}>`,
                to: CONFIG.emailDestino,
                subject: `[Entrega] ${hostname}`,
                text: msg,
                attachments: [{ filename: `Relatorio_${hostname}.pdf`, content: Buffer.from(pdf.split(',')[1], 'base64') }]
            });
        }
        res.json({ success: true });
    } catch (error) { res.json({ success: false, error: error.message }); }
});

// --- ROTA DE LOGIN ATUALIZADA ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    // Verifica se o email do banco bate OU se o prefixo (antes do @) bate
    const u = db.data.users.find(x => 
        (x.email === email || x.email.split('@')[0] === email) && 
        x.password === password
    );
    u ? res.json(u) : res.status(401).json({ error: 'Inválido' });
});

// Rota de Status (Trigger de Notificação Completa)
app.put('/api/tasks/:id/status', async (req, res) => {
    const t = db.data.tasks.find(x => x.id === req.params.id);
    if(t) { 
        const oldStatus = t.status;
        t.status = req.body.status;
        if (req.body.status === 'Concluído' && oldStatus !== 'Concluído') {
            sendSuccessNotification(t, req.body.userAction);
        }
        await db.write(); res.json(t); 
    } else res.status(404).json({});
});

app.put('/api/tasks/:id/step', async (req, res) => {
    const t = db.data.tasks.find(x => x.id === req.params.id);
    if(t && t.checklist[req.body.stepIndex]) { 
        t.checklist[req.body.stepIndex].completed = req.body.completed; 
        await db.write(); res.json(t); 
    } else res.status(404).json({});
});

// ROTAS GENÉRICAS (CRUD UNIVERSAL)
['rotines', 'users', 'manuals', 'options', 'workflows', 'servers', 'tasks'].forEach(col => {
    app.get(`/api/${col}`, (req, res) => {
        let list = db.data[col] || [];
        if (col === 'tasks' && req.query.date) {
             // Garante que a rotina do dia foi gerada antes de retornar a lista
             if (isBusinessDay(req.query.date)) generateScheduledTasks(req.query.date).then(()=>{}); 
             list = list.filter(t => t.dueDate === req.query.date);
        }
        res.json(list);
    });
    
    app.get(`/api/${col}/:id`, (req, res) => {
        const item = (db.data[col] || []).find(x => x.id === req.params.id);
        item ? res.json(item) : res.status(404).json({ error: 'Item not found' });
    });

    app.post(`/api/${col}`, async (req, res) => {
        let d = processImages(req.body); d.id = uuidv4(); 
        if(col === 'servers') { d.history = []; d.createdAt = new Date().toISOString(); if(!d.status) d.status = 'Início'; }
        if(col === 'tasks' && !d.createdAt) d.createdAt = new Date().toISOString();
        db.data[col].push(d); await db.write(); res.json(d);
    });

    app.put(`/api/${col}/:id`, async (req, res) => {
        const idx = db.data[col].findIndex(x => x.id === req.params.id);
        if(idx === -1) return res.status(404).json({ error: 'Not found' });
        let up = processImages(req.body);
        const old = db.data[col][idx];
        if (col === 'servers' && up.userAction) {
            let msg = up.status && up.status !== old.status ? `Status: ${up.status}` : 'Atualizado';
            if(!old.history) old.history = [];
            old.history.unshift({ msg, user: up.userAction, timestamp: new Date().toISOString() });
            delete up.userAction;
        }
        db.data[col][idx] = { ...old, ...up }; await db.write(); res.json(db.data[col][idx]);
    });

    app.delete(`/api/${col}/:id`, async (req, res) => {
        const i = db.data[col].findIndex(x => x.id === req.params.id);
        if(i > -1) { db.data[col].splice(i, 1); await db.write(); }
        res.json({});
    });
});

const init = async () => {
    await db.read();
    db.data ||= {servers:[], users:[], workflows:[], options:[], rotines:[], tasks:[], manuals:[]};
    await db.write();
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server V43 Rodando na porta ${PORT}`));
};
init();