// server.js - ShowcasePro V29 (Final Completo & Formatado)
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Low, JSONFile } from 'lowdb'; // Importação correta v3
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; 
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ⚙️ CONFIGURAÇÕES (PREENCHA SEUS DADOS) ---
const CONFIG = {
    email: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true para porta 465, false para outras
        user: 'alertas@showcasepro.com.br', 
        pass: 'cafe iysx tkwj obny' 
    },
    emailDestino: 'jgoncalves@showcasepro.com.br', 
    googleChatWebhook: 'https://chat.googleapis.com/v1/spaces/AAQAASwfdZU/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=lIV_dz3W8AqVLDSZ69TNC6w_Srmj3CA-AgHTpI2SAvM' // Cole seu Webhook aqui
};

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

// Garante diretórios
[DATA_DIR, PUBLIC_DIR, UPLOADS_DIR].forEach(d => { if(!fs.existsSync(d)) fs.mkdirSync(d, {recursive:true}); });

// Inicializa Banco
const adapter = new JSONFile(DB_FILE);
const db = new Low(adapter);

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
        if(['server_photos','box_photos'].includes(k)) d[k] = Array.isArray(d[k]) ? d[k].map(saveBase64).filter(x=>x) : d[k];
        else if(typeof d[k] === 'object') processImages(d[k]);
    }
    return d;
};

const transporter = nodemailer.createTransport({
    host: CONFIG.email.host, port: CONFIG.email.port, secure: CONFIG.email.secure,
    auth: { user: CONFIG.email.user, pass: CONFIG.email.pass }
});

// --- MIDDLEWARES ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

// Middleware: Garante DB carregado
app.use(async (req,res,next) => { 
    if(!db.data) { 
        await db.read(); 
        db.data ||= { servers:[], users:[], workflows:[], options:[], rotines:[], tasks:[], manuals:[] }; 
    } 
    next(); 
});

// --- ROTA DE NOTIFICAÇÃO (FORMATADA) ---
app.post('/api/notify', async (req, res) => {
    const { hostname, status, pdf, user, details, specs } = req.body;

    console.log(`🔔 Notificando: ${hostname}`);

    try {
        // 1. Google Chat (Texto puro com quebras de linha)
        if (CONFIG.googleChatWebhook) {
            const chatText = `✅ *Entrega Finalizada*\n\n` +
                             `${specs || ''}\n\n` + // AQUI ENTRA SEU TEXTO FORMATADO
                             `👤 *Responsável:* ${user}\n` +
                             `📋 *Obs:* ${details || '-'}`;
            
            await fetch(CONFIG.googleChatWebhook, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ text: chatText })
            });
        }

        // 2. E-mail (Texto simples preservando quebras de linha)
        if (pdf) {
            const emailBody = `RELATÓRIO DE ENTREGA\n\n` +
                              `${specs || ''}\n\n` + // TEXTO FORMATADO IGUAL AO CHAT
                              `-----------------------------------\n` +
                              `Responsável: ${user}\n` +
                              `Observações: ${details || 'Nenhuma'}\n\n` +
                              `O relatório técnico completo segue em anexo.`;

            await transporter.sendMail({
                from: `"Showcase System" <${CONFIG.email.user}>`,
                to: CONFIG.emailDestino,
                subject: `[Entrega] ${hostname}`,
                text: emailBody, // Usa 'text' para preservar formatação exata
                attachments: [{ filename: `Relatorio_${hostname}.pdf`, content: Buffer.from(pdf.split(',')[1], 'base64') }]
            });
        }

        res.json({ success: true });
    } catch (error) { 
        console.error('Erro envio:', error);
        res.json({ success: false, error: error.message }); 
    }
});

// --- ROTAS DE DADOS ---

