import html2pdf from 'html2pdf.js';

const MESI = [
  { val: 0, label: 'ISCR' },
  { val: 9, label: 'SET' }, { val: 10, label: 'OTT' }, { val: 11, label: 'NOV' }, 
  { val: 12, label: 'DIC' }, { val: 1, label: 'GEN' }, { val: 2, label: 'FEB' }, 
  { val: 3, label: 'MAR' }, { val: 4, label: 'APR' }, { val: 5, label: 'MAG' }, 
  { val: 6, label: 'GIU' }, { val: 7, label: 'LUG' }
];

const LOGO_URL = "https://mqdpojtisighqjmyzdwz.supabase.co/storage/v1/object/public/images/logo-glow.png";

/**
 * Genera il PDF della ricevuta.
 */
export const generateReceiptPDF = async (data) => {
  const element = document.createElement('div');
  
  // Risoluzione etichetta mese
  const meseLabel = data.mese_rif && data.mese_rif !== 0 
    ? MESI.find(m => m.val === parseInt(data.mese_rif))?.label || '-'
    : null;

  element.innerHTML = `
    <div style="
        width: 210mm; 
        height: 290mm; /* Ridotto leggermente rispetto a 297mm per evitare la pagina bianca extra */
        padding: 15mm; 
        box-sizing: border-box; 
        background-color: #ffffff; 
        color: #333; 
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
        position: relative;
    ">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid #a81c1c;">
            <div style="flex: 1;">
                 <img src="${LOGO_URL}" alt="Logo" style="height: 90px; width: auto; object-fit: contain;" />
            </div>
            
            <div style="flex: 1; text-align: right; font-size: 11px; color: #555; line-height: 1.5;">
                <h4 style="margin: 0 0 5px 0; font-size: 14px; font-weight: bold; color: #000; text-transform: uppercase;">Accademia della Musica</h4>
                <div style="font-weight: 500;">di Piacenza</div>
                Vicolo del Guazzo 2<br>
                29121 PIACENZA<br>
                Telefono: +39 0523 1748531<br>
                Email: accademiadellamusica@libero.it
            </div>
        </div>

        <div style="margin-top: 40px; display: flex; justify-content: space-between;">
            <div>
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Data Pagamento</div>
                <div style="font-size: 14px; font-weight: bold;">${data.data_pagamento}</div>
            </div>
            
            <div style="text-align: right;">
                 <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Ricevuto Da</div>
                 <div style="font-size: 18px; font-weight: bold; color: #000;">${data.alunno_nome}</div>
                 <div style="font-size: 12px; color: #666; margin-top: 2px;">Allievo</div>
            </div>
        </div>

        <div style="margin-top: 50px; margin-bottom: 40px;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead style="background-color: #f3f4f6;">
                    <tr>
                        <th style="text-align: left; padding: 12px 15px; font-size: 11px; text-transform: uppercase; color: #555; font-weight: 700; letter-spacing: 0.5px;">Descrizione Servizio</th>
                        <th style="text-align: right; padding: 12px 15px; font-size: 11px; text-transform: uppercase; color: #555; font-weight: 700; letter-spacing: 0.5px;">Importo</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 20px 15px;">
                            <div style="font-size: 15px; font-weight: 600; color: #000;">${data.tipologia}</div>
                            <div style="font-size: 13px; color: #666; margin-top: 4px;">
                                ${meseLabel ? `Mensilità: ${meseLabel}` : 'Quota Iscrizione / Altro'}
                                <span style="margin: 0 5px;">•</span>
                                Anno Accademico: ${data.aa || '2025/2026'}
                            </div>
                            ${data.note ? `<div style="margin-top: 8px; font-size: 12px; font-style: italic; color: #888;">Note: ${data.note}</div>` : ''}
                        </td>
                        <td style="padding: 20px 15px; text-align: right; vertical-align: top;">
                            <span style="font-size: 16px; font-weight: 600;">€ ${parseFloat(data.importo).toFixed(2)}</span>
                        </td>
                    </tr>
                    <tr><td colspan="2" style="height: 50px;"></td></tr>
                </tbody>
                <tfoot style="border-top: 2px solid #000;">
                    <tr>
                        <td style="padding: 20px 15px; text-align: right; font-size: 14px; font-weight: bold; text-transform: uppercase;">Totale Versato</td>
                        <td style="padding: 20px 15px; text-align: right; font-size: 24px; font-weight: 700; color: #a81c1c;">
                            € ${parseFloat(data.importo).toFixed(2)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <div style="position: absolute; bottom: 40mm; left: 15mm; right: 15mm;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div style="font-size: 9px; color: #999; line-height: 1.4;">
                    <p style="margin: 0;">Il presente documento costituisce semplice ricevuta di pagamento.</p>
                    <p style="margin: 0; font-weight: bold; color: #555;">NON VALIDO AI FINI FISCALI</p>
                </div>
                
                <div style="text-align: center;">
                    <div style="margin-bottom: 40px; font-size: 11px; color: #555;">Firma per quietanza</div>
                    <div style="border-bottom: 1px solid #aaa; width: 200px;"></div>
                </div>
            </div>
        </div>
    </div>
  `;

  // Pulizia nome file
  const safeName = data.alunno_nome.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const safeDate = data.data_pagamento.replace(/[^0-9]/g, '-');

  const opt = {
    margin: 0, // Margini gestiti internamente dal CSS per precisione
    filename: `Ricevuta_${safeName}_${safeDate}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  
  await html2pdf().set(opt).from(element).save();
};