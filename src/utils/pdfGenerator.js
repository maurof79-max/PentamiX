import html2pdf from 'html2pdf.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MESI = [
  { val: 0, label: 'ISCR' },
  { val: 9, label: 'SET' }, { val: 10, label: 'OTT' }, { val: 11, label: 'NOV' }, 
  { val: 12, label: 'DIC' }, { val: 1, label: 'GEN' }, { val: 2, label: 'FEB' }, 
  { val: 3, label: 'MAR' }, { val: 4, label: 'APR' }, { val: 5, label: 'MAG' }, 
  { val: 6, label: 'GIU' }, { val: 7, label: 'LUG' }
];

const LOGO_URL = "https://mqdpojtisighqjmyzdwz.supabase.co/storage/v1/object/public/images/logo-glow.png";

const getBase64ImageFromURL = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (error) => {
      console.warn("Impossibile caricare immagine per PDF:", url);
      resolve(null); // Non blocchiamo la generazione se manca il logo
    };
  });
};

export const generateReceiptPDF = async (data) => {
  const element = document.createElement('div');
  const meseLabel = data.mese_rif && data.mese_rif !== 0 
    ? MESI.find(m => m.val === parseInt(data.mese_rif))?.label || '-'
    : null;

  element.innerHTML = `
    <div style="width: 210mm; height: 290mm; padding: 15mm; box-sizing: border-box; background-color: #ffffff; color: #333; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid #a81c1c;">
            <div style="flex: 1;"><img src="${LOGO_URL}" alt="Logo" style="height: 90px; width: auto; object-fit: contain;" /></div>
            <div style="flex: 1; text-align: right; font-size: 11px; color: #555; line-height: 1.5;">
                <h4 style="margin: 0 0 5px 0; font-size: 14px; font-weight: bold; color: #000; text-transform: uppercase;">Accademia della Musica</h4>
                <div style="font-weight: 500;">di Piacenza</div>
                Vicolo del Guazzo 2<br>29121 PIACENZA<br>Telefono: +39 0523 1748531<br>Email: accademiadellamusica@libero.it
            </div>
        </div>
        <div style="margin-top: 40px; display: flex; justify-content: space-between;">
            <div><div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Data Pagamento</div><div style="font-size: 14px; font-weight: bold;">${data.data_pagamento}</div></div>
            <div style="text-align: right;"><div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Ricevuto Da</div><div style="font-size: 18px; font-weight: bold; color: #000;">${data.alunno_nome}</div><div style="font-size: 12px; color: #666; margin-top: 2px;">Allievo</div></div>
        </div>
        <div style="margin-top: 50px; margin-bottom: 40px;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead style="background-color: #f3f4f6;"><tr><th style="text-align: left; padding: 12px 15px; font-size: 11px; text-transform: uppercase; color: #555; font-weight: 700; letter-spacing: 0.5px;">Descrizione Servizio</th><th style="text-align: right; padding: 12px 15px; font-size: 11px; text-transform: uppercase; color: #555; font-weight: 700; letter-spacing: 0.5px;">Importo</th></tr></thead>
                <tbody>
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 20px 15px;">
                            <div style="font-size: 15px; font-weight: 600; color: #000;">${data.tipologia}</div>
                            <div style="font-size: 13px; color: #666; margin-top: 4px;">${meseLabel ? `Mensilità: ${meseLabel}` : 'Quota Iscrizione / Altro'} <span style="margin: 0 5px;">•</span> Anno Accademico: ${data.aa || '2025/2026'}</div>
                            ${data.note ? `<div style="margin-top: 8px; font-size: 12px; font-style: italic; color: #888;">Note: ${data.note}</div>` : ''}
                        </td>
                        <td style="padding: 20px 15px; text-align: right; vertical-align: top;"><span style="font-size: 16px; font-weight: 600;">€ ${parseFloat(data.importo).toFixed(2)}</span></td>
                    </tr>
                    <tr><td colspan="2" style="height: 50px;"></td></tr>
                </tbody>
                <tfoot style="border-top: 2px solid #000;"><tr><td style="padding: 20px 15px; text-align: right; font-size: 14px; font-weight: bold; text-transform: uppercase;">Totale Versato</td><td style="padding: 20px 15px; text-align: right; font-size: 24px; font-weight: 700; color: #a81c1c;">€ ${parseFloat(data.importo).toFixed(2)}</td></tr></tfoot>
            </table>
        </div>
        <div style="position: absolute; bottom: 40mm; left: 15mm; right: 15mm;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div style="font-size: 9px; color: #999; line-height: 1.4;"><p style="margin: 0;">Il presente documento costituisce semplice ricevuta di pagamento.</p><p style="margin: 0; font-weight: bold; color: #555;">NON VALIDO AI FINI FISCALI</p></div>
                <div style="text-align: center;"><div style="margin-bottom: 40px; font-size: 11px; color: #555;">Firma per quietanza</div><div style="border-bottom: 1px solid #aaa; width: 200px;"></div></div>
            </div>
        </div>
    </div>`;

  const safeName = data.alunno_nome.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const safeDate = data.data_pagamento.replace(/[^0-9]/g, '-');
  const opt = { margin: 0, filename: `Ricevuta_${safeName}_${safeDate}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
  await html2pdf().set(opt).from(element).save();
};

/**
 * --- GENERAZIONE REGISTRO LEZIONI (Multi Pagina Tabellare) ---
 */
export const generateRegistroPDF = async (schoolInfo, filters, data, monthsLabels) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // --- 1. HEADER (Logo e Intestazione) ---
  if (schoolInfo.logo) {
      const logoBase64 = await getBase64ImageFromURL(schoolInfo.logo);
      if (logoBase64) {
          doc.addImage(logoBase64, 'PNG', 10, 10, 25, 25);
      }
  }

  // Nome Scuola (Grande)
  doc.setFontSize(16);
  doc.setTextColor(40);
  doc.setFont("helvetica", "bold");
  doc.text(schoolInfo.name || "Accademia della Musica", 40, 18);
  
  // Titolo Documento
  doc.setFontSize(14);
  doc.setTextColor(168, 28, 28); // Rosso Accademia
  doc.text("REGISTRO LEZIONI", 40, 25);

  // Sottotitoli (Anno e Mesi)
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.setFont("helvetica", "normal");
  doc.text(`Anno Accademico: ${filters.anno}`, 40, 31);
  
  // --- GESTIONE TESTO MESI (WRAP AUTOMATICO) ---
  const mesiStr = monthsLabels && monthsLabels.length > 0 ? monthsLabels.join(', ') : "Tutti i mesi";
  const fullMesiText = `Mesi Rif.: ${mesiStr}`;
  
  // Calcolo larghezza massima disponibile per il testo (Page Width - X Offset - Margin Right)
  const maxTextWidth = pageWidth - 50; 
  
  // jsPDF calcola automaticamente come spezzare le righe
  const wrappedMesiText = doc.splitTextToSize(fullMesiText, maxTextWidth);
  
  doc.text(wrappedMesiText, 40, 36);

  // --- 2. CALCOLO DINAMICO START TABELLA ---
  // Ogni riga di testo occupa circa 5 unità di altezza.
  // 36 è la Y di partenza. Aggiungiamo altezza testo + padding.
  let finalY = 36 + (wrappedMesiText.length * 5) + 5;

  // --- 3. RAGGRUPPAMENTO DATI ---
  const groupedData = {};
  
  data.forEach(row => {
    const docId = row.docenti?.id || 'unknown';
    const docName = row.docenti ? `${row.docenti.cognome} ${row.docenti.nome}` : 'Docente Sconosciuto';
    const strumento = row.docenti?.strumento || '';
    
    if (!groupedData[docId]) {
      groupedData[docId] = {
        name: docName,
        strumento: strumento,
        lessons: []
      };
    }
    groupedData[docId].lessons.push(row);
  });

  const sortedDocentiIds = Object.keys(groupedData).sort((a, b) => 
    groupedData[a].name.localeCompare(groupedData[b].name)
  );

  // --- 4. GENERAZIONE TABELLE ---
  sortedDocentiIds.forEach(docId => {
    const group = groupedData[docId];
    
    // Controlla spazio pagina prima del titolo docente
    if (finalY > 260) { doc.addPage(); finalY = 20; }
    
    // Intestazione Docente (Barra Grigia Sfondo)
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(10, finalY - 5, pageWidth - 20, 7, 'F'); 
    doc.text(`${group.name} ${group.strumento ? `(${group.strumento})` : ''}`, 12, finalY);
    finalY += 4;

    // Ordina lezioni: Data -> Alunno
    const sortedLessons = group.lessons.sort((a, b) => {
        const dateA = new Date(a.data_lezione);
        const dateB = new Date(b.data_lezione);
        if (dateA - dateB !== 0) return dateA - dateB;
        
        const alunnoA = a.alunni?.cognome || '';
        const alunnoB = b.alunni?.cognome || '';
        return alunnoA.localeCompare(alunnoB);
    });

    const tableBody = sortedLessons.map(l => [
      new Date(l.data_lezione).toLocaleDateString('it-IT'),
      `${l.alunni?.cognome || 'N.D.'} ${l.alunni?.nome || ''}`,
      l.tipi_lezioni?.tipo || 'N.D.',
      l.tipi_lezioni?.durata_minuti ? `${l.tipi_lezioni.durata_minuti}'` : '60\'', 
      l.convalidato ? 'Sì' : '' // "Sì" se validato, vuoto altrimenti
    ]);

    autoTable(doc, {
      startY: finalY,
      head: [['Data', 'Alunno', 'Tipo Lezione', 'Dur.', 'Valid.']], // Intestazione "Valid."
      body: tableBody,
      theme: 'grid',
      headStyles: { 
          fillColor: [255, 255, 255], 
          textColor: [80, 80, 80],
          lineWidth: 0,
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'left'
      },
      styles: { 
          fontSize: 9, 
          cellPadding: 3,
          lineColor: [220, 220, 220],
          lineWidth: 0.1,
          textColor: [50, 50, 50]
      },
      columnStyles: {
          0: { width: 25 }, // Data
          3: { halign: 'center', width: 15 }, // Durata
          4: { halign: 'center', width: 15 }  // Validato
      },
      margin: { left: 10, right: 10 }, // Margini ridotti (10mm)
      didDrawPage: (data) => {
          // Footer Numeri Pagina
          const str = 'Pagina ' + doc.internal.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(str, pageWidth - 20, doc.internal.pageSize.height - 10);
      }
    });

    finalY = doc.lastAutoTable.finalY + 10;
  });

  const fileName = `Registro_${schoolInfo.name.replace(/[^a-z0-9]/gi, '_')}_${filters.anno.replace('/','-')}.pdf`;
  doc.save(fileName);
};