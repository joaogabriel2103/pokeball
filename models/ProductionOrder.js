import mongoose from 'mongoose';

const ProductionOrderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    
    // Dados do Cliente
    client: {
        name: { type: String, required: true },
        cnpj: { type: String },
        ie: { type: String },
        address: { type: String },
        contactName: { type: String },
        contactPhone: { type: String },
        contactEmail: { type: String }
    },

    // O Produto (Agora validado pelo select do front)
    product: {
        description: { type: String, required: true }, // Vem do Select de Produtos
        qty: { type: Number, default: 1 },
        configuration: { type: String }
    },

    // Serviços (Preenchidos automaticamente pela lógica do backend)
    services: [{ type: String }], 

    // Tipo de Contrato (Vem do banco: Venda, Locação...)
    contractType: { type: String, required: true },

    // Quem solicitou
    requester: {
        name: { type: String, required: true },
        email: { type: String, required: true }
    },

    notificationEmails: [{ type: String }],
    observations: { type: String },

    status: { 
        type: String, 
        enum: ['Pendente', 'Em Produção', 'Concluído', 'Cancelado'],
        default: 'Pendente'
    },
    
    linkedServerId: { type: String }, 
    nfNumber: { type: String },
    nfNotified55: { type: Boolean, default: false },
    nfAttachment: { type: String },
    createdAt: { type: Date, default: Date.now }
}, { strict: false });

export default mongoose.model('ProductionOrder', ProductionOrderSchema);