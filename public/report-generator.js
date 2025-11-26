// report-generator.js - Showcase Pro V22
// Lógica de Relatório Profissional com Fundo Timbrado

async function generatePDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    const COL_DARK = [33, 41, 54];
    const COL_GRAY = [100, 116, 139];
    const COL_GREEN = [217, 237, 19];
    const COL_LIGHT = [248, 250, 252];

    // --- 1. CARREGAMENTO DO FUNDO (TENTATIVA DUPLA) ---
    const loadImage = (url) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = url;
            img.onload = () => resolve(img);
            img.onerror = () => reject(url);
        });
    };

    let bgImage = null;
    try {
        bgImage = await loadImage('/timbrado.jpg');
    } catch (e1) {
        try {
            bgImage = await loadImage('/timbrado.jpg.jpg');
        } catch (e2) {
            console.warn("Papel timbrado não encontrado (nem .jpg nem .jpg.jpg).");
            alert("Aviso: Papel timbrado não encontrado na pasta 'public'. O relatório será gerado com fundo branco.");
        }
    }

    // Função auxiliar para desenhar fundo em qualquer página
    const drawBackground = () => {
        if (bgImage) {
            doc.addImage(bgImage, 'JPEG', 0, 0, 210, 297);
        }
    };

    // Desenha fundo na primeira página
    drawBackground();

    // --- 2. CONTEÚDO DO RELATÓRIO ---
    let y = 50;

    // Cabeçalho
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...COL_DARK);
    doc.text("Relatório de Montagem", 20, y);
    
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COL_GRAY);
    doc.text(`Serial/Tag: ${data.serial || 'N/A'}`, 20, y);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 140, y);

    y += 10;

    // Bloco 1: Identificação
    doc.setFillColor(...COL_LIGHT);
    doc.setDrawColor(220);
    doc.roundedRect(20, y, 170, 35, 3, 3, 'FD');
    
    y += 8;
    const printField = (label, val, x, _y) => {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COL_DARK);
        doc.setFontSize(9);
        doc.text(label, x, _y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50);
        doc.text(String(val || '-').toUpperCase(), x, _y + 5);
    };

    printField("CLIENTE", data.client, 25, y);
    printField("PRODUTO", data.product, 85, y);
    printField("FINALIDADE", data.purpose, 145, y);
    
    y += 12;
    printField("FABRICANTE / MODELO", `${data.vendor || ''} ${data.model || ''}`, 25, y);
    printField("SISTEMA OPERACIONAL", data.os, 85, y);
    printField("HOSTNAME", data.hostname, 145, y);

    y += 25;

    // Bloco 2: Controle de Qualidade
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COL_DARK);
    doc.text("Controle de Qualidade & Rede", 20, y);
    doc.setDrawColor(...COL_GREEN);
    doc.setLineWidth(1);
    doc.line(20, y+2, 85, y+2);

    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(...COL_DARK);
    doc.text(`IP de Manutenção:`, 20, y);
    doc.setFont("helvetica", "normal");
    doc.text(data.qa_ip || 'Não definido', 60, y);

    y += 8;
    const qaItems = [
        { label: "Teste Funcionalidade", val: data.qa_func },
        { label: "Trilhos do Servidor", val: data.qa_rails },
        { label: "Org. Cabos Internos", val: data.qa_cables },
        { label: "Adesivos / Etiquetas", val: data.qa_stickers },
        { label: "Validação DB/CFG", val: data.qa_db }
    ];

    let qaX = 20;
    doc.setFontSize(9);
    qaItems.forEach((item, i) => {
        doc.setFillColor(item.val ? 16 : 200, item.val ? 185 : 200, item.val ? 129 : 200);
        doc.circle(qaX, y - 1, 2, 'F');
        doc.setTextColor(60);
        doc.text(item.label, qaX + 4, y);
        qaX += 65;
        if (i === 2) { qaX = 20; y += 6; }
    });

    y += 15;

    // Bloco 3: Hardware
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COL_DARK);
    doc.text("Especificações de Hardware", 20, y);
    doc.setDrawColor(...COL_GREEN);
    doc.line(20, y+2, 85, y+2);

    y += 10;
    const addLine = (txt) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(50);
        doc.text("• " + txt, 25, y);
        y += 5;
    };

    doc.setFont("helvetica", "bold"); doc.text("Processador:", 20, y); y+=5;
    addLine(data.cpu || 'Padrão');
    y += 2;

    doc.setFont("helvetica", "bold"); doc.text("Memória RAM:", 20, y); y+=5;
    if (data.ram && data.ram.length > 0) {
        data.ram.forEach(r => addLine(`${r.gb}GB - ${r.model} (S/N: ${r.serial || '-'})`));
    } else { addLine("Nenhum módulo registrado"); }
    y += 2;

    doc.setFont("helvetica", "bold"); doc.text("Armazenamento:", 20, y); y+=5;
    if (data.disks && data.disks.length > 0) {
        data.disks.forEach(d => addLine(`${d.size} - ${d.model} (S/N: ${d.serial || '-'})`));
    } else { addLine("Nenhum disco registrado"); }
    y += 2;

    doc.setFont("helvetica", "bold"); doc.text("Placas Adicionais:", 20, y); y+=5;
    if (data.cards && data.cards.length > 0) {
        data.cards.forEach(c => addLine(`${c.type} - ${c.model} (S/N: ${c.serial || '-'})`));
    } else { addLine("Nenhuma placa offboard"); }

    y += 10;

    // Bloco 4: Fotos
    const renderPhotoBlock = (title, photos) => {
        if (!photos || photos.length === 0) return;

        if (y > 200) { doc.addPage(); drawBackground(); y = 40; }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...COL_DARK);
        doc.text(title, 20, y);
        y += 8;

        let x = 20;
        photos.forEach(src => {
            if (x > 150) { x = 20; y += 55; }
            if (y > 240) { doc.addPage(); drawBackground(); y = 40; x = 20; }

            try {
                doc.setDrawColor(200);
                doc.rect(x, y, 50, 40); 
                doc.addImage(src, 'JPEG', x+1, y+1, 48, 38);
                x += 55;
            } catch(e) { console.error('Erro ao adicionar foto', e); }
        });
        y += 55;
    };

    // Prepara Arrays de fotos
    let pServer = Array.isArray(data.server_photos) ? data.server_photos : (data.server_photo ? [data.server_photo] : []);
    let pBox = Array.isArray(data.box_photos) ? data.box_photos : (data.box_photo ? [data.box_photo] : []);

    renderPhotoBlock("Fotos do Servidor", pServer);
    renderPhotoBlock("Fotos da Caixa / Embalagem", pBox);

    // Rodapé
    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} - Showcase Pro Report`, 105, 290, { align: 'center' });
    }

    doc.save(`Relatorio_${data.serial || 'Montagem'}.pdf`);
}