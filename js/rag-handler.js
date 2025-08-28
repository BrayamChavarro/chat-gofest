// js/rag-handler.js

// Verificar que las librerías estén disponibles
console.log('Checking available libraries...');
console.log('window.langchain:', typeof window.langchain);
console.log('window.GoogleGenerativeAI:', typeof window.GoogleGenerativeAI);

// Implementación simplificada sin LangChain para evitar problemas de CDN
// Usaremos una implementación básica de vectores en memoria

let documentChunks = [];
let availableQuestions = [];
let questionCategories = {};

/**
 * Función mejorada para dividir texto en chunks preservando preguntas y respuestas completas
 */
function splitTextIntoChunks(text, chunkSize = 1500, overlap = 200) {
    const chunks = [];
    
    // Dividir por bloques de P: y R: para mantener preguntas y respuestas juntas
    const qaBlocks = text.split(/(?=P: )/g).filter(block => block.trim().length > 0);
    
    let currentChunk = '';
    
    for (const block of qaBlocks) {
        const blockTrimmed = block.trim();
        
        // Si agregar este bloque excedería el tamaño del chunk y ya tenemos contenido
        if (currentChunk.length + blockTrimmed.length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            
            // Crear overlap tomando el final del chunk anterior
            const lines = currentChunk.split('\n');
            const overlapLines = lines.slice(-Math.floor(overlap / 50)); // Aproximadamente overlap/50 líneas
            currentChunk = overlapLines.join('\n') + '\n\n' + blockTrimmed;
        } else {
            if (currentChunk.length > 0) {
                currentChunk += '\n\n' + blockTrimmed;
            } else {
                currentChunk = blockTrimmed;
            }
        }
    }
    
    // Agregar el último chunk si tiene contenido
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    // Si no se crearon chunks por bloques P:R:, usar división por párrafos
    if (chunks.length === 0) {
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        currentChunk = '';
        
        for (const paragraph of paragraphs) {
            if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = paragraph;
            } else {
                if (currentChunk.length > 0) {
                    currentChunk += '\n\n' + paragraph;
                } else {
                    currentChunk = paragraph;
                }
            }
        }
        
        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
        }
    }
    
    return chunks;
}

/**
 * Extrae todas las preguntas del documento para crear recomendaciones
 */
function extractQuestionsFromText(text) {
    const questions = [];
    const categories = {
        'Información General': [],
        'Participación': [],
        'Logística': [],
        'Metodología': [],
        'Evaluación': [],
        'Aspectos Legales': [],
        'Retos y Material': [],
        'Contexto Estratégico': [],
        'Historia y Resultados': [],
        'Habilidades': []
    };
    
    // Dividir el texto en líneas
    const lines = text.split('\n');
    let currentCategory = 'Información General';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Detectar categorías mejoradas
        if (line && !line.startsWith('P:') && !line.startsWith('R:') && 
            !line.startsWith('Fundación') && !line.startsWith('Universidad') && 
            !line.startsWith('UNAD') && !line.startsWith('U.D.C.A') && 
            !line.startsWith('Uniagraria') && !line.startsWith('Uniminuto') &&
            !line.startsWith('DÍA') && !line.startsWith('RETO') &&
            line.length > 10 && !line.includes('2025')) {
            
            if (line.includes('Participación') || line.includes('Requisitos')) {
                currentCategory = 'Participación';
            } else if (line.includes('Logística')) {
                currentCategory = 'Logística';
            } else if (line.includes('Dinámica') || line.includes('Metodología')) {
                currentCategory = 'Metodología';
            } else if (line.includes('Evaluación') || line.includes('Premios')) {
                currentCategory = 'Evaluación';
            } else if (line.includes('Legales')) {
                currentCategory = 'Aspectos Legales';
            } else if (line.includes('Retos') || line.includes('Material')) {
                currentCategory = 'Retos y Material';
            } else if (line.includes('Contexto') || line.includes('Estratégico') || line.includes('Gofest') || line.includes('mentores')) {
                currentCategory = 'Contexto Estratégico';
            } else if (line.includes('Historia') || line.includes('Oportunidades') || line.includes('Post-Evento') || line.includes('resultados') || line.includes('pasado')) {
                currentCategory = 'Historia y Resultados';
            } else if (line.includes('Habilidades')) {
                currentCategory = 'Habilidades';
            }
        }
        
        // Extraer preguntas
        if (line.startsWith('P: ')) {
            const question = line.substring(3); // Remover "P: "
            questions.push({
                question: question,
                category: currentCategory,
                line: i + 1
            });
            categories[currentCategory].push(question);
        }
    }
    
    return { questions, categories };
}

