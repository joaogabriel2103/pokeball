// report-generator.js - ShowCase Pro V52 (Blindado + Layout Original)

function loadTimbrado() {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = 'timbrado.jpg'; // Certifique-se que o arquivo existe na pasta public
        img.onload = () => resolve(img);
        img.onerror = () => {
            console.warn("Timbrado não encontrado. Gerando sem fundo.");
            resolve(null);
        };
    });
}

// Função auxiliar para baixar/converter imagens
async function carregarImagem(src) {
    if (!src) return null;
    // Se já for Base64 (upload novo), retorna direto
    if (src.startsWith('data:image')) return src;
    
    // Se for link do servidor (ticket salvo), baixa e converte
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Erro ao carregar imagem para o PDF:", src, e);
        return null; // Retorna null se falhar
    }
}

// Gera o Blob para envio por email (Backend)
window.generatePDFBlob = async function(data) {
    if (!data) return null; // Trava de segurança
    const bgImage = await loadTimbrado();
    
    // Processa fotos para o Blob também
    const processarLista = async (lista) => {
        if (!Array.isArray(lista)) return [];
        return Promise.all(lista.map(img => carregarImagem(img)));
    };
    
    // Clona para não afetar o objeto original na tela
    const dataClone = JSON.parse(JSON.stringify(data));
    try {
        if (dataClone.server_photos) dataClone.server_photos = await processarLista(dataClone.server_photos);
        if (dataClone.box_photos) dataClone.box_photos = await processarLista(dataClone.box_photos);
    } catch (e) { console.error("Erro fotos blob", e); }

    return new Promise((resolve) => {
        const doc = generateDoc(dataClone, bgImage);
        const blob = doc.output('blob');
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = function() {
            resolve(reader.result);
        }
    });
};

