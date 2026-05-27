/* ====================================================================
   TRINÔMIO QUADRADO PERFEITO - SCRIPT PRINCIPAL
   --------------------------------------------------------------------
   Arquitetura: três módulos independentes (IIFE namespaces) com um
   módulo utilitário compartilhado de Feedback Multissensorial.
   
   ÍNDICE:
   1. Feedback   — Vibração + Som + Animações (Módulo 3)
   2. Navegacao  — Troca entre abas
   3. Simulador  — Módulo 1: visualização geométrica do (a+b)²
   4. JogoNivel2 — Módulo 2: jogo "Complete a expressão"
   5. Libras     — Botão flutuante e modal placeholder
   6. Bootstrap  — Inicialização de tudo
   ==================================================================== */


/* ====================================================================
   1. FEEDBACK MULTISSENSORIAL (Módulo 3)
   --------------------------------------------------------------------
   Centraliza: vibração tátil, som via WebAudio e atalhos de animação.
   Cada estudante pode ligar/desligar individualmente.
   ==================================================================== */
const Feedback = (() => {
    'use strict';

    // Estado das preferências (sincronizado com os toggles do Módulo 3)
    const estado = {
        vibracaoAtiva: true,
        somAtivo: true,
        movimentoReduzido: false,
        librasVisivel: false
    };

    // Contexto de áudio criado sob demanda (regra dos navegadores modernos)
    let audioCtx = null;

    /**
     * Inicializa (ou retorna) o AudioContext.
     * Só pode ser criado após uma interação do usuário.
     */
    function obterAudioCtx() {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) audioCtx = new AC();
        }
        return audioCtx;
    }

    /**
     * Reproduz um beep sintético com forma de onda controlada.
     * @param {number} frequencia - Hz inicial
     * @param {number} duracao    - segundos
     * @param {string} tipo       - 'sine' | 'triangle' | 'sawtooth' | 'square'
     * @param {number} frequenciaFinal - opcional, para criar varredura
     */
    function tocarBeep(frequencia, duracao, tipo = 'sine', frequenciaFinal = null) {
        if (!estado.somAtivo) return;
        const ctx = obterAudioCtx();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();

        osc.type = tipo;
        osc.frequency.setValueAtTime(frequencia, ctx.currentTime);
        if (frequenciaFinal !== null) {
            osc.frequency.exponentialRampToValueAtTime(
                Math.max(frequenciaFinal, 0.01),
                ctx.currentTime + duracao
            );
        }

        // Envelope ADSR simplificado para não estourar
        ganho.gain.setValueAtTime(0, ctx.currentTime);
        ganho.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.01);
        ganho.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duracao);

        osc.connect(ganho);
        ganho.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duracao);
    }

    /**
     * Vibra o dispositivo se a API estiver disponível e o usuário permitir.
     * @param {number|number[]} padrao - duração(ões) em ms
     */
    function vibrar(padrao) {
        if (!estado.vibracaoAtiva) return;
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate(padrao);
            } catch (e) {
                console.warn('Vibração não suportada:', e);
            }
        }
    }

    // === API PÚBLICA ===

    /** Feedback positivo: vibração curta + acorde ascendente */
    function acerto() {
        vibrar([100]);              // requisito: navigator.vibrate([100])
        tocarBeep(523.25, 0.08, 'sine');                 // dó5
        setTimeout(() => tocarBeep(659.25, 0.08, 'sine'), 80);  // mi5
        setTimeout(() => tocarBeep(783.99, 0.18, 'sine'), 160); // sol5
    }

    /** Feedback negativo: três pulsos + tom descendente */
    function erro() {
        vibrar([50, 50, 50]);       // requisito: navigator.vibrate([50, 50, 50])
        tocarBeep(220, 0.25, 'triangle', 110);
    }

    /** Toque leve (interações neutras, como mudança de slider) */
    function clique() {
        vibrar([20]);
    }

    /** Atualiza preferências e dispara efeitos colaterais (ex.: classe no body) */
    function atualizarPreferencia(chave, valor) {
        estado[chave] = valor;
        if (chave === 'movimentoReduzido') {
            document.body.classList.toggle('movimento-reduzido', valor);
        }
    }

    function obterEstado() {
        return { ...estado };
    }

    return { acerto, erro, clique, atualizarPreferencia, obterEstado };
})();