/**
 * Función mejorada para buscar chunks relevantes basándose en palabras clave y contexto
 */
function findRelevantChunks(query, chunks, maxChunks = 4) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
    const chunkScores = [];
    
    // Palabras clave importantes para dar más peso
    const importantWords = ['organiza', 'organizador', 'universidades', 'instituciones', '3de', 'evento', 'cámara', 'comercio'];
    
    chunks.forEach((chunk, index) => {
        const chunkLower = chunk.toLowerCase();
        let score = 0;
        
        // Bonus por contener pregunta similar
        if (chunkLower.includes('p:') && chunkLower.includes('organiza')) {
            score += 10;
        }
        
        queryWords.forEach(rawWord => {
            // Escapar caracteres especiales de regex
            const word = rawWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Contar coincidencias exactas
            const exactMatches = (chunkLower.match(new RegExp(word, 'g')) || []).length;
            let wordScore = exactMatches * 2;
            
            // Dar más peso a palabras importantes
            if (importantWords.includes(word)) {
                wordScore *= 3;
            }
            
            score += wordScore;
            
            // Contar coincidencias parciales
            if (chunkLower.includes(word)) {
                score += 1;
            }
        });
        
        // Bonus por tener estructura de P: R:
        if (chunkLower.includes('p:') && chunkLower.includes('r:')) {
            score += 5;
        }
        
        chunkScores.push({ chunk, score, index });
    });
    
    // Ordenar por score y tomar los mejores
    const sortedChunks = chunkScores
        .sort((a, b) => b.score - a.score)
        .slice(0, maxChunks);
    
    console.log('Chunks encontrados con scores:', sortedChunks.map(item => ({
        score: item.score,
        preview: item.chunk.substring(0, 100) + '...'
    })));
    
    return sortedChunks.map(item => item.chunk);
}

/**
 * Inicializa el manejador RAG. Carga el documento y lo divide en chunks.
 * @param {string} apiKey - Tu clave de API de Gemini.
 */
window.initializeRAG = async function(apiKey) {
  try {
    console.log("Inicializando RAG...");

    // 1. Cargar el documento de texto plano
    const response = await fetch('./informacion.txt');
    const text = await response.text();
    console.log("Documento cargado, tamaño:", text.length, "caracteres");

    // 2. Dividir el texto en fragmentos preservando P: y R: completas
    documentChunks = splitTextIntoChunks(text, 1500, 200);
    console.log(`Documento dividido en ${documentChunks.length} fragmentos.`);
    
    // 3. Extraer preguntas para recomendaciones
    const { questions, categories } = extractQuestionsFromText(text);
    availableQuestions = questions;
    questionCategories = categories;
    console.log(`Extraídas ${questions.length} preguntas para recomendaciones.`);
    console.log('Categorías encontradas:', Object.keys(categories));
    
    // Debug: mostrar algunos chunks para verificar
    console.log('Primeros chunks creados:');
    documentChunks.slice(0, 2).forEach((chunk, i) => {
        console.log(`Chunk ${i + 1}:`, chunk.substring(0, 150) + '...');
    });

    console.log("RAG inicializado correctamente con búsqueda por palabras clave!");
    return true;

  } catch (error) {
    console.error("Error inicializando RAG:", error);
    return false;
  }
}

/**
 * Realiza una consulta RAG: busca en los documentos y construye un prompt.
 * @param {string} query - La pregunta del usuario.
 * @returns {Promise<string>} El prompt aumentado para enviar a Gemini.
 */