// Gera e baixa o PDF no navegador (Botão Relatório)
window.generatePDF = async function(data) {
    // --- CORREÇÃO DO ERRO PRINCIPAL ---
    if (!data) {
        alert("⚠️ Atenção: Salve o servidor antes de gerar o relatório!");
        return;
    }
    // ----------------------------------

    const bgImage = await loadTimbrado();
    
    // PREPARAÇÃO DAS FOTOS
    const processarLista = async (lista) => {
        if (!Array.isArray(lista)) return [];
        return Promise.all(lista.map(img => carregarImagem(img)));
    };

    // Trabalhamos numa cópia para não pesar a memória
    const dataClone = JSON.parse(JSON.stringify(data));

    try {
        if (dataClone.server_photos) dataClone.server_photos = await processarLista(dataClone.server_photos);
        if (dataClone.box_photos) dataClone.box_photos = await processarLista(dataClone.box_photos);
    } catch (e) {
        console.error("Erro processando fotos", e);
    }

    const doc = generateDoc(dataClone, bgImage);
    
    // Nome do Arquivo: PRODUTO - CLIENTE.pdf
    const produto = dataClone.product || 'Produto';
    const cliente = dataClone.client || 'Cliente';
    const safeProduto = String(produto).replace(/[\/\\:*?"<>|]/g, '');
    const safeCliente = String(cliente).replace(/[\/\\:*?"<>|]/g, '');
    const fileName = `${safeProduto} - ${safeCliente}.pdf`;
    
    doc.save(fileName);
};

// --- MANTENDO O SEU LAYOUT ORIGINAL ---
function generateDoc(data, bgImage) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // --- PALETA DE CORES PROFISSIONAL ---
    const BRAND_PRIMARY = [133, 180, 51];   // Verde da marca
    const BRAND_DARK    = [0, 62, 63];      // Azul/Verde escuro
    const TEXT_MAIN     = [60, 60, 60];     // Cinza escuro
    const TEXT_LIGHT    = [100, 100, 100];  // Cinza para legendas
    const TABLE_LINE    = [230, 230, 230];  // Linhas sutis
    const BG_SECTION    = [248, 249, 250];  // Fundo cinza gelo

    // --- CONFIGURAÇÕES GERAIS ---
    const MARGIN_LEFT = 15;
    const PAGE_WIDTH = 210;
    const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_LEFT * 2);

    const addBackground = () => {
        if (bgImage) {
            try { doc.addImage(bgImage, 'JPEG', 0, 0, 210, 297); } catch(e){}
        }
    };

    addBackground();
    
    let y = 45; 

    // --- 1. CABEÇALHO ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRAND_DARK);
    
    let title = "RELATÓRIO TÉCNICO";
    let subtitle = "SAÍDA DE EQUIPAMENTO";

    if (data.purpose && typeof data.purpose === 'string' && data.purpose.toLowerCase().includes('manutenção')) {
        title = "LAUDO TÉCNICO";
        subtitle = "MANUTENÇÃO E REPARO";
    }

    doc.text(title, MARGIN_LEFT, y);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND_PRIMARY);
    doc.text(subtitle, MARGIN_LEFT, y + 6);

    doc.setTextColor(...TEXT_LIGHT);
    doc.setFontSize(9);
    doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 195, y, { align: 'right' });

    y += 15;

    // --- 2. IDENTIFICAÇÃO DO EQUIPAMENTO ---
    doc.autoTable({
        startY: y,
        head: [],
        body: [
            [
                { content: 'CLIENTE', styles: { fontStyle: 'bold', textColor: TEXT_LIGHT } },
                { content: 'HOSTNAME', styles: { fontStyle: 'bold', textColor: TEXT_LIGHT } },
                { content: 'FINALIDADE', styles: { fontStyle: 'bold', textColor: TEXT_LIGHT } }
            ],
            [
                { content: data.client || 'N/A', styles: { fontSize: 12, textColor: BRAND_DARK, fontStyle: 'bold' } },
                { content: data.hostname || 'N/A', styles: { fontSize: 11 } },
                { content: (data.purpose || 'N/A').toUpperCase(), styles: { fontSize: 10 } }
            ],
            [
                { content: 'FABRICANTE', styles: { fontStyle: 'bold', textColor: TEXT_LIGHT, cellPadding: {top: 5, bottom: 1, left: 2, right: 2} } },
                { content: 'MODELO', styles: { fontStyle: 'bold', textColor: TEXT_LIGHT, cellPadding: {top: 5, bottom: 1, left: 2, right: 2} } },
                { content: 'SERIAL (TAG)', styles: { fontStyle: 'bold', textColor: TEXT_LIGHT, cellPadding: {top: 5, bottom: 1, left: 2, right: 2} } }
            ],
            [
                { content: data.manufacturer || data.fabricante || data.platform || data.vendor || 'N/A', styles: { fontSize: 11 } },
                { content: data.model || 'N/A', styles: { fontSize: 11 } },
                { content: data.serial || 'N/A', styles: { fontSize: 11 } }
            ]
        ],
        theme: 'plain',
        styles: { cellPadding: 2, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 60 },
            2: { cellWidth: 'auto' }
        },
        didDrawPage: function(d) { if (d.pageNumber > 1) addBackground(); }
    });

    y = doc.lastAutoTable.finalY + 5;
    doc.setDrawColor(...TABLE_LINE);
    doc.line(MARGIN_LEFT, y, 195, y);
    y += 10;

    // --- 3. INVENTÁRIO DE HARDWARE ---
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_DARK);
    doc.text("INVENTÁRIO DETALHADO (HARDWARE)", MARGIN_LEFT, y);
    y += 2;

    const inventoryBody = [];
    const addCategory = (title, count) => {
        inventoryBody.push([{ 
            content: `${title} ${count ? '(' + count + ')' : ''}`, 
            colSpan: 2, 
            styles: { fillColor: BG_SECTION, fontStyle: 'bold', textColor: BRAND_DARK, halign: 'left' } 
        }]);
    };

    addCategory("PROCESSAMENTO", null);
    inventoryBody.push(['CPU / Processador', data.cpu || 'N/A']);

    if (data.ram && data.ram.length > 0) {
        addCategory("MEMÓRIA RAM", `${data.ram.length} pentes`);
        data.ram.forEach((r, idx) => {
            const desc = `${r.model || 'Genérico'} (${r.gb ? r.gb + 'GB' : 'N/A'})`;
            const sn = `S/N: ${r.serial || 'N/A'}`;
            inventoryBody.push([`Slot #${idx + 1}`, `${desc}\n${sn}`]);
        });
    } else {
        inventoryBody.push(['Memória RAM', 'Nenhum pente registrado']);
    }

    if (data.disks && data.disks.length > 0) {
        addCategory("ARMAZENAMENTO", `${data.disks.length} discos`);
        data.disks.forEach((d, idx) => {
            const desc = `${d.model || 'Disco'} (${d.size || 'N/A'})`;
            const sn = `S/N: ${d.serial || 'N/A'}`;
            inventoryBody.push([`Disco #${idx + 1}`, `${desc}\n${sn}`]);
        });
    }

    if (data.cards && data.cards.length > 0) {
        addCategory("EXPANSÃO / PLACAS", `${data.cards.length} unidades`);
        data.cards.forEach((c, idx) => {
            const desc = `${c.type || 'Placa'} ${c.model || ''}`;
            const sn = `S/N: ${c.serial || 'N/A'}`;
            inventoryBody.push([`Slot #${idx + 1}`, `${desc}\n${sn}`]);
        });
    }
    
    inventoryBody.push(['Sistema Operacional', data.os || 'N/A']);

    doc.autoTable({
        startY: y + 3,
        body: inventoryBody,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, lineColor: TABLE_LINE, lineWidth: 0.1, valign: 'middle' },
        columnStyles: {
            0: { cellWidth: 50, fontStyle: 'bold', textColor: TEXT_MAIN },
            1: { textColor: TEXT_MAIN }
        },
        didDrawPage: function(d) { if (d.pageNumber > 1) addBackground(); }
    });

    y = doc.lastAutoTable.finalY + 15;

    // --- 4. CONTROLE DE QUALIDADE ---
    if (y > 230) { doc.addPage(); addBackground(); y = 40; }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_DARK);
    doc.text("CONTROLE DE QUALIDADE & STATUS", MARGIN_LEFT, y);
    y += 5;

    const getStatusIcon = (status) => status ? "APROVADO" : "PENDENTE";
    
    doc.autoTable({
        startY: y,
        head: [['TESTE FUNCIONAL', 'TRILHOS / FÍSICO', 'CABEAMENTO', 'LACRES / ETIQUETAS']],
        body: [[
            getStatusIcon(data.qa_func),
            getStatusIcon(data.qa_rails),
            getStatusIcon(data.qa_cables),
            getStatusIcon(data.qa_stickers)
        ]],
        theme: 'plain',
        headStyles: { fontSize: 8, textColor: TEXT_LIGHT, halign: 'center', fontStyle: 'bold' },
        bodyStyles: { fontSize: 10, fontStyle: 'bold', halign: 'center', textColor: BRAND_PRIMARY },
        didParseCell: function(dataCell) {
            if (dataCell.section === 'body' && dataCell.cell.raw === 'PENDENTE') {
                dataCell.cell.styles.textColor = [200, 50, 50];
            }
        },
        didDrawPage: function(d) { if (d.pageNumber > 1) addBackground(); }
    });

    y = doc.lastAutoTable.finalY + 10;

    if (data.qa_details) {
        doc.setFillColor(...BG_SECTION);
        doc.setDrawColor(...TABLE_LINE);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const splitText = doc.splitTextToSize(data.qa_details, CONTENT_WIDTH - 10);
        const boxHeight = (splitText.length * 5) + 10;

        if (y + boxHeight > 270) { doc.addPage(); addBackground(); y = 40; }

        doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, boxHeight, 'FD');
        doc.setTextColor(...TEXT_MAIN);
        doc.text("OBSERVAÇÕES TÉCNICAS:", MARGIN_LEFT + 5, y + 6);
        doc.setFont("courier", "normal");
        doc.text(splitText, MARGIN_LEFT + 5, y + 12);
        
        y += boxHeight + 15;
    } else {
        y += 5;
    }

    // --- 5. HISTÓRICO ---
    if (y > 240) { doc.addPage(); addBackground(); y = 40; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_DARK);
    doc.text("HISTÓRICO DE EXECUÇÃO", MARGIN_LEFT, y);
    
    let historyBody = [];
    if (data.history && data.history.length > 0) {
        historyBody = data.history.map(h => [
            new Date(h.timestamp).toLocaleString('pt-BR'),
            h.user,
            h.msg
        ]);
    } else {
        historyBody = [['-', '-', 'Sem registros recentes']];
    }

    doc.autoTable({
        startY: y + 3,
        head: [['DATA / HORA', 'TÉCNICO', 'AÇÃO REGISTRADA']],
        body: historyBody,
        theme: 'striped',
        headStyles: { fillColor: BRAND_DARK, textColor: 255, fontSize: 9, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3, textColor: TEXT_MAIN },
        columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 45 } },
        didDrawPage: function(d) { if (d.pageNumber > 1) addBackground(); }
    });

    y = doc.lastAutoTable.finalY + 15;

    // --- 6. FOTOS ---
    const allPhotos = [...(data.server_photos || []), ...(data.box_photos || [])];

    if (allPhotos.length > 0) {
        if (y > 200) { doc.addPage(); addBackground(); y = 40; }

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_DARK);
        doc.text(`REGISTRO FOTOGRÁFICO (${allPhotos.length} imagens)`, MARGIN_LEFT, y);
        y += 10;

        let xPos = MARGIN_LEFT;
        const imgWidth = 55;
        const imgHeight = 41.25; 
        const gap = 7; 

        allPhotos.forEach((imgBase64, idx) => {
            if(!imgBase64 || typeof imgBase64 !== 'string') return;

            if (xPos + imgWidth > PAGE_WIDTH - MARGIN_LEFT) {
                xPos = MARGIN_LEFT;
                y += imgHeight + gap;
            }

            if (y + imgHeight > 270) {
                doc.addPage();
                addBackground();
                y = 40;
                xPos = MARGIN_LEFT;
            }

            try {
                doc.setFillColor(255, 255, 255);
                doc.rect(xPos, y, imgWidth, imgHeight, 'F');
                doc.addImage(imgBase64, 'JPEG', xPos, y, imgWidth, imgHeight);
                doc.setDrawColor(...TABLE_LINE);
                doc.rect(xPos, y, imgWidth, imgHeight); 
                xPos += imgWidth + gap;
            } catch (e) {
                console.error("Erro foto", e);
            }
        });
    }

    // --- 7. RODAPÉ ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageHeight = doc.internal.pageSize.height;
        
        if (i === pageCount) {
            doc.setDrawColor(...TEXT_LIGHT);
            doc.line(70, pageHeight - 40, 140, pageHeight - 40); 
            doc.setFontSize(8);
            doc.setTextColor(...TEXT_LIGHT);
            doc.text("Assinatura / Responsável Técnico", 105, pageHeight - 35, { align: 'center' });
        }

        doc.setFontSize(8);
        doc.setTextColor(...TEXT_LIGHT);
        doc.text(`Página ${i} de ${pageCount}`, 195, pageHeight - 15, { align: 'right' });
    }

    return doc;
}