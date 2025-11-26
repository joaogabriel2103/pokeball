// report-generator.js - V30 (Full Detail Report)

window.generatePDFBlob = async function(data) {
    return new Promise(async (resolve, reject) => {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            
            const COL = { dark: [15,23,42], blue: [37,99,235], gray: [100,116,139], line: [200,200,200] };
            
            const loadImage = (src) => new Promise(r => { const i=new Image(); i.src=src; i.onload=()=>r(i); i.onerror=()=>r(null); });
            const bg = await loadImage('/timbrado.jpg');
            if(bg) doc.addImage(bg, 'JPEG', 0, 0, 210, 297);

            let y = 45;
            
            // Título e Status
            doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...COL.dark);
            doc.text("Relatório de Produção Completo", 20, y);
            
            // Tag Status
            doc.setFontSize(10); doc.setFillColor(...COL.blue); doc.setTextColor(255);
            doc.roundedRect(150, y-7, 40, 8, 2, 2, 'F');
            doc.text(String(data.status).toUpperCase(), 170, y-2, {align:'center'});
            y += 15;

            // --- BLOCO 1: IDENTIFICAÇÃO COMPLETA ---
            doc.setDrawColor(...COL.line); doc.setFillColor(250, 250, 250);
            doc.roundedRect(20, y, 170, 35, 2, 2, 'FD');
            
            const pText = (lbl, val, x, curY) => {
                doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...COL.gray);
                doc.text(lbl.toUpperCase(), x, curY+5);
                doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...COL.dark);
                doc.text(String(val||'-'), x, curY+10);
            };

            pText("Cliente", data.client, 25, y);
            pText("Produto", data.product, 85, y);
            pText("Finalidade", data.purpose, 145, y);
            
            pText("Equipamento (Vendor/Model)", `${data.vendor||''} ${data.model||''}`, 25, y+15);
            pText("Serial / Tag", data.serial, 85, y+15);
            pText("Hostname", data.hostname, 145, y+15);
            
            y += 45;

            // --- BLOCO 2: HARDWARE DETALHADO (LISTA COMPLETA) ---
            doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...COL.blue);
            doc.text("Inventário de Hardware", 20, y);
            doc.line(20, y+2, 190, y+2);
            y += 10;

            // CPU/OS/IP
            doc.setFontSize(9); doc.setTextColor(...COL.dark);
            doc.text(`Processador: ${data.cpu || 'N/A'}`, 25, y); y += 5;
            doc.text(`Sistema Operacional: ${data.os || 'N/A'}`, 25, y); y += 5;
            doc.text(`IP Manutenção: ${data.qa_ip || 'N/A'}`, 25, y); y += 8;

            // Helper de Lista
            const renderList = (title, items, formatter) => {
                if(items && items.length > 0) {
                    if(y > 260) { doc.addPage(); if(bg) doc.addImage(bg,'JPEG',0,0,210,297); y=40; }
                    doc.setFont("helvetica", "bold"); doc.text(title, 25, y); y+=5;
                    doc.setFont("helvetica", "normal");
                    items.forEach(item => {
                        if(y > 275) { doc.addPage(); if(bg) doc.addImage(bg,'JPEG',0,0,210,297); y=40; }
                        doc.text(`• ${formatter(item)}`, 30, y);
                        y += 5;
                    });
                    y += 3;
                }
            };

            renderList("Memória RAM:", data.ram, (r) => `${r.gb}GB ${r.model||''} (S/N: ${r.serial||'N/A'})`);
            renderList("Armazenamento (Discos):", data.disks, (d) => `${d.model||''} ${d.size||''} (S/N: ${d.serial||'N/A'})`);
            renderList("Placas de Expansão:", data.cards, (c) => `${c.type||''} ${c.model||''} (S/N: ${c.serial||'N/A'})`);

            y += 5;

            // --- BLOCO 3: HISTÓRICO (QUEM FEZ O QUE) ---
            if(y > 240) { doc.addPage(); if(bg) doc.addImage(bg,'JPEG',0,0,210,297); y=40; }
            
            doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...COL.blue);
            doc.text("Fluxo de Montagem & Responsáveis", 20, y);
            doc.line(20, y+2, 190, y+2);
            y += 10;

            if(data.history && data.history.length) {
                // Ordena cronológico (antigo -> novo) para mostrar o fluxo
                const hist = [...data.history].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                doc.setFillColor(245, 247, 250);
                doc.rect(20, y, 170, 8, 'F');
                doc.setFontSize(8); doc.setTextColor(...COL.gray);
                doc.text("DATA/HORA", 25, y+5);
                doc.text("RESPONSÁVEL", 70, y+5);
                doc.text("AÇÃO", 120, y+5);
                y += 10;

                hist.forEach((h, i) => {
                    if(y > 275) { doc.addPage(); if(bg) doc.addImage(bg,'JPEG',0,0,210,297); y=40; }
                    const d = new Date(h.timestamp).toLocaleString('pt-BR');
                    doc.setTextColor(...COL.dark);
                    doc.text(d, 25, y);
                    doc.text(h.user || 'Sistema', 70, y);
                    
                    // Quebra de linha na mensagem
                    const lines = doc.splitTextToSize(h.msg, 70);
                    doc.text(lines, 120, y);
                    y += (lines.length * 4) + 2;
                });
            }

            const pdfOutput = doc.output('datauristring');
            resolve(pdfOutput);
        } catch (e) { reject(e); }
    });
};

// Função wrapper para download direto
window.generatePDF = async function(data) {
    try {
        const uri = await window.generatePDFBlob(data);
        const a = document.createElement('a');
        a.href = uri;
        a.download = `Relatorio_${data.hostname || 'server'}.pdf`;
        a.click();
    } catch(e) { alert('Erro PDF: ' + e.message); }
}