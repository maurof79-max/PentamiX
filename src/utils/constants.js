// Definizione mesi standard (Settembre -> Luglio)
export const MESI_STANDARD = [
  { val: 9, label: 'Settembre', short: 'SET' },
  { val: 10, label: 'Ottobre', short: 'OTT' },
  { val: 11, label: 'Novembre', short: 'NOV' },
  { val: 12, label: 'Dicembre', short: 'DIC' },
  { val: 1, label: 'Gennaio', short: 'GEN' },
  { val: 2, label: 'Febbraio', short: 'FEB' },
  { val: 3, label: 'Marzo', short: 'MAR' },
  { val: 4, label: 'Aprile', short: 'APR' },
  { val: 5, label: 'Maggio', short: 'MAG' },
  { val: 6, label: 'Giugno', short: 'GIU' },
  { val: 7, label: 'Luglio', short: 'LUG' }
];

// Opzione per "Iscrizione" (usata nei pagamenti)
export const OPZIONE_ISCR = { val: 0, label: 'Iscrizione', short: 'ISCR' };

// Lista completa per pagamenti e report (include Iscrizione)
export const MESI_COMPLETE = [OPZIONE_ISCR, ...MESI_STANDARD];

// Anni accademici (Fallback/Statici)
export const ANNI_ACCADEMICI_LIST = [
    '2023/2024',
    '2024/2025',
    '2025/2026',
    '2026/2027'
];

// Calcola l'anno accademico corrente (es. oggi è Ott 2025 -> 2025/2026)
export const getCurrentAcademicYear = () => {
    const today = new Date();
    const month = today.getMonth() + 1; 
    const year = today.getFullYear();
    if (month >= 9) return `${year}/${year + 1}`;
    return `${year - 1}/${year}`;
};

// Calcola l'anno accademico basato su una data specifica
export const getAcademicYearFromDate = (dateString) => {
    if (!dateString) return getCurrentAcademicYear();
    const d = new Date(dateString);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    if (month >= 9) return `${year}/${year + 1}`;
    return `${year - 1}/${year}`;
};