// SERVIDORES
app.get('/api/servers', (req,res) => res.json(db.data.servers || []));
app.get('/api/servers/:id', (req,res) => { const s = db.data.servers.find(x => x.id === req.params.id); s ? res.json(s) : res.status(404).json({}); });
app.post('/api/servers', async (req,res) => {
    let d = processImages(req.body); d.id = uuidv4(); d.history = []; d.createdAt = new Date().toISOString(); if(!d.status) d.status = 'Início';
    db.data.servers.push(d); await db.write(); res.json(d);
});
app.put('/api/servers/:id', async (req,res) => {
    const idx = db.data.servers.findIndex(x => x.id === req.params.id); if(idx === -1) return res.status(404).json({});
    let up = processImages(req.body); const old = db.data.servers[idx];
    let msg = 'Atualizado'; if(up.status && up.status !== old.status) msg = `Status: ${up.status}`;
    if(!old.history) old.history = []; old.history.unshift({ msg, user: up.userAction||'Sistema', timestamp: new Date().toISOString() });
    delete up.userAction; db.data.servers[idx] = { ...old, ...up }; await db.write(); res.json(db.data.servers[idx]);
});
app.delete('/api/servers/:id', async (req, res) => { const i = db.data.servers.findIndex(x => x.id === req.params.id); if(i > -1) { db.data.servers.splice(i, 1); await db.write(); } res.json({}); });

// TAREFAS (Com filtro de data restaurado)
app.get('/api/tasks', (req, res) => {
    const { date } = req.query;
    let list = db.data.tasks || [];
    if (date) list = list.filter(t => t.dueDate === date);
    res.json(list);
});
app.put('/api/tasks/:id/step', async (req, res) => {
    const t = db.data.tasks.find(x => x.id === req.params.id);
    if(t && t.checklist[req.body.stepIndex]) {
        t.checklist[req.body.stepIndex].completed = req.body.completed;
        await db.write(); res.json(t);
    } else res.status(404).json({});
});
app.put('/api/tasks/:id/status', async (req, res) => {
    const t = db.data.tasks.find(x => x.id === req.params.id);
    if(t) { t.status = req.body.status; await db.write(); res.json(t); } else res.status(404).json({});
});

// OUTROS (Rotinas, Users, Manuais) - Restaurados individualmente
['rotines', 'users', 'manuals', 'options', 'workflows'].forEach(col => {
    app.get(`/api/${col}`, (req, res) => res.json(db.data[col] || []));
    
    app.post(`/api/${col}`, async (req, res) => {
        const d = { id: uuidv4(), ...req.body };
        db.data[col].push(d); await db.write(); res.json(d);
    });
    
    app.delete(`/api/${col}/:id`, async (req, res) => {
        const i = db.data[col].findIndex(x => x.id === req.params.id);
        if(i > -1) { db.data[col].splice(i, 1); await db.write(); }
        res.json({});
    });
});

// Rota específica de Update Workflows (importante para o editor)
app.put('/api/workflows/:purpose', async (req,res) => {
    const idx = db.data.workflows.findIndex(w => w.purpose === req.params.purpose);
    if(idx === -1) db.data.workflows.push({id:uuidv4(), purpose:req.params.purpose, steps:req.body.steps});
    else db.data.workflows[idx].steps = req.body.steps;
    await db.write(); res.json({});
});

// Rota específica Users Update
app.put('/api/users/:id', async (req, res) => {
    const i = db.data.users.findIndex(x => x.id === req.params.id);
    if(i > -1) { db.data.users[i] = {...db.data.users[i], ...req.body}; await db.write(); res.json(db.data.users[i]); }
    else res.status(404).json({});
});

// Login
app.post('/api/login', (req, res) => {
    const u = db.data.users.find(x => x.email === req.body.email && x.password === req.body.password);
    u ? res.json(u) : res.status(401).json({ error: 'Inválido' });
});

// Inicialização
const init = async () => {
    await db.read();
    db.data ||= {servers:[], users:[], workflows:[], options:[], rotines:[], tasks:[], manuals:[]};
    if(!db.data.users.length) db.data.users.push({id:uuidv4(),name:'Admin',email:'swc',password:'123',role:'Admin',initials:'AD'});
    await db.write();
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server V29 Rodando na porta ${PORT}`));
};
init();