/**
 * financeManager.js
 * Utility centralizzata per il calcolo di sconti, pacchetti e totali finanziari.
 */

function getWeekInfo(dateInput) {
    const d = new Date(dateInput);
    d.setHours(12, 0, 0, 0); 
    
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7; 
    
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    
    const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
    const year = target.getFullYear(); 
    
    const mondayDate = new Date(d.valueOf());
    mondayDate.setDate(d.getDate() - dayNr);
    
    return {
        weekKey: `${year}-W${String(weekNumber).padStart(2, '0')}`,
        mondayDate: mondayDate,
        weekNumber: weekNumber
    };
}

export function calcolaScontiPacchetti(lezioni, regolePacchetti) {
    if (!lezioni || lezioni.length === 0) return [];
    if (!regolePacchetti || regolePacchetti.length === 0) return lezioni;

    // 1. Raggruppa lezioni PRIMA per Alunno e POI per Settimana ISO
    const alunniWeeksMap = {};

    lezioni.forEach(lez => {
        const { weekKey, mondayDate, weekNumber } = getWeekInfo(lez.data_lezione);
        const alunnoId = lez.alunno_id;

        if (!alunniWeeksMap[alunnoId]) {
            alunniWeeksMap[alunnoId] = {};
        }
        
        if (!alunniWeeksMap[alunnoId][weekKey]) {
            alunniWeeksMap[alunnoId][weekKey] = {
                monday: mondayDate,
                number: weekNumber,
                lessons: []
            };
        }
        alunniWeeksMap[alunnoId][weekKey].lessons.push(lez);
    });

    const scontiGenerati = [];
    const usedLessonIds = new Set(); 

    // 2. Itera isolando i calcoli alunno per alunno
    Object.values(alunniWeeksMap).forEach(weeksMap => {
        Object.keys(weeksMap).forEach(key => {
            const weekData = weeksMap[key];
            // Ordina cronologicamente le lezioni nella settimana
            const weeklyLessons = weekData.lessons.sort((a,b) => new Date(a.data_lezione) - new Date(b.data_lezione));

            regolePacchetti.forEach(regola => {
                let matchFound = true;

                while (matchFound) {
                    const candidateA = weeklyLessons.find(l => 
                        !usedLessonIds.has(l.id) && 
                        (l.tipi_lezioni?.tipo === regola.tipo_lezione_a)
                    );

                    const candidateB = weeklyLessons.find(l => 
                        !usedLessonIds.has(l.id) && 
                        (l.tipi_lezioni?.tipo === regola.tipo_lezione_b) &&
                        (candidateA ? l.id !== candidateA.id : true)
                    );

                    if (candidateA && candidateB) {
                        usedLessonIds.add(candidateA.id);
                        usedLessonIds.add(candidateB.id);

                        const dateA = new Date(candidateA.data_lezione).toLocaleDateString('it-IT', {day: '2-digit', month: '2-digit'});
                        const dateB = new Date(candidateB.data_lezione).toLocaleDateString('it-IT', {day: '2-digit', month: '2-digit'});

                        // Data riferita alla prima lezione cronologica
                        const dataRiferimento = new Date(candidateA.data_lezione) < new Date(candidateB.data_lezione) 
                            ? candidateA.data_lezione 
                            : candidateB.data_lezione;

                        const scontoObj = {
                            id: `sconto-${key}-${candidateA.id}-${candidateB.id}`,
                            is_virtual: true,
                            data_lezione: dataRiferimento,
                            importo_saldato: 0, 
                            costo_calcolato: -Math.abs(Number(regola.sconto)), // Negativo
                            tipi_lezioni: { tipo: 'SCONTO' },
                            descrizione_sconto: `${regola.descrizione || 'Sconto Combo'}`,
                            dettaglio_settimana: `Sett. ${weekData.number} (Lez: ${dateA} e ${dateB})`,
                            alunno_id: candidateA.alunno_id,
                            school_id: candidateA.school_id,
                            docente_id: null // <-- Svincolato dal docente come richiesto
                        };

                        scontiGenerati.push(scontoObj);
                    } else {
                        matchFound = false; 
                    }
                }
            });
        });
    });

    const risultato = [...lezioni, ...scontiGenerati];
    return risultato.sort((a, b) => new Date(a.data_lezione) - new Date(b.data_lezione));
}