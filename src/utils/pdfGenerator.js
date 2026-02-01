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
      resolve(null);
    };
  });
};

/**
 * --- GENERAZIONE RICEVUTA SINGOLA (PDF con HTML2PDF) ---
 */
export const generateReceiptPDF = async (data) => {
  const element = document.createElement('div');
  
  // Costruzione righe dettaglio lezioni (se presenti)
  let lezioniHTML = '';
  if (data.lezioni && data.lezioni.length > 0) {
    lezioniHTML = `
      <div style="margin-top: 20px; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
        <div style="background: #f8fafc; padding: 8px 15px; font-size: 11px; font-weight: bold; color: #64748b; border-bottom: 1px solid #eee; text-transform: uppercase;">
          Dettaglio Lezioni Saldate
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          ${data.lezioni.map(lez => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 15px; color: #334155;">${new Date(lez.data).toLocaleDateString('it-IT')}</td>
              <td style="padding: 10px 15px; color: #334155; font-weight: 500;">${lez.tipo}</td>
              <td style="padding: 10px 15px; text-align: right; color: #000; font-weight: 600;">€ ${parseFloat(lez.importo_pagato).toFixed(2)}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `;
  }

  element.innerHTML = `
    <div style="width: 210mm; min-height: 290mm; padding: 15mm; box-sizing: border-box; background-color: #ffffff; color: #333; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid #a81c1c;">
            <div style="flex: 1;"><img src="${LOGO_URL}" alt="Logo" style="height: 80px; width: auto;" /></div>
            <div style="flex: 1; text-align: right; font-size: 11px; color: #555; line-height: 1.4;">
                <h4 style="margin: 0 0 5px 0; font-size: 14px; font-weight: bold; color: #000; text-transform: uppercase;">Accademia della Musica</h4>
                <div style="font-weight: 500;">di Piacenza</div>
                Vicolo del Guazzo 2, 29121 PIACENZA<br>
                Tel: +39 0523 1748531<br>
                Email: accademiadellamusica@libero.it
            </div>
        </div>

        <div style="margin-top: 30px; display: flex; justify-content: space-between; background: #fdfdfd; padding: 15px; border-radius: 10px; border: 1px solid #f0f0f0;">
            <div>
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Data Pagamento</div>
                <div style="font-size: 14px; font-weight: bold;">${data.data_pagamento}</div>
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-top: 15px; margin-bottom: 4px;">Ricevuta n°</div>
                <div style="font-size: 12px; font-family: monospace; color: #555;">${data.receipt_number || 'N/A'}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Allievo</div>
                <div style="font-size: 20px; font-weight: 800; color: #000;">${data.alunno_nome}</div>
                <div style="font-size: 12px; color: #a81c1c; font-weight: 600; margin-top: 2px;">Anno Accademico ${data.aa}</div>
            </div>
        </div>

        <div style="margin-top: 30px;">
            <div style="font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 10px; font-weight: bold;">Causale Principale</div>
            <div style="font-size: 18px; font-weight: 600; color: #000; border-left: 4px solid #a81c1c; padding-left: 15px;">
                ${data.tipologia}
            </div>
            
            ${lezioniHTML}

            ${data.note ? `
              <div style="margin-top: 20px; padding: 10px; background: #fff9f9; border-radius: 5px; font-size: 12px; color: #7f1d1d; border: 1px italic #fecaca;">
                <strong>Note:</strong> ${data.note}
              </div>
            ` : ''}
        </div>

        <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
            <div style="text-align: right; border-top: 2px solid #000; padding-top: 15px; min-width: 200px;">
                <div style="font-size: 12px; font-weight: bold; color: #555; text-transform: uppercase;">Totale Versato</div>
                <div style="font-size: 32px; font-weight: 800; color: #a81c1c;">€ ${parseFloat(data.importo).toFixed(2)}</div>
            </div>
        </div>

        <div style="margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="font-size: 9px; color: #999; max-width: 300px;">
                <p style="margin: 0; font-weight: bold; color: #a81c1c; margin-bottom: 3px;">DOCUMENTO NON VALIDO AI FINI FISCALI</p>
                <p style="margin: 0; line-height: 1.3;">Il presente documento costituisce semplice ricevuta di pagamento per uso interno dell'Associazione.</p>
            </div>
            <div style="text-align: center;">
                <div style="margin-bottom: 35px; font-size: 11px; color: #555;">Firma per quietanza</div>
                <div style="border-bottom: 1px solid #aaa; width: 180px;"></div>
            </div>
        </div>
    </div>`;

  const safeName = data.alunno_nome.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const opt = { 
    margin: 0, 
    filename: `Ricevuta_${safeName}.pdf`, 
    image: { type: 'jpeg', quality: 1 }, 
    html2canvas: { scale: 3, useCORS: true, logging: false }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
  };
  
  await html2pdf().set(opt).from(element).save();
};

/**
 * --- GENERAZIONE REGISTRO LEZIONI ---
 */
