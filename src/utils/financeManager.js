/**
 * financeManager.js
 * Utility centralizzata per il calcolo di sconti, pacchetti e totali finanziari.
 * Gestisce la logica di raggruppamento settimanale per l'applicazione degli sconti combo.
 */

/**
 * Calcola il numero della settimana ISO e la data del Lunedì di quella settimana.
 * @param {string|Date} dateInput - Data della lezione
 * @returns {object} { weekKey: 'YYYY-Www', mondayDate: DateObj }
 */
function getWeekInfo(dateInput) {
    const d = new Date(dateInput);
    // Imposta l'orario a mezzogiorno per evitare problemi di fuso orario
    d.setHours(12, 0, 0, 0); 
    
    // Copia per calcolo ISO
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7; // Lunedì = 0, Domenica = 6
    
    // Imposta al giovedì più vicino per calcolare l'anno ISO corretto
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    
    // Calcolo numero settimana
    const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
    const year = target.getFullYear(); // Anno ISO
    
    // Calcolo data del Lunedì di questa settimana
    const mondayDate = new Date(d.valueOf());
    mondayDate.setDate(d.getDate() - dayNr);
    
    return {
        weekKey: `${year}-W${String(weekNumber).padStart(2, '0')}`,
        mondayDate: mondayDate,
        weekNumber: weekNumber
    };
}

/**
 * Elabora le lezioni e applica le regole dei pacchetti/sconti.
 * @param {Array} lezioni - Array di oggetti lezione dal DB (registro)
 * @param {Array} regolePacchetti - Array di oggetti regole da tariffe_pacchetti
 * @returns {Array} Array contenente le lezioni originali + gli oggetti sconto virtuali (importo negativo)
 */
export function calcolaScontiPacchetti(lezioni, regolePacchetti) {
    if (!lezioni || lezioni.length === 0) return [];
    if (!regolePacchetti || regolePacchetti.length === 0) return lezioni;

    // 1. Raggruppa lezioni per Settimana ISO
    const weeksMap = {};

    lezioni.forEach(lez => {
        const { weekKey, mondayDate, weekNumber } = getWeekInfo(lez.data_lezione);
        
        if (!weeksMap[weekKey]) {
            weeksMap[weekKey] = {
                monday: mondayDate,
                number: weekNumber,
                lessons: []
            };
        }
        weeksMap[weekKey].lessons.push(lez);
    });

    const scontiGenerati = [];
    const usedLessonIds = new Set(); // Traccia le lezioni già usate per uno sconto

    // 2. Itera su ogni settimana
    Object.keys(weeksMap).forEach(key => {
        const weekData = weeksMap[key];
        const weeklyLessons = weekData.lessons;

        // 3. Applica le regole (in ordine di definizione)
        regolePacchetti.forEach(regola => {
            let matchFound = true;

            // Continua a cercare match finché ci sono lezioni disponibili per questa regola
            while (matchFound) {
                // Cerca lezione A disponibile
                const candidateA = weeklyLessons.find(l => 
                    !usedLessonIds.has(l.id) && 
                    (l.tipi_lezioni?.tipo === regola.tipo_lezione_a)
                );

                // Cerca lezione B disponibile (deve essere diversa da A se i tipi sono uguali)
                const candidateB = weeklyLessons.find(l => 
                    !usedLessonIds.has(l.id) && 
                    (l.tipi_lezioni?.tipo === regola.tipo_lezione_b) &&
                    (candidateA ? l.id !== candidateA.id : true)
                );

                if (candidateA && candidateB) {
                    // MATCH TROVATO!
                    usedLessonIds.add(candidateA.id);
                    usedLessonIds.add(candidateB.id);

                    // Formatta date per descrizione
                    const dateA = new Date(candidateA.data_lezione).toLocaleDateString('it-IT', {day: '2-digit', month: '2-digit'});
                    const dateB = new Date(candidateB.data_lezione).toLocaleDateString('it-IT', {day: '2-digit', month: '2-digit'});

                    // Crea l'oggetto sconto virtuale
                    const scontoObj = {
                        id: `sconto-${key}-${candidateA.id}-${candidateB.id}`, // ID Univoco Virtuale
                        is_virtual: true, // Flag per UI
                        
                        // Attribuzione Temporale: Usiamo il Lunedì della settimana
                        // Questo garantisce che lo sconto finisca nel mese di inizio settimana
                        data_lezione: weekData.monday.toISOString().split('T')[0],
                        
                        // Dati Finanziari
                        importo_saldato: 0, // Non rilevante per il dovuto
                        costo_calcolato: -Math.abs(Number(regola.sconto)), // Importo NEGATIVO
                        
                        // Metadati per UI
                        tipi_lezioni: { tipo: 'SCONTO' },
                        descrizione_sconto: `${regola.descrizione || 'Sconto Combo'}`,
                        dettaglio_settimana: `Sett. ${weekData.number} (Lez: ${dateA} e ${dateB})`,
                        
                        // Collegamenti
                        alunno_id: candidateA.alunno_id,
                        // Attribuiamo lo sconto al docente della lezione A per raggruppamento (convenzione)
                        docente_id: candidateA.docente_id, 
                        school_id: candidateA.school_id
                    };

                    scontiGenerati.push(scontoObj);
                } else {
                    matchFound = false; // Nessun'altra coppia trovata per questa regola in questa settimana
                }
            }
        });
    });

    // 4. Unisci e Ordina per data
    const risultato = [...lezioni, ...scontiGenerati];
    return risultato.sort((a, b) => new Date(a.data_lezione) - new Date(b.data_lezione));
}