window.ragQuery = async function(query) {
  if (!documentChunks || documentChunks.length === 0) {
    throw new Error("El sistema RAG no ha sido inicializado.");
  }

  console.log(`Buscando información relevante para: "${query}"`);

  // Buscar chunks relevantes usando búsqueda por palabras clave
  const relevantChunks = findRelevantChunks(query, documentChunks, 3);
  console.log(`Encontrados ${relevantChunks.length} fragmentos relevantes.`);

  // Debug: mostrar el contenido de los chunks encontrados
  relevantChunks.forEach((chunk, i) => {
    console.log(`Chunk relevante ${i + 1}:`, chunk.substring(0, 200) + '...');
  });

  // Construir el contexto y el prompt para Gemini
  const context = relevantChunks.join("\n\n---\n\n");

  const promptTemplate = `
    INSTRUCCIONES:
    1. Eres un asistente experto llamado "Impulso IA" que responde preguntas basándose EXCLUSIVAMENTE en el contexto proporcionado.
    2. Tu tono debe ser amable, profesional y directo.
    3. Si la respuesta no se encuentra en el contexto, responde exactamente: "No tengo suficiente información en mis documentos para responder a esa pregunta."
    4. No utilices ningún conocimiento externo.

    CONTEXTO:
    {context}

    PREGUNTA:
    {query}

    RESPUESTA:
  `;

  const finalPrompt = promptTemplate
    .replace("{context}", context)
    .replace("{query}", query);

  console.log("--- PROMPT AUMENTADO CREADO ---");
  console.log("Contexto incluido:", context.substring(0, 300) + "...");
  console.log("Longitud total del contexto:", context.length, "caracteres");
  return finalPrompt;
}

/**
 * Obtiene recomendaciones de mensajes basándose en categoría o aleatorias
 * @param {string} category - Categoría específica (opcional)
 * @param {number} count - Número de recomendaciones a devolver
 * @returns {Array} Array de preguntas recomendadas
 */
window.getMessageRecommendations = function(category = null, count = 4) {
    if (!availableQuestions || availableQuestions.length === 0) {
        console.warn('No hay preguntas disponibles para recomendar');
        return [];
    }
    
    let questionsToChooseFrom;
    
    if (category && questionCategories[category]) {
        questionsToChooseFrom = questionCategories[category];
    } else {
        // Mezclar preguntas de todas las categorías, priorizando las más populares
        const popularQuestions = [
            '¿Qué es el 3dE?',
            '¿Quién organiza el evento 3dE?',
            '¿Cuándo y dónde se realizará el 3dE 2025?',
            '¿Quiénes pueden participar en el 3dE?',
            '¿Cuáles son los requisitos para participar?',
            '¿Cómo es la dinámica del 3dE?',
            '¿Tiene algún costo participar?',
            '¿Cómo me puedo inscribir?',
            '¿Cuáles son los retos del 3dE 2025?',
            '¿Puedes darme toda la información detallada sobre el reto de Schneider Electric (Dexson)?',
            '¿Puedes darme toda la información detallada sobre el reto de CCL (Corporación Colombiana de Logística)?',
            '¿Puedes darme toda la información detallada sobre el reto de Comestibles Ricos?',
            '¿Puedes darme la agenda detallada del primer día?',
            '¿Qué se hará durante el segundo día?',
            '¿En qué consiste el último día?',
            '¿Qué habilidades se promueven en el 3dE?',
            '¿Quiénes evalúan las propuestas?',
            '¿Cómo se evalúan los proyectos?',
            '¿Qué premios o reconocimientos se entregan?',
            'Más allá del certificado, ¿qué oportunidades reales existen para los ganadores?'
        ];
        
        // Combinar preguntas populares con algunas aleatorias
        const allQuestions = availableQuestions.map(q => q.question);
        const otherQuestions = allQuestions.filter(q => !popularQuestions.includes(q));
        
        questionsToChooseFrom = [...popularQuestions, ...otherQuestions];
    }
    
    // Seleccionar preguntas aleatoriamente sin repetir
    const shuffled = [...questionsToChooseFrom].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));
    
    console.log('Generated recommendations:', selected);
    return selected;
}

