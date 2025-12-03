// reset-tasks.js - Limpeza de Tarefas Fantasmas
import { Low, JSONFile } from 'lowdb';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const file = path.join(__dirname, 'data', 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter);

const run = async () => {
    await db.read();
    
    // Datas de Hoje e Amanhã para referência
    const today = new Date().toISOString().split('T')[0];
    
    // Calcula data de amanhã
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const tomorrow = tmr.toISOString().split('T')[0];

    const totalAntes = db.data.tasks.length;

    // --- A GRANDE FAXINA ---
    db.data.tasks = db.data.tasks.filter(t => {
        // 1. Se já está concluído, MANTÉM (Histórico é sagrado)
        if (t.status === 'Concluído') return true;

        // 2. Se é uma tarefa manual (sem rotina), MANTÉM
        if (!t.templateId) return true;

        // 3. Se for pendente de rotina:
        // SÓ MANTÉM se for de HOJE ou AMANHÃ.
        // Todo o resto (futuro distante ou passado esquecido) será apagado.
        if (t.dueDate === today || t.dueDate === tomorrow) {
            return true;
        }

        // Tchau para o resto
        return false;
    });

    const totalDepois = db.data.tasks.length;
    const removidos = totalAntes - totalDepois;

    await db.write();
    console.log('=========================================');
    console.log(`✅ LIMPEZA CONCLUÍDA COM SUCESSO!`);
    console.log(`🗑️  Tarefas fantasmas removidas: ${removidos}`);
    console.log(`📅 Mantidas apenas: Histórico + Pendências de ${today} e ${tomorrow}`);
    console.log('=========================================');
};

run();