export const generateRegistroPDF = async (schoolInfo, filters, data, monthsLabels) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  if (schoolInfo.logo) {
      const logoBase64 = await getBase64ImageFromURL(schoolInfo.logo);
      if (logoBase64) doc.addImage(logoBase64, 'PNG', 10, 10, 25, 25);
  }

  doc.setFontSize(16).setFont("helvetica", "bold").text(schoolInfo.name || "Accademia della Musica", 40, 18);
  doc.setFontSize(14).setTextColor(168, 28, 28).text("REGISTRO LEZIONI", 40, 25);
  doc.setFontSize(10).setTextColor(80).setFont("helvetica", "normal").text(`Anno Accademico: ${filters.anno}`, 40, 31);
  
  const mesiStr = monthsLabels?.length > 0 ? monthsLabels.join(', ') : "Tutti i mesi";
  const wrappedMesiText = doc.splitTextToSize(`Mesi Rif.: ${mesiStr}`, pageWidth - 50);
  doc.text(wrappedMesiText, 40, 36);

  let finalY = 36 + (wrappedMesiText.length * 5) + 5;

  const groupedData = {};
  data.forEach(row => {
    const docId = row.docenti?.id || 'unknown';
    if (!groupedData[docId]) {
      groupedData[docId] = { 
        name: row.docenti ? `${row.docenti.cognome} ${row.docenti.nome}` : 'N.D.',
        strumento: row.docenti?.strumento || '',
        lessons: [] 
      };
    }
    groupedData[docId].lessons.push(row);
  });

  Object.keys(groupedData).sort().forEach(docId => {
    const group = groupedData[docId];
    if (finalY > 260) { doc.addPage(); finalY = 20; }
    
    doc.setFontSize(11).setFont("helvetica", "bold").setFillColor(240, 240, 240).rect(10, finalY - 5, pageWidth - 20, 7, 'F'); 
    doc.setTextColor(0).text(`${group.name} ${group.strumento ? `(${group.strumento})` : ''}`, 12, finalY);
    finalY += 4;

    const tableBody = group.lessons.sort((a,b) => new Date(a.data_lezione) - new Date(b.data_lezione)).map(l => [
      new Date(l.data_lezione).toLocaleDateString('it-IT'),
      `${l.alunni?.cognome || ''} ${l.alunni?.nome || ''}`,
      l.tipi_lezioni?.tipo || 'N.D.',
      l.tipi_lezioni?.durata_minuti ? `${l.tipi_lezioni.durata_minuti}'` : '60\'',
      l.convalidato ? 'Sì' : ''
    ]);

    autoTable(doc, {
      startY: finalY,
      head: [['Data', 'Alunno', 'Tipo Lezione', 'Dur.', 'Valid.']],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [80, 80, 80] },
      margin: { left: 10, right: 10 }
    });
    finalY = doc.lastAutoTable.finalY + 10;
  });

  doc.save(`Registro_Lezioni_${filters.anno.replace('/','-')}.pdf`);
};

/**
 * --- GENERAZIONE RIEPILOGO PAGAMENTI (REPORT) ---
 */
export const generatePaymentsReportPDF = async (schoolInfo, filters, data) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  const logoBase64 = await getBase64ImageFromURL(LOGO_URL);
  if (logoBase64) doc.addImage(logoBase64, 'PNG', 10, 10, 22, 22);

  doc.setFontSize(16).setFont("helvetica", "bold").text(schoolInfo.name || "Accademia della Musica", 35, 18);
  doc.setFontSize(14).setTextColor(168, 28, 28).text("RIEPILOGO VERSAMENTI", 35, 25);
  doc.setFontSize(11).setTextColor(60).setFont("helvetica", "normal").text(`Alunno: ${filters.alunnoName}`, 10, 42);
  doc.text(`Anno Accademico: ${filters.anno}`, pageWidth - 10, 42, { align: 'right' });

  autoTable(doc, {
    startY: 48,
    head: [['Data', 'Causale', 'Metodo', 'Importo']],
    body: data.sort((a,b) => new Date(b.data_pagamento) - new Date(a.data_pagamento)).map(p => [
      new Date(p.data_pagamento).toLocaleDateString('it-IT'),
      p.tipologia,
      p.metodo_pagamento,
      `€ ${parseFloat(p.importo).toFixed(2)}`
    ]),
    theme: 'striped',
    headStyles: { fillColor: [168, 28, 28] },
    columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
  });

  const total = data.reduce((acc, curr) => acc + parseFloat(curr.importo || 0), 0);
  doc.setFontSize(12).setFont("helvetica", "bold").text(`TOTALE COMPLESSIVO: € ${total.toFixed(2)}`, pageWidth - 10, doc.lastAutoTable.finalY + 10, { align: 'right' });
  doc.save(`Report_Pagamenti_${filters.alunnoName.replace(/\s/g, '_')}.pdf`);
};