// Utilidad de depuración para verificar que las preguntas específicas existen
window.debugListChallengeQuestions = function() {
    const targets = [
        '¿Puedes darme toda la información detallada sobre el reto de Schneider Electric (Dexson)?',
        '¿Puedes darme toda la información detallada sobre el reto de CCL (Corporación Colombiana de Logística)?',
        '¿Puedes darme toda la información detallada sobre el reto de Comestibles Ricos?'
    ];
    console.log('--- Debug Retos ---');
    if (!availableQuestions || availableQuestions.length === 0) {
        console.warn('No hay preguntas cargadas aún');
        return;
    }
    targets.forEach(t => {
        const found = availableQuestions.some(q => q.question === t);
        console.log(found ? 'OK:' : 'FALTA:', t);
    });
    console.log('Total preguntas cargadas:', availableQuestions.length);
};

/**
 * Obtiene recomendaciones contextuales basándose en la última pregunta del usuario
 * @param {string} lastUserMessage - Último mensaje del usuario
 * @param {number} count - Número de recomendaciones
 * @returns {Array} Array de preguntas relacionadas
 */
window.getContextualRecommendations = function(lastUserMessage, count = 3) {
    if (!availableQuestions || availableQuestions.length === 0) {
        return window.getMessageRecommendations(null, count);
    }
    
    const messageLower = lastUserMessage.toLowerCase();
    const scored = [];
    
    availableQuestions.forEach(item => {
        const questionLower = item.question.toLowerCase();
        let score = 0;
        
        // Scoring basado en palabras clave comunes
        const messageWords = messageLower.split(/\s+/).filter(w => w.length > 2);
        const questionWords = questionLower.split(/\s+/).filter(w => w.length > 2);
        
        messageWords.forEach(word => {
            if (questionWords.includes(word)) {
                score += 2;
            }
        });
        
        // Bonus por categoría relacionada
        if (messageLower.includes('particip') && item.category === 'Participación') score += 5;
        if (messageLower.includes('cuándo') && item.category === 'Logística') score += 5;
        if (messageLower.includes('cómo') && item.category === 'Metodología') score += 5;
        if (messageLower.includes('premio') && item.category === 'Evaluación') score += 5;
        
        if (score > 0) {
            scored.push({ ...item, score });
        }
    });
    
    // Si no hay coincidencias contextuales, devolver recomendaciones generales
    if (scored.length === 0) {
        return window.getMessageRecommendations(null, count);
    }
    
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(item => item.question);
}

/**
 * Obtiene todas las categorías disponibles
 * @returns {Array} Array de nombres de categorías
 */
window.getQuestionCategories = function() {
    return Object.keys(questionCategories).filter(cat => questionCategories[cat].length > 0);
}

/**
 * Fuerza la generación de recomendaciones completamente nuevas
 * @param {number} count - Número de recomendaciones
 * @returns {Array} Array de preguntas aleatorias
 */