/* ====================================================================
   2. NAVEGAÇÃO ENTRE ABAS
   ==================================================================== */
const Navegacao = (() => {
    'use strict';

    function inicializar() {
        const abas = document.querySelectorAll('.aba');
        const modulos = document.querySelectorAll('.modulo');

        abas.forEach(aba => {
            aba.addEventListener('click', () => {
                const alvo = aba.dataset.aba;

                // Atualiza estado visual das abas
                abas.forEach(a => {
                    a.classList.remove('aba--ativa');
                    a.setAttribute('aria-selected', 'false');
                });
                aba.classList.add('aba--ativa');
                aba.setAttribute('aria-selected', 'true');

                // Mostra apenas o módulo correspondente
                modulos.forEach(m => {
                    m.classList.toggle('modulo--ativo', m.id === alvo);
                });

                Feedback.clique();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    return { inicializar };
})();


/* ====================================================================
   3. SIMULADOR GEOMÉTRICO (Módulo 1)
   --------------------------------------------------------------------
   Renderiza no <canvas> um quadrado de lado (a+b) decomposto em:
     • a²  → quadrado vermelho (superior-esquerdo)
     • b²  → quadrado azul  (inferior-direito)
     • a·b → dois retângulos amarelos (superior-direito e inferior-esquerdo)
   Os valores e equações se atualizam ao vivo.
   ==================================================================== */
const Simulador = (() => {
    'use strict';

    // Referências DOM
    let canvas, ctx;
    let sliderA, sliderB;
    let valorA_el, valorB_el;
    let eqTotal, eqA2, eq2ab, eqB2, eqSoma;
    let indicadorLado;

    // Estado atual
    let valorA = 3;
    let valorB = 2;

    // Cores (sincronizadas com o CSS via getComputedStyle)
    let cores = {
        a: '#D62828',
        b: '#003566',
        ab: '#F4A800',
        tinta: '#1A1614',
        papel: '#FAF6EE'
    };

    /**
     * Inicializa elementos e listeners.
     */
    function inicializar() {
        canvas = document.getElementById('canvas-quadrado');
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        sliderA = document.getElementById('slider-a');
        sliderB = document.getElementById('slider-b');
        valorA_el = document.getElementById('valor-a');
        valorB_el = document.getElementById('valor-b');
        eqTotal = document.getElementById('eq-total');
        eqA2 = document.getElementById('eq-a2');
        eq2ab = document.getElementById('eq-2ab');
        eqB2 = document.getElementById('eq-b2');
        eqSoma = document.getElementById('eq-soma');
        indicadorLado = document.getElementById('indicador-lado');

        // Lê as cores do CSS (fonte única da verdade)
        sincronizarCoresCSS();

        // Listeners dos sliders
        sliderA.addEventListener('input', () => {
            valorA = parseInt(sliderA.value, 10);
            valorA_el.textContent = valorA;
            atualizar();
        });

        sliderB.addEventListener('input', () => {
            valorB = parseInt(sliderB.value, 10);
            valorB_el.textContent = valorB;
            atualizar();
        });

        // Redesenha em mudanças de tamanho (responsividade do canvas)
        window.addEventListener('resize', desenhar);

        // Renderização inicial
        ajustarTamanhoCanvas();
        atualizar();
    }

    /**
     * Lê as variáveis CSS para manter a paleta consistente.
     */
    function sincronizarCoresCSS() {
        const estilo = getComputedStyle(document.documentElement);
        cores.a     = estilo.getPropertyValue('--cor-a-quadrado').trim()  || cores.a;
        cores.b     = estilo.getPropertyValue('--cor-b-quadrado').trim()  || cores.b;
        cores.ab    = estilo.getPropertyValue('--cor-ab-retangulo').trim()|| cores.ab;
        cores.tinta = estilo.getPropertyValue('--cor-tinta').trim()       || cores.tinta;
        cores.papel = estilo.getPropertyValue('--cor-papel').trim()       || cores.papel;
    }

    /**
     * Ajusta a resolução do canvas para a densidade do dispositivo
     * (evita borrão em telas Retina).
     */
    function ajustarTamanhoCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
        ctx.scale(dpr, dpr);
    }

    /**
     * Atualiza valores algébricos e dispara o redesenho.
     */
    function atualizar() {
        // Cálculos algébricos do trinômio quadrado perfeito
        const a2 = valorA * valorA;           // a²
        const b2 = valorB * valorB;           // b²
        const dois_ab = 2 * valorA * valorB;  // 2·a·b
        const total = (valorA + valorB) * (valorA + valorB); // (a+b)²

        // Atualiza painel de equações
        eqTotal.textContent = total;
        eqA2.textContent = a2;
        eq2ab.textContent = dois_ab;
        eqB2.textContent = b2;
        eqSoma.textContent = `${a2} + ${dois_ab} + ${b2} = ${total}`;

        // Indicador de lado total
        if (indicadorLado) {
            indicadorLado.textContent = `Lado = (a + b) = ${valorA + valorB}`;
        }

        desenhar();
    }

    /**
     * Desenha as quatro regiões geométricas no canvas.
     * Layout:
     *   ┌─────────┬─────┐
     *   │   a²    │ a·b │
     *   ├─────────┼─────┤
     *   │   a·b   │ b²  │
     *   └─────────┴─────┘
     */
    function desenhar() {
        ajustarTamanhoCanvas();

        const rect = canvas.getBoundingClientRect();
        const largura = rect.width;
        const altura = rect.height;

        // Margem para rótulos
        const margem = 28;
        const tamanhoUtil = Math.min(largura, altura) - margem * 2;

        // Escala: cada unidade de a/b vale X pixels
        const totalUnidades = valorA + valorB;
        const unidadePx = tamanhoUtil / totalUnidades;

        const aPx = valorA * unidadePx;
        const bPx = valorB * unidadePx;

        // Origem (canto superior esquerdo do quadrado grande)
        const x0 = margem;
        const y0 = margem;

        // Limpa
        ctx.clearRect(0, 0, largura, altura);

        // === REGIÃO 1: a² (superior-esquerdo, vermelho) ===
        desenharRegiao(x0, y0, aPx, aPx, cores.a, 'a²', `${valorA}×${valorA}`);

        // === REGIÃO 2: a·b (superior-direito, amarelo) ===
        desenharRegiao(x0 + aPx, y0, bPx, aPx, cores.ab, 'a·b', `${valorA}×${valorB}`);

        // === REGIÃO 3: a·b (inferior-esquerdo, amarelo) ===
        desenharRegiao(x0, y0 + aPx, aPx, bPx, cores.ab, 'a·b', `${valorA}×${valorB}`);

        // === REGIÃO 4: b² (inferior-direito, azul) ===
        desenharRegiao(x0 + aPx, y0 + aPx, bPx, bPx, cores.b, 'b²', `${valorB}×${valorB}`);

        // === MOLDURA EXTERNA ===
        ctx.strokeStyle = cores.tinta;
        ctx.lineWidth = 3;
        ctx.strokeRect(x0, y0, aPx + bPx, aPx + bPx);

        // === COLCHETES DE DIMENSÃO (lado superior) ===
        desenharColcheteHorizontal(x0, x0 + aPx, y0 - 10, `a = ${valorA}`, cores.a);
        desenharColcheteHorizontal(x0 + aPx, x0 + aPx + bPx, y0 - 10, `b = ${valorB}`, cores.b);

        // === COLCHETES DE DIMENSÃO (lado esquerdo) ===
        desenharColcheteVertical(y0, y0 + aPx, x0 - 10, `a`, cores.a);
        desenharColcheteVertical(y0 + aPx, y0 + aPx + bPx, x0 - 10, `b`, cores.b);
    }

    /**
     * Desenha uma região retangular colorida com rótulo central.
     */
    function desenharRegiao(x, y, largura, altura, corPreenchimento, rotuloPrincipal, rotuloSecundario) {
        // Preenchimento
        ctx.fillStyle = corPreenchimento;
        ctx.fillRect(x, y, largura, altura);

        // Borda
        ctx.strokeStyle = cores.tinta;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, largura, altura);

        // Só desenha rótulo se a região for grande o suficiente
        const tamanhoMinimo = 40;
        if (largura < tamanhoMinimo || altura < tamanhoMinimo) return;

        // Texto principal (a², b², a·b)
        const tamanhoFontePrincipal = Math.min(largura, altura) * 0.28;
        const tamanhoFonteSecundaria = Math.min(largura, altura) * 0.14;

        ctx.fillStyle = '#FFFFFF';
        ctx.font = `700 ${tamanhoFontePrincipal}px Fraunces, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rotuloPrincipal, x + largura / 2, y + altura / 2 - tamanhoFonteSecundaria * 0.6);

        // Texto secundário (dimensões reais)
        ctx.font = `500 ${tamanhoFonteSecundaria}px "JetBrains Mono", monospace`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillText(rotuloSecundario, x + largura / 2, y + altura / 2 + tamanhoFontePrincipal * 0.55);
    }

    /**
     * Desenha um colchete horizontal indicando dimensão acima do quadrado.
     */
    function desenharColcheteHorizontal(xInicio, xFim, y, rotulo, cor) {
        ctx.strokeStyle = cor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xInicio, y);
        ctx.lineTo(xInicio, y - 5);
        ctx.lineTo(xFim, y - 5);
        ctx.lineTo(xFim, y);
        ctx.stroke();

        // Rótulo
        ctx.fillStyle = cor;
        ctx.font = `600 11px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(rotulo, (xInicio + xFim) / 2, y - 8);
    }

    /**
     * Desenha um colchete vertical indicando dimensão à esquerda do quadrado.
     */
    function desenharColcheteVertical(yInicio, yFim, x, rotulo, cor) {
        ctx.strokeStyle = cor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, yInicio);
        ctx.lineTo(x - 5, yInicio);
        ctx.lineTo(x - 5, yFim);
        ctx.lineTo(x, yFim);
        ctx.stroke();

        ctx.fillStyle = cor;
        ctx.font = `600 11px "JetBrains Mono", monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(rotulo, x - 8, (yInicio + yFim) / 2);
    }

    return { inicializar };
})();


/* ====================================================================
   4. JOGO NÍVEL 2 — "COMPLETE A EXPRESSÃO"
   --------------------------------------------------------------------
   O jogador recebe um trinômio quadrado perfeito incompleto:
     ex.: x² + 6x + ___    → resposta: 9   (pois (x+3)² = x² + 6x + 9)
     ex.: x² + ___ + 25    → resposta: 10x (representado como 10)
     ex.: ___ + 8x + 16    → resposta: x² (sempre representamos como 1)
   Tem cronômetro, pontuação, sequência (combo) e celebração visual.
   ==================================================================== */
const JogoNivel2 = (() => {
    'use strict';

    // === ESTADO DO JOGO ===
    const estado = {
        pontos: 0,
        sequencia: 0,
        acertos: 0,
        total: 0,
        tempoRestante: 30,
        tempoTotalInicial: 30,
        intervalo: null,
        questaoAtual: null,
        emAndamento: false
    };

    // === REFERÊNCIAS DOM ===
    let elementos = {};

    /**
     * Pré-define alguns trinômios (a + b)² = a² + 2ab + b² em forma de expressão.
     * Cada item tem três "lacunas" possíveis. Sorteamos qual termo ocultar.
     * 
     * Estrutura: { a: valor de "a" no quadrado original, b: valor "b" }
     * A expressão fica: x² + (2a)x + a², onde "x" representa a primeira variável
     * e o número "a" é o que se soma a x para formar (x + a)².
     */
    const trinomiosBase = [
        { a: 1 },   // (x+1)² = x² + 2x + 1
        { a: 2 },   // (x+2)² = x² + 4x + 4
        { a: 3 },   // (x+3)² = x² + 6x + 9
        { a: 4 },   // (x+4)² = x² + 8x + 16
        { a: 5 },   // (x+5)² = x² + 10x + 25
        { a: 6 },   // (x+6)² = x² + 12x + 36
        { a: 7 },   // (x+7)² = x² + 14x + 49
        { a: 8 },   // (x+8)² = x² + 16x + 64
        { a: 9 },   // (x+9)² = x² + 18x + 81
        { a: 10 }   // (x+10)² = x² + 20x + 100
    ];

    /**
     * Inicializa o jogo.
     */
    function inicializar() {
        elementos = {
            pontos:        document.getElementById('hud-pontos'),
            tempo:         document.getElementById('hud-tempo'),
            sequencia:     document.getElementById('hud-sequencia'),
            acertos:       document.getElementById('hud-acertos'),
            barra:         document.getElementById('hud-barra'),
            expressao:     document.getElementById('expressao-questao'),
            entrada:       document.getElementById('entrada-resposta'),
            botaoVerificar:document.getElementById('botao-verificar'),
            botaoDica:     document.getElementById('botao-dica'),
            feedback:      document.getElementById('feedback-questao'),
            telaInicial:   document.getElementById('tela-inicial'),
            botaoIniciar:  document.getElementById('botao-iniciar'),
            celebracao:    document.getElementById('celebracao'),
            painelQuestao: document.getElementById('painel-questao')
        };

        // Listeners
        elementos.botaoIniciar.addEventListener('click', iniciarPartida);
        elementos.botaoVerificar.addEventListener('click', verificarResposta);
        elementos.botaoDica.addEventListener('click', mostrarDica);

        // Tecla Enter envia
        elementos.entrada.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                verificarResposta();
            }
        });

        atualizarHUD();
    }

    /**
     * Inicia (ou reinicia) uma nova partida.
     */
    function iniciarPartida() {
        estado.pontos = 0;
        estado.sequencia = 0;
        estado.acertos = 0;
        estado.total = 0;
        estado.tempoRestante = estado.tempoTotalInicial;
        estado.emAndamento = true;

        elementos.telaInicial.classList.add('tela-inicial--oculta');
        elementos.feedback.textContent = '';
        elementos.feedback.className = 'questao__feedback';

        atualizarHUD();
        sortearQuestao();

        // Cronômetro
        if (estado.intervalo) clearInterval(estado.intervalo);
        estado.intervalo = setInterval(tick, 1000);

        elementos.entrada.focus();
        Feedback.clique();
    }

    /**
     * Atualiza o cronômetro a cada segundo.
     */
    function tick() {
        estado.tempoRestante--;
        atualizarHUD();

        if (estado.tempoRestante <= 0) {
            finalizarPartida();
        }
    }

    /**
     * Sorteia uma nova questão aleatória.
     * Escolhe um trinômio base e qual termo ocultar (a², 2ab ou b²).
     */
    function sortearQuestao() {
        const base = trinomiosBase[Math.floor(Math.random() * trinomiosBase.length)];
        const a = base.a;

        // Termos do trinômio (x + a)² = x² + 2ax + a²
        const termo1 = { tipo: 'x2',  valor: 1,     texto: 'x²' };           // x² (coef 1)
        const termo2 = { tipo: 'mid', valor: 2 * a, texto: `${2 * a}x` };     // 2ax
        const termo3 = { tipo: 'a2',  valor: a * a, texto: `${a * a}` };      // a²

        // Sorteia qual será a lacuna
        const indiceLacuna = Math.floor(Math.random() * 3);

        // Resposta esperada e exibição
        let resposta, expressaoHTML, dicaTexto;
        const termos = [termo1, termo2, termo3];

        if (indiceLacuna === 0) {
            // Falta o x²: resposta é o coeficiente do x² → 1 (representando "x²")
            resposta = 1;
            expressaoHTML = `<span class="lacuna">__</span> + ${termo2.texto} + ${termo3.texto}`;
            dicaTexto = `Dica: o primeiro termo é sempre x² (coeficiente 1). Digite 1.`;
        } else if (indiceLacuna === 1) {
            // Falta o termo do meio (2ax): resposta é 2a (o coeficiente)
            resposta = 2 * a;
            expressaoHTML = `${termo1.texto} + <span class="lacuna">__</span>x + ${termo3.texto}`;
            dicaTexto = `Dica: o termo do meio é 2 × √(${a * a}) × x. Como √${a * a} = ${a}, então 2 × ${a} = ${2 * a}.`;
        } else {
            // Falta o último termo (a²): resposta é a²
            resposta = a * a;
            expressaoHTML = `${termo1.texto} + ${termo2.texto} + <span class="lacuna">__</span>`;
            dicaTexto = `Dica: o último termo é o quadrado da metade do coeficiente de x. Metade de ${2 * a} é ${a}, e ${a}² = ${a * a}.`;
        }

        estado.questaoAtual = {
            resposta,
            dica: dicaTexto,
            a
        };

        elementos.expressao.innerHTML = expressaoHTML;
        elementos.entrada.value = '';
        elementos.feedback.textContent = '';
        elementos.feedback.className = 'questao__feedback';
        elementos.entrada.focus();
    }

    /**
     * Mostra a dica da questão atual.
     */
    function mostrarDica() {
        if (!estado.questaoAtual || !estado.emAndamento) return;
        elementos.feedback.textContent = estado.questaoAtual.dica;
        elementos.feedback.className = 'questao__feedback';
        Feedback.clique();
    }

    /**
     * Verifica se a resposta do usuário está correta.
     */
    function verificarResposta() {
        if (!estado.emAndamento || !estado.questaoAtual) return;

        const valor = elementos.entrada.value.trim();
        if (valor === '') {
            elementos.entrada.focus();
            return;
        }

        const numero = parseInt(valor, 10);
        if (isNaN(numero)) {
            elementos.feedback.textContent = 'Digite um número válido.';
            elementos.feedback.className = 'questao__feedback erro';
            return;
        }

        estado.total++;

        if (numero === estado.questaoAtual.resposta) {
            // ACERTOU ✅
            estado.acertos++;
            estado.sequencia++;
            // Pontuação base + bônus de sequência
            const bonus = estado.sequencia >= 3 ? 5 : 0;
            const ganho = 10 + bonus;
            estado.pontos += ganho;

            mostrarCelebracao(ganho);
            Feedback.acerto();

            elementos.feedback.textContent = `Correto! ${bonus > 0 ? `Bônus de sequência: +${bonus}` : ''}`;
            elementos.feedback.className = 'questao__feedback acerto';

            atualizarHUD();
            // Próxima questão após breve celebração
            setTimeout(sortearQuestao, 1000);
        } else {
            // ERROU ❌
            estado.sequencia = 0;
            Feedback.erro();

            elementos.feedback.textContent = `Não foi dessa vez. A resposta era ${estado.questaoAtual.resposta}.`;
            elementos.feedback.className = 'questao__feedback erro';

            elementos.painelQuestao.classList.add('tremer');
            setTimeout(() => elementos.painelQuestao.classList.remove('tremer'), 320);

            atualizarHUD();
            // Próxima questão após pausa para reflexão
            setTimeout(sortearQuestao, 1800);
        }
    }

    /**
     * Mostra a animação de celebração no centro da área de jogo.
     */
    function mostrarCelebracao(pontos) {
        const cel = elementos.celebracao;
        cel.querySelector('.celebracao__pontos').textContent = `+${pontos} pts`;
        cel.classList.add('celebracao--visivel');
        cel.setAttribute('aria-hidden', 'false');

        setTimeout(() => {
            cel.classList.remove('celebracao--visivel');
            cel.setAttribute('aria-hidden', 'true');
        }, 900);
    }

    /**
     * Encerra a partida quando o tempo acaba.
     */
    function finalizarPartida() {
        clearInterval(estado.intervalo);
        estado.intervalo = null;
        estado.emAndamento = false;

        // Recria a tela inicial com o resultado
        const conteudo = elementos.telaInicial.querySelector('.tela-inicial__conteudo');
        const aproveitamento = estado.total > 0
            ? Math.round((estado.acertos / estado.total) * 100)
            : 0;

        conteudo.innerHTML = `
            <h3 class="tela-inicial__titulo">Tempo esgotado!</h3>
            <p class="tela-inicial__texto">
                Você acertou <strong>${estado.acertos} de ${estado.total}</strong> questões
                (${aproveitamento}% de aproveitamento) e fez
                <strong>${estado.pontos} pontos</strong>.
            </p>
            <button class="botao botao--principal" id="botao-iniciar">
                ↻ Jogar novamente
            </button>
        `;

        elementos.botaoIniciar = document.getElementById('botao-iniciar');
        elementos.botaoIniciar.addEventListener('click', iniciarPartida);

        elementos.telaInicial.classList.remove('tela-inicial--oculta');
    }

    /**
     * Atualiza todos os elementos do HUD.
     */
    function atualizarHUD() {
        elementos.pontos.textContent = estado.pontos;
        elementos.tempo.textContent = estado.tempoRestante;
        elementos.sequencia.textContent = estado.sequencia;
        elementos.acertos.textContent = `${estado.acertos}/${estado.total}`;

        // Barra do cronômetro
        const proporcao = Math.max(0, estado.tempoRestante / estado.tempoTotalInicial);
        elementos.barra.style.width = `${proporcao * 100}%`;

        // Cor da barra muda quando o tempo está acabando
        if (estado.tempoRestante <= 10) {
            elementos.barra.classList.add('alerta');
        } else {
            elementos.barra.classList.remove('alerta');
        }
    }

    return { inicializar };
})();


/* ====================================================================
   5. CONTROLES DE ACESSIBILIDADE (Módulo 3 - toggles)
   ==================================================================== */
const ControlesAcessibilidade = (() => {
    'use strict';

    function inicializar() {
        // Toggle de vibração
        const toggleVibracao = document.getElementById('toggle-vibracao');
        toggleVibracao.addEventListener('change', (e) => {
            Feedback.atualizarPreferencia('vibracaoAtiva', e.target.checked);
        });

        // Toggle de som
        const toggleSom = document.getElementById('toggle-som');
        toggleSom.addEventListener('change', (e) => {
            Feedback.atualizarPreferencia('somAtivo', e.target.checked);
        });

        // Toggle de movimento reduzido
        const toggleMovimento = document.getElementById('toggle-movimento');
        toggleMovimento.addEventListener('change', (e) => {
            Feedback.atualizarPreferencia('movimentoReduzido', e.target.checked);
        });

        // Toggle de Libras
        const toggleLibras = document.getElementById('toggle-libras');
        const botaoLibrasFlutuante = document.getElementById('libras-flutuante');
        toggleLibras.addEventListener('change', (e) => {
            botaoLibrasFlutuante.hidden = !e.target.checked;
            Feedback.atualizarPreferencia('librasVisivel', e.target.checked);
        });

        // Botões de teste
        document.getElementById('testar-vibracao-ok').addEventListener('click', () => {
            Feedback.acerto();
        });
        document.getElementById('testar-vibracao-erro').addEventListener('click', () => {
            Feedback.erro();
        });
    }

    return { inicializar };
})();


/* ====================================================================
   6. LIBRAS (Botão flutuante + Modal placeholder)
   ==================================================================== */
const Libras = (() => {
    'use strict';

    function inicializar() {
        const botaoAbrir = document.getElementById('libras-flutuante');
        const modal = document.getElementById('libras-modal');
        const botaoFechar = document.getElementById('libras-modal-fechar');

        botaoAbrir.addEventListener('click', () => {
            modal.hidden = false;
            Feedback.clique();
        });

        botaoFechar.addEventListener('click', () => {
            modal.hidden = true;
        });

        // Fecha ao clicar fora do conteúdo
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.hidden = true;
            }
        });

        // Tecla ESC fecha
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) {
                modal.hidden = true;
            }
        });
    }

    return { inicializar };
})();


/* ====================================================================
   7. BOOTSTRAP — Inicializa tudo quando o DOM estiver pronto
   ==================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    Navegacao.inicializar();
    Simulador.inicializar();
    JogoNivel2.inicializar();
    ControlesAcessibilidade.inicializar();
    Libras.inicializar();

    // Mensagem de boas-vindas no console (útil para professores devs)
    console.log(
        '%c📐 Trinômio Quadrado Perfeito',
        'font-size: 16px; font-weight: bold; color: #D62828;'
    );
    console.log('Aplicação carregada com sucesso. Acessibilidade ativa.');
});
