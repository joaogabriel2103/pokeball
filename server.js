// server.js - ShowcasePro V22 (Fixed & Optimized with Photo Support)
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Low, JSONFile } from 'lowdb';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; 
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const adapter = new JSONFile(DB_FILE);
const db = new Low(adapter);

// Helper para obter data local YYYY-MM-DD
const getLocalDateStr = (dateObj = new Date()) => {
    const offset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
};

function validateData(data, requiredFields = []) {
    if (!data || typeof data !== 'object') return false;
    for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
            return false;
        }
    }
    return true;
}

// Lógica corrigida para datas e fusos
function shouldRunToday(freq, startStr, targetStr) {
    try {
        if (!startStr || !targetStr) return false;
        const start = new Date(startStr + 'T00:00:00');
        const target = new Date(targetStr + 'T00:00:00');
        if (isNaN(start.getTime()) || isNaN(target.getTime())) return false;
        const diffTime = Math.abs(target - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (target < start) return false;

        switch (freq) {
            case 'Diária': return true;
            case 'Semanal': return target.getDay() === start.getDay();
            case 'Quinzenal': return diffDays % 14 === 0;
            case 'Mensal': return target.getDate() === start.getDate();
            case 'Semestral': return diffDays % 180 === 0;
            case 'Anual': return target.getMonth() === start.getMonth() && target.getDate() === start.getDate();
            default: return false;
        }
    } catch (error) {
        console.error('Erro em shouldRunToday:', error);
        return false;
    }
}

async function initializeDB() {
    try {
        await db.read();
        db.data ||= {};
        const collections = ['servers', 'rotines', 'tasks', 'manuals', 'users', 'options', 'workflows'];
        collections.forEach(k => {
            if (!db.data[k]) db.data[k] = [];
            db.data[k].forEach(item => {
                if (!item.history) item.history = [];
                if (!item.id) item.id = uuidv4();
            });
        });
        if (db.data.users.length === 0) {
            db.data.users.push({ 
                id: uuidv4(), name: 'Admin Showcase', email: 'swc', password: '$w311c@#', role: 'Super Admin', initials: 'SW', color: 'bg-gray-900', history: [], createdAt: new Date().toISOString()
            });
        }
        await db.write();
        console.log('Banco de dados validado.');
    } catch (error) {
        console.error('Erro fatal ao inicializar banco:', error);
    }
}

app.use(cors());
// AUMENTADO PARA 50mb PARA SUPORTAR FOTOS
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(express.static('public'));

app.use(async (req, res, next) => { 
    try { if (!db.data) await db.read(); next(); } catch (error) { res.status(500).json({ error: 'Erro de leitura DB' }); }
});

const addHistory = (item, msg, user = 'Sistema') => {
    if (!item.history) item.history = [];
    item.history.unshift({ msg, user, timestamp: new Date().toISOString() });
};
const findIndex = (col, id) => db.data[col].findIndex(i => i.id === id);
const findById = (col, id) => db.data[col].find(i => i.id === id);

// --- ROTAS ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.data.users.find(u => u.email === email && u.password === password);
    user ? res.json(user) : res.status(401).json({ error: 'Credenciais inválidas' });
});

app.get('/api/options', (req, res) => res.json(db.data.options || []));
app.post('/api/options', async (req, res) => {
    if (!validateData(req.body, ['type', 'value'])) return res.status(400).json({ error: 'Dados inválidos' });
    db.data.options.push({ id: uuidv4(), ...req.body });
    await db.write();
    res.status(201).json({});
});
app.delete('/api/options/:id', async (req, res) => {
    const i = findIndex('options', req.params.id);
    if(i > -1) { db.data.options.splice(i, 1); await db.write(); }
    res.json({});
});

app.get('/api/workflows', (req, res) => res.json(db.data.workflows || []));
app.put('/api/workflows/:purpose', async (req, res) => {
    const purpose = req.params.purpose;
    let flowIndex = db.data.workflows.findIndex(w => w.purpose === purpose);
    const steps = req.body.steps || [];
    if (flowIndex === -1) db.data.workflows.push({ id: uuidv4(), purpose, steps });
    else db.data.workflows[flowIndex].steps = steps;
    await db.write();
    res.json({});
});

['users', 'manuals', 'rotines'].forEach(col => {
    app.get(`/api/${col}`, (req, res) => res.json(db.data[col] || []));
    app.get(`/api/${col}/:id`, (req, res) => { const i = findById(col, req.params.id); i ? res.json(i) : res.status(404).json({}); });
    app.post(`/api/${col}`, async (req, res) => {
        const { userAction, ...d } = req.body;
        const n = { id: uuidv4(), history: [], createdAt: new Date().toISOString(), ...d };
        addHistory(n, 'Criado', userAction);
        db.data[col].push(n);
        await db.write();
        res.status(201).json(n);
    });
    app.put(`/api/${col}/:id`, async (req, res) => {
        const i = findIndex(col, req.params.id);
        if(i === -1) return res.status(404).json({});
        db.data[col][i] = { ...db.data[col][i], ...req.body };
        await db.write();
        res.json(db.data[col][i]);
    });
    app.delete(`/api/${col}/:id`, async (req, res) => {
        const i = findIndex(col, req.params.id);
        if(i > -1) { db.data[col].splice(i, 1); await db.write(); }
        res.json({});
    });
});