window.getRandomRecommendations = function(count = 4) {
    if (!availableQuestions || availableQuestions.length === 0) {
        console.warn('No hay preguntas disponibles para recomendar');
        return [];
    }
    
    // Preguntas destacadas que queremos mostrar más frecuentemente
    const priorityQuestions = [
        '¿Qué es el 3dE?',
            '¿Quién organiza el evento 3dE?',
            '¿Cuándo y dónde se realizará el 3dE 2025?',
            '¿Quiénes pueden participar en el 3dE?',
            '¿Cuáles son los requisitos para participar?',
            '¿Cómo es la dinámica del 3dE?',
            '¿Tiene algún costo participar?',
            '¿Cómo me puedo inscribir?',
            '¿Cuáles son los retos del 3dE 2025?',
            '¿Puedes darme toda la información detallada sobre el reto de Schneider Electric (Dexson)?',
            '¿Puedes darme toda la información detallada sobre el reto de CCL (Corporación Colombiana de Logística)?',
            '¿Puedes darme toda la información detallada sobre el reto de Comestibles Ricos?',
            '¿Puedes darme la agenda detallada del primer día?',
            '¿Qué se hará durante el segundo día?',
            '¿En qué consiste el último día?',
            '¿Qué habilidades se promueven en el 3dE?',
            '¿Quiénes evalúan las propuestas?',
            '¿Cómo se evalúan los proyectos?',
            '¿Qué premios o reconocimientos se entregan?',
            'Más allá del certificado, ¿qué oportunidades reales existen para los ganadores?'
    ];
    
    // Filtrar preguntas prioritarias que existen en availableQuestions
    const availableQuestionTexts = availableQuestions.map(q => q.question);
    const availablePriority = priorityQuestions.filter(pq => 
        availableQuestionTexts.some(aq => aq === pq)
    );
    
    // Preguntas no prioritarias
    const nonPriority = availableQuestionTexts.filter(q => 
        !priorityQuestions.includes(q)
    );
    
    // Estrategia: 60% prioritarias, 40% aleatorias
    const priorityCount = Math.ceil(count * 0.6);
    const randomCount = count - priorityCount;
    
    // Seleccionar preguntas prioritarias
    const shuffledPriority = [...availablePriority].sort(() => 0.5 - Math.random());
    const selectedPriority = shuffledPriority.slice(0, Math.min(priorityCount, shuffledPriority.length));
    
    // Seleccionar preguntas aleatorias
    const shuffledNonPriority = [...nonPriority].sort(() => 0.5 - Math.random());
    const selectedRandom = shuffledNonPriority.slice(0, Math.min(randomCount, shuffledNonPriority.length));
    
    // Combinar y mezclar resultado final
    const finalSelection = [...selectedPriority, ...selectedRandom];
    const finalShuffled = finalSelection.sort(() => 0.5 - Math.random());
    
    console.log('Generated recommendations with priority logic:', finalShuffled);
    return finalShuffled.slice(0, count);
}

// Función de test para verificar chunking (temporal)
window.testRAGChunking = function() {
  console.log("=== TEST DE CHUNKING ===");
  console.log("Total chunks:", documentChunks.length);
  
  // Buscar el chunk que contiene la pregunta sobre organizadores
  const organizerChunks = documentChunks.filter(chunk => 
    chunk.toLowerCase().includes('organiza') && chunk.toLowerCase().includes('universidades')
  );
  
  console.log("Chunks que contienen info de organizadores:", organizerChunks.length);
  organizerChunks.forEach((chunk, i) => {
    console.log(`Organizer chunk ${i + 1}:`, chunk);
  });
  
  // Test de búsqueda
  const testQuery = "¿Quién organiza el evento 3dE?";
  const relevantChunks = findRelevantChunks(testQuery, documentChunks, 3);
  console.log("Chunks relevantes para test query:", relevantChunks);
  
  // Test de recomendaciones
  console.log("\n=== TEST DE RECOMENDACIONES ===");
  console.log("Preguntas disponibles:", availableQuestions.length);
  console.log("Categorías:", Object.keys(questionCategories));
  console.log("Recomendaciones generales:", window.getMessageRecommendations());
  console.log("Recomendaciones contextuales para 'participar':", window.getContextualRecommendations('¿Cómo puedo participar?'));
  
  // Test de todas las preguntas cargadas
  console.log("\n=== TODAS LAS PREGUNTAS CARGADAS ===");
  availableQuestions.forEach((q, i) => {
    console.log(`${i + 1}. [${q.category}] ${q.question}`);
  });
  
  console.log("\n=== CATEGORÍAS CON CONTEO ===");
  Object.entries(questionCategories).forEach(([category, questions]) => {
    console.log(`${category}: ${questions.length} preguntas`);
  });
}

// Función para verificar preguntas nuevas específicas
window.testNewQuestions = function() {
  console.log("=== VERIFICACIÓN DE PREGUNTAS NUEVAS ===");
  
  const newQuestions = [
    "¿Por qué el 3dE es parte de Gofest?",
    "¿Qué tipo de retos puedo esperar?",
    "¿Cuál es exactamente el rol de los mentores?",
    "¿Qué habilidades se promueven?",
    "¿Este evento es nuevo?",
    "¿Qué pasa con mi idea si la empresa no la desarrolla?"
  ];
  
  newQuestions.forEach(question => {
    const found = availableQuestions.some(q => q.question.includes(question.substring(0, 20)));
    console.log(`"${question}": ${found ? '✅ ENCONTRADA' : '❌ NO ENCONTRADA'}`);
  });
}