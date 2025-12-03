import mongoose from 'mongoose';

// Schema flexível para coleções que variam muito
const GenericSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
}, { strict: false }); // 'strict: false' permite salvar qualquer campo, igual ao JSON

export const Server = mongoose.model('servers', GenericSchema);
export const Workflow = mongoose.model('workflows', GenericSchema);
export const Option = mongoose.model('options', GenericSchema);
export const Manual = mongoose.model('manuals', GenericSchema);