app.get('/api/servers', (req, res) => res.json(db.data.servers || []));
app.get('/api/servers/:id', (req, res) => {
    const i = findById('servers', req.params.id);
    if (!i) return res.status(404).json({});
    const wf = (db.data.workflows || []).find(w => w.purpose === i.purpose);
    if (wf) i.steps = wf.steps;
    res.json(i);
});

app.post('/api/servers', async (req, res) => {
    const { userAction, ...data } = req.body;
    if (!validateData(data, ['purpose'])) return res.status(400).json({ error: 'Finalidade obrigatória' });
    const workflow = (db.data.workflows || []).find(w => w.purpose === data.purpose);
    const steps = workflow ? workflow.steps : [{name:'Solicitação', fields:['client']}];
    const newServer = { 
        id: uuidv4(), status: steps[0]?.name || 'Início', steps, checklist: [], history: [], disks: [], cards: [], ram: [], createdAt: new Date().toISOString(), ...data 
    };
    addHistory(newServer, `Iniciado: ${newServer.hostname || 'Novo Server'}`, userAction);
    db.data.servers.push(newServer);
    await db.write();
    res.status(201).json(newServer);
});

app.put('/api/servers/:id', async (req, res) => {
    const idx = findIndex('servers', req.params.id);
    if (idx === -1) return res.status(404).json({});
    const server = db.data.servers[idx];
    const { userAction, ...data } = req.body;
    if (data.purpose && data.purpose !== server.purpose) {
        const wf = (db.data.workflows || []).find(w => w.purpose === data.purpose);
        if (wf) { server.steps = wf.steps; server.status = wf.steps[0].name; addHistory(server, `Fluxo alterado para ${data.purpose}`, userAction); }
    }
    if(data.status && data.status !== server.status) { addHistory(server, `Status: ${data.status}`, userAction); } 
    else if (!data.purpose) { addHistory(server, 'Dados atualizados', userAction); }
    
    db.data.servers[idx] = { ...server, ...data };
    await db.write();
    res.json(db.data.servers[idx]);
});

app.delete('/api/servers/:id', async (req, res) => {
    const i = findIndex('servers', req.params.id);
    if(i > -1) { db.data.servers.splice(i, 1); await db.write(); }
    res.json({});
});

app.get('/api/tasks', async (req, res) => {
    try {
        const { date } = req.query;
        const targetDateStr = date ? date : getLocalDateStr();
        let tasksCreated = false;
        const rotinas = db.data.rotines || [];
        const tasks = db.data.tasks || [];

        for (const rotina of rotinas) {
            const startStr = rotina.createdAt.split('T')[0];
            if (shouldRunToday(rotina.frequency, startStr, targetDateStr)) {
                const existing = tasks.find(t => t.templateId === rotina.id && t.dueDate === targetDateStr);
                if (!existing) {
                    const template = Array.isArray(rotina.template) ? rotina.template : []; 
                    const checklistItems = (rotina.steps || template).map(i => ({ step: i.title || i.step, manual: i.manual, completed: false }));
                    const newTask = { 
                        id: uuidv4(), title: rotina.title, templateId: rotina.id, dueDate: targetDateStr, frequency: rotina.frequency, status: 'Pendente', assignedTo: rotina.assignedTo, checklist: checklistItems, history: [], createdAt: new Date().toISOString() 
                    };
                    tasks.push(newTask);
                    tasksCreated = true;
                }
            }
        }
        if (tasksCreated) { db.data.tasks = tasks; await db.write(); }
        res.json(tasks.filter(t => t.dueDate === targetDateStr));
    } catch(e) {
        console.error("Erro ao gerar tarefas:", e);
        res.status(500).json([]);
    }
});

app.put('/api/tasks/:id/step', async (req, res) => {
    const task = findById('tasks', req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const { stepIndex, completed } = req.body;
    if (task.checklist && task.checklist[stepIndex]) { task.checklist[stepIndex].completed = completed; await db.write(); }
    res.json(task);
});

app.put('/api/tasks/:id/status', async (req, res) => {
    const task = findById('tasks', req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
    task.status = req.body.status;
    await db.write();
    res.json(task);
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

initializeDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Server ShowcasePro Ready on port ${PORT}`); });
});