import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
    Building, Plus, RefreshCw, Check, X, Edit2, MapPin, 
    Phone, User, Smartphone, Mail, FileText, Globe, Layers, 
    Image as ImageIcon, Grid, Loader 
} from 'lucide-react';

export default function GestioneScuole() {
  const [scuole, setScuole] = useState([]);
  const [moduliDisponibili, setModuliDisponibili] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: sData } = await supabase.from('scuole').select('*').order('created_at');
    setScuole(sData || []);

    const { data: mData } = await supabase.from('sys_moduli').select('*').order('ordine');
    setModuliDisponibili(mData || []);
    setLoading(false);
  };

  const handleOpenModal = (scuola = null) => {
    setEditingSchool(scuola);
    setShowModal(true);
  };

  return (
    <div className="p-6 h-full flex flex-col bg-accademia-dark">
      <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
        <div>
           <h2 className="text-xl font-light text-white flex items-center gap-2">
             <Building className="text-accademia-red" size={24} /> Gestione Scuole (Clienti)
           </h2>
           <p className="text-xs text-gray-500 mt-1">Anagrafica completa per fatturazione e configurazione moduli.</p>
        </div>
        <div className="flex gap-2">
            <button onClick={fetchData} className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"><RefreshCw size={20}/></button>
            <button 
                onClick={() => handleOpenModal(null)} 
                className="flex items-center gap-2 bg-accademia-red px-4 py-2 rounded-md text-white font-bold shadow-lg hover:bg-red-700 transition-colors"
            >
                <Plus size={18} /> Nuova Scuola
            </button>
        </div>
      </div>

      <div className="grid gap-4 overflow-y-auto custom-scrollbar pb-10">
        {scuole.map(scuola => (
            <div key={scuola.id} className="bg-accademia-card border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-all group relative">
                
                {/* HEADER CARD */}
                <div className="flex flex-col md:flex-row justify-between items-start mb-4 border-b border-gray-800 pb-4">
                    <div className="w-full flex items-start gap-4">
                        {/* Preview Logo */}
                        {scuola.logo_url && (
                            <img src={scuola.logo_url} alt="Logo" className="w-12 h-12 object-contain bg-white/5 rounded p-1 border border-gray-700" />
                        )}
                        <div>
                            <div className="flex flex-wrap items-baseline gap-2">
                                <h3 className="text-lg font-bold text-white">{scuola.nome}</h3>
                                <span className="text-[10px] text-gray-600 font-mono">(ID: {scuola.id})</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                                {(scuola.partita_iva || scuola.codice_fiscale) ? (
                                    <span className="flex items-center gap-1">
                                        <FileText size={10}/> 
                                        {scuola.partita_iva ? `P.IVA: ${scuola.partita_iva}` : ''} 
                                        {scuola.partita_iva && scuola.codice_fiscale ? ' - ' : ''}
                                        {scuola.codice_fiscale ? `CF: ${scuola.codice_fiscale}` : ''}
                                    </span>
                                ) : <span className="text-gray-600 italic">Dati fiscali mancanti</span>}
                            </div>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => handleOpenModal(scuola)}
                        className="mt-2 md:mt-0 p-2 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold shrink-0"
                    >
                        <Edit2 size={14} /> Modifica
                    </button>
                </div>

                {/* INFO */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 text-sm">
                    <div className="space-y-2">
                        <div className="flex items-start gap-2 text-gray-300">
                            <MapPin size={14} className="mt-1 text-gray-500 shrink-0"/>
                            <span>
                                {scuola.indirizzo || 'Indirizzo mancante'} {scuola.numero_civico ? `, ${scuola.numero_civico}` : ''} <br/>
                                <span className="text-gray-400 text-xs">
                                    {scuola.paese ? `${scuola.paese} (${scuola.provincia || '-'})` : ''}
                                </span>
                            </span>
                        </div>
                        <div className="pt-1 space-y-1">
                            {scuola.email && <div className="flex items-center gap-2 text-gray-300"><Mail size={14} className="text-gray-500"/> {scuola.email}</div>}
                            {scuola.pec && <div className="flex items-center gap-2 text-gray-300"><div className="w-3.5 h-3.5 bg-gray-700 rounded flex items-center justify-center text-[8px] font-bold text-gray-300">P</div> {scuola.pec}</div>}
                            {scuola.sito_web && <div className="flex items-center gap-2 text-blue-400"><Globe size={14} className="text-gray-500"/> {scuola.sito_web}</div>}
                        </div>
                    </div>

                    <div className="space-y-2 border-l border-gray-800 pl-4">
                        <div className="text-[10px] uppercase text-gray-600 font-bold mb-1">Referente</div>
                        <div className="flex items-center gap-2 text-white font-medium">
                            <User size={14} className="text-accademia-red"/> {scuola.referente || 'Nessun referente'}
                        </div>
                        {scuola.email_referente && <div className="flex items-center gap-2 text-gray-400 text-xs"><Mail size={12}/> {scuola.email_referente}</div>}
                        {scuola.cellulare && <div className="flex items-center gap-2 text-gray-400 text-xs"><Smartphone size={12}/> {scuola.cellulare}</div>}
                    </div>
                </div>

                {/* Moduli */}
                <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800/50">
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-widest">Moduli Attivi</h4>
                    <div className="flex flex-wrap gap-2">
                        {moduliDisponibili.map(mod => {
                            const isActive = scuola.moduli_attivi?.includes(mod.codice);
                            return (
                                <div
                                    key={mod.codice}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium ${
                                        isActive 
                                        ? 'bg-green-900/20 border-green-800 text-green-400' 
                                        : 'bg-gray-800 border-gray-700 text-gray-500 opacity-60'
                                    }`}
                                >
                                    {isActive ? <Check size={12} strokeWidth={3}/> : <X size={12}/>}
                                    {mod.etichetta}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        ))}
      </div>

      {showModal && (
        <ModalScuola 
            scuola={editingSchool} 
            moduliDisponibili={moduliDisponibili} 
            onClose={() => setShowModal(false)}
            onSave={() => { setShowModal(false); fetchData(); }}
        />
      )}
    </div>
  );
}

// --- MODALE ---
function ModalScuola({ scuola, moduliDisponibili, onClose, onSave }) {
    const isEdit = !!scuola;
    
    // Stati Form
    const [formData, setFormData] = useState({
        nome: scuola?.nome || '',
        slug: scuola?.slug || '',
        logo_url: scuola?.logo_url || '',
        partita_iva: scuola?.partita_iva || '',
        codice_fiscale: scuola?.codice_fiscale || '',
        email: scuola?.email || '',
        pec: scuola?.pec || '',
        telefono: scuola?.telefono || '',
        sito_web: scuola?.sito_web || '',
        indirizzo: scuola?.indirizzo || '',
        numero_civico: scuola?.numero_civico || '',
        paese: scuola?.paese || '',
        provincia: scuola?.provincia || '',
        referente: scuola?.referente || '',
        email_referente: scuola?.email_referente || '',
        cellulare: scuola?.cellulare || '',
        moduli_attivi: scuola?.moduli_attivi || ["anagrafica", "didattica"] 
    });
    
    // Stati Galleria Immagini
    const [showGallery, setShowGallery] = useState(false);
    const [galleryImages, setGalleryImages] = useState([]);
    const [loadingGallery, setLoadingGallery] = useState(false);
    const [loadingSave, setLoadingSave] = useState(false);

    // Gestione Moduli Locali
    const toggleLocalModulo = (codice) => {
        setFormData(prev => {
            const current = prev.moduli_attivi || [];
            if (current.includes(codice)) {
                return { ...prev, moduli_attivi: current.filter(c => c !== codice) };
            } else {
                return { ...prev, moduli_attivi: [...current, codice] };
            }
        });
    };

    // Carica Immagini dallo Storage
    const fetchImages = async () => {
        setLoadingGallery(true);
        setShowGallery(true);
        try {
            const { data, error } = await supabase.storage.from('images').list('', {
                limit: 100,
                offset: 0,
                sortBy: { column: 'name', order: 'asc' },
            });

            if (error) {
                console.error('Error fetching images:', error);
                alert("Errore nel caricamento della galleria: " + error.message);
            } else {
                // Filtra solo file (esclude cartelle se presenti)
                const files = data.filter(item => item.id !== null);
                setGalleryImages(files);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingGallery(false);
        }
    };

    const selectImage = (fileName) => {
        // Ottieni URL pubblico
        const { data } = supabase.storage.from('images').getPublicUrl(fileName);
        if (data && data.publicUrl) {
            setFormData({ ...formData, logo_url: data.publicUrl });
            setShowGallery(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.nome.trim()) return alert("Il nome della scuola è obbligatorio");
        
        setLoadingSave(true);
        try {
            if (isEdit) {
                const { error } = await supabase.from('scuole').update(formData).eq('id', scuola.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('scuole').insert([formData]);
                if (error) throw error;
            }
            onSave();
        } catch (err) {
            alert("Errore salvataggio: " + err.message);
        } finally {
            setLoadingSave(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-3xl rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Building size={20} className="text-accademia-red"/>
                        {isEdit ? 'Modifica Scuola' : 'Nuova Scuola'}
                    </h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    
                    {/* RIGA 1: NOME SCUOLA E LOGO PICKER */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome Scuola / Ragione Sociale *</label>
                            <input type="text" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" required />
                        </div>
                        <div className="mt-4">
    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">
        Link Personalizzato (Slug) *
    </label>
    <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 font-mono">.../login/</span>
        <input 
            type="text" 
            value={formData.slug} 
            onChange={e => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})} 
            className="flex-1 bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none font-mono text-sm" 
            placeholder="es. nome-scuola"
            required
        />
    </div>
    <p className="text-[10px] text-gray-500 mt-1">Identificativo univoco per l'URL di accesso.</p>
</div>
                        
                        {/* LOGO PICKER UI */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase flex items-center gap-2">
                                <ImageIcon size={12}/> Logo Scuola
                            </label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={formData.logo_url} 
                                    onChange={e => setFormData({...formData, logo_url: e.target.value})} 
                                    className="flex-1 bg-accademia-input border border-gray-700 rounded p-2.5 text-white text-xs font-mono focus:border-accademia-red focus:outline-none" 
                                    placeholder="https://... o seleziona -->" 
                                />
                                <button 
                                    type="button"
                                    onClick={fetchImages}
                                    className="px-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-gray-300 flex items-center justify-center"
                                    title="Sfoglia Archivio Immagini"
                                >
                                    <Grid size={18} />
                                </button>
                            </div>
                            
                            {/* MINI GALLERIA A COMPARSA */}
                            {showGallery && (
                                <div className="mt-2 p-3 bg-gray-900 border border-gray-700 rounded-lg animate-in fade-in slide-in-from-top-2">
                                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-800">
                                        <span className="text-xs font-bold text-gray-400 uppercase">Seleziona Immagine</span>
                                        <button type="button" onClick={() => setShowGallery(false)}><X size={14} className="text-gray-500 hover:text-white"/></button>
                                    </div>
                                    
                                    {loadingGallery ? (
                                        <div className="flex justify-center py-4"><Loader size={20} className="animate-spin text-accademia-red"/></div>
                                    ) : galleryImages.length === 0 ? (
                                        <div className="text-xs text-gray-500 py-2 text-center">Nessuna immagine trovata in 'images'</div>
                                    ) : (
                                        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                            {galleryImages.map(img => (
                                                <div 
                                                    key={img.id} 
                                                    onClick={() => selectImage(img.name)}
                                                    className="aspect-square bg-gray-800 rounded border border-gray-700 hover:border-accademia-red cursor-pointer flex items-center justify-center overflow-hidden group relative"
                                                    title={img.name}
                                                >
                                                    {/* Usiamo l'URL pubblico per mostrare l'anteprima */}
                                                    <img 
                                                        src={supabase.storage.from('images').getPublicUrl(img.name).data.publicUrl} 
                                                        alt={img.name}
                                                        className="w-full h-full object-contain p-1 group-hover:scale-110 transition-transform"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RESTO DEL FORM (INVARIATO) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* COLONNA SINISTRA */}
                        <div className="space-y-4">
                             <h4 className="text-xs font-bold text-accademia-red uppercase tracking-wider border-b border-gray-800 pb-1">Dati Fiscali & Sede</h4>
                             
                             <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Partita IVA</label><input type="text" value={formData.partita_iva} onChange={e => setFormData({...formData, partita_iva: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none font-mono" /></div>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Codice Fiscale</label><input type="text" value={formData.codice_fiscale} onChange={e => setFormData({...formData, codice_fiscale: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none font-mono" /></div>
                             </div>

                             <div className="grid grid-cols-4 gap-3">
                                <div className="col-span-3"><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Indirizzo</label><input type="text" value={formData.indirizzo} onChange={e => setFormData({...formData, indirizzo: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" /></div>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Civico</label><input type="text" value={formData.numero_civico} onChange={e => setFormData({...formData, numero_civico: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" /></div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Città</label><input type="text" value={formData.paese} onChange={e => setFormData({...formData, paese: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" /></div>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Prov.</label><input type="text" value={formData.provincia} onChange={e => setFormData({...formData, provincia: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none uppercase" maxLength={2} /></div>
                            </div>
                        </div>

                        {/* COLONNA DESTRA */}
                        <div className="space-y-4">
                             <h4 className="text-xs font-bold text-accademia-red uppercase tracking-wider border-b border-gray-800 pb-1">Contatti & Referente</h4>
                             <div className="grid grid-cols-2 gap-3">
                                 <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email Istituzionale</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" /></div>
                                 <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Sito Web</label><input type="text" value={formData.sito_web} onChange={e => setFormData({...formData, sito_web: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none"/></div>
                             </div>

                             <div className="pt-2 space-y-2">
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome Referente</label>
                                <input type="text" value={formData.referente} onChange={e => setFormData({...formData, referente: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" />
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="email" value={formData.email_referente} onChange={e => setFormData({...formData, email_referente: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" placeholder="Email Referente" />
                                    <input type="text" value={formData.cellulare} onChange={e => setFormData({...formData, cellulare: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" placeholder="Cellulare" />
                                </div>
                             </div>
                        </div>
                    </div>

                    {/* CONFIGURAZIONE MODULI */}
                    <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <Layers className="text-accademia-red" size={18} />
                            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Configurazione Moduli (Pacchetto)</h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {moduliDisponibili.map(mod => {
                                const isActive = formData.moduli_attivi.includes(mod.codice);
                                return (
                                    <button
                                        key={mod.codice}
                                        type="button" 
                                        onClick={() => toggleLocalModulo(mod.codice)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${
                                            isActive 
                                            ? 'bg-green-900/30 border-green-600 text-green-400' 
                                            : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                                        }`}
                                    >
                                        {isActive ? <Check size={16} strokeWidth={3}/> : <Plus size={16}/>}
                                        {mod.etichetta}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Annulla</button>
                        <button type="submit" disabled={loadingSave} className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg disabled:opacity-50 transition-all">
                            {loadingSave ? 'Salvataggio...' : 'Salva'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}