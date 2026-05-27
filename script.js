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
   4. ALTERNADOR DE NÍVEIS (cards Nível 1 / 2 / 3)
   ==================================================================== */
const AlternadorNiveis = (() => {
    'use strict';

    function inicializar() {
        const cards = document.querySelectorAll('.nivel[data-nivel]');
        const painel1 = document.getElementById('jogo-nivel1');
        const painel2 = document.getElementById('jogo-nivel2');
        const painel3 = document.getElementById('jogo-nivel3');

        cards.forEach(card => {
            if (card.disabled) return;
            card.addEventListener('click', () => {
                const nivel = card.dataset.nivel;

                // Atualiza visual dos cards
                cards.forEach(c => {
                    c.classList.remove('nivel--ativo');
                    c.setAttribute('aria-pressed', 'false');
                });
                card.classList.add('nivel--ativo');
                card.setAttribute('aria-pressed', 'true');

                // Mostra o painel correspondente e pausa os outros
                painel1.classList.toggle('jogo--oculto', nivel !== '1');
                painel2.classList.toggle('jogo--oculto', nivel !== '2');
                painel3.classList.toggle('jogo--oculto', nivel !== '3');

                if (nivel === '1') {
                    Quebracabeca.aoEntrar();
                    TetrisAlgebrico.aoSair();
                } else if (nivel === '2') {
                    TetrisAlgebrico.aoSair();
                } else if (nivel === '3') {
                    TetrisAlgebrico.aoEntrar();
                }

                Feedback.clique();
            });
        });
    }

    return { inicializar };
})();


/* ====================================================================
   5. QUEBRA-CABEÇA (Módulo 2 - Nível 1)
   --------------------------------------------------------------------
   O jogador arrasta 4 peças (a², b², ab, ab) para os 4 slots do
   tabuleiro. Usamos Pointer Events para funcionar uniformemente em
   mouse, toque e caneta. A cada rodada, sorteamos novos valores
   de a e b para variar as proporções visuais das peças.
   ==================================================================== */
const Quebracabeca = (() => {
    'use strict';

    const estado = {
        a: 3,
        b: 2,
        rodada: 1,
        acertos: 0,
        tentativas: 0,
        pecasEncaixadas: 0,
        // Controle do arrasto atual
        arrastando: null,    // elemento da peça
        deslocX: 0,
        deslocY: 0,
        slotAtual: null,     // slot sob o ponteiro no momento
        jaInicializado: false
    };

    let el = {};

    /**
     * Inicializa referências e listeners (executado uma vez).
     */
    function inicializar() {
        el = {
            painel:      document.getElementById('jogo-nivel1'),
            tabuleiro:   document.getElementById('qc-tabuleiro'),
            pecasContainer: document.getElementById('qc-pecas'),
            feedback:    document.getElementById('qc-feedback'),
            rodada:      document.getElementById('qc-rodada'),
            acertos:     document.getElementById('qc-acertos'),
            tentativas:  document.getElementById('qc-tentativas'),
            valores:     document.getElementById('qc-valores'),
            botaoReiniciar: document.getElementById('qc-reiniciar'),
            botaoProxima:   document.getElementById('qc-proxima'),
            celebracao:  document.getElementById('qc-celebracao')
        };

        el.botaoReiniciar.addEventListener('click', () => {
            estado.tentativas = 0;
            estado.pecasEncaixadas = 0;
            iniciarRodada();
            Feedback.clique();
        });

        el.botaoProxima.addEventListener('click', () => {
            estado.rodada++;
            estado.pecasEncaixadas = 0;
            sortearNovosValores();
            iniciarRodada();
            Feedback.clique();
        });
    }

    /**
     * Chamado quando o jogador entra no Nível 1 pela primeira vez.
     */
    function aoEntrar() {
        if (!estado.jaInicializado) {
            iniciarRodada();
            estado.jaInicializado = true;
        }
    }

    /**
     * Sorteia novos valores de a e b (entre 2 e 6 para manter as peças
     * grandes o bastante para serem confortáveis de arrastar no mobile).
     */
    function sortearNovosValores() {
        // Garantimos a !== b para que o desafio seja visualmente óbvio
        do {
            estado.a = 2 + Math.floor(Math.random() * 5); // 2..6
            estado.b = 2 + Math.floor(Math.random() * 5);
        } while (estado.a === estado.b);
    }

    /**
     * Monta a rodada: ajusta proporções do tabuleiro, limpa slots,
     * gera as 4 peças embaralhadas na bandeja.
     */
    function iniciarRodada() {
        // 1. Aplica as proporções a/b no grid do tabuleiro via CSS vars
        el.tabuleiro.style.setProperty('--prop-a', `${estado.a}fr`);
        el.tabuleiro.style.setProperty('--prop-b', `${estado.b}fr`);

        // 2. Limpa slots (remove peças encaixadas anteriores)
        const slots = el.tabuleiro.querySelectorAll('.tabuleiro__slot');
        slots.forEach(slot => {
            slot.classList.remove('tabuleiro__slot--preenchido', 'tabuleiro__slot--alvo', 'tabuleiro__slot--invalido');
            const encaixada = slot.querySelector('.peca-encaixada');
            if (encaixada) encaixada.remove();
            // Restaura o rótulo "?"
            const rotulo = slot.querySelector('.tabuleiro__rotulo');
            if (rotulo) rotulo.style.display = '';
        });

        // 3. Gera as 4 peças, embaralhadas
        gerarPecas();

        // 4. Atualiza HUD e feedback
        el.feedback.textContent = '';
        el.feedback.className = 'quebracabeca__feedback';
        el.botaoProxima.disabled = true;
        atualizarHUD();
    }

    /**
     * Cria as peças (a², b², dois "ab") em ordem aleatória na bandeja.
     */
    function gerarPecas() {
        const a = estado.a;
        const b = estado.b;

        // Definição das 4 peças que compõem o quadrado
        const pecas = [
            { tipo: 'a2', principal: 'a²',  secundario: `${a}×${a} = ${a*a}` },
            { tipo: 'b2', principal: 'b²',  secundario: `${b}×${b} = ${b*b}` },
            { tipo: 'ab', principal: 'a·b', secundario: `${a}×${b} = ${a*b}` },
            { tipo: 'ab', principal: 'a·b', secundario: `${a}×${b} = ${a*b}` }
        ];

        // Embaralha (Fisher-Yates)
        for (let i = pecas.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pecas[i], pecas[j]] = [pecas[j], pecas[i]];
        }

        // Renderiza
        el.pecasContainer.innerHTML = '';
        pecas.forEach((dados, indice) => {
            const peca = document.createElement('div');
            peca.className = `peca peca--${dados.tipo}`;
            peca.dataset.tipo = dados.tipo;
            peca.dataset.id = `peca-${indice}`;
            peca.setAttribute('role', 'button');
            peca.setAttribute('tabindex', '0');
            peca.setAttribute('aria-label', `Peça ${dados.principal}, igual a ${dados.secundario}`);
            peca.innerHTML = `
                <span class="peca__principal">${dados.principal}</span>
                <span class="peca__secundario">${dados.secundario}</span>
            `;

            // Pointer Events (funciona em mouse + toque + caneta)
            peca.addEventListener('pointerdown', iniciarArrasto);

            el.pecasContainer.appendChild(peca);
        });
    }

    /**
     * Inicia o arrasto de uma peça.
     */
    function iniciarArrasto(evento) {
        evento.preventDefault();
        const peca = evento.currentTarget;
        if (peca.classList.contains('peca--utilizada')) return;

        estado.arrastando = peca;

        // Captura a posição relativa do clique dentro da peça
        const rect = peca.getBoundingClientRect();
        estado.deslocX = evento.clientX - rect.left;
        estado.deslocY = evento.clientY - rect.top;

        // Guarda dimensões originais antes de tirar do fluxo
        peca.style.width  = rect.width + 'px';
        peca.style.height = rect.height + 'px';

        peca.classList.add('peca--arrastando');
        moverPeca(evento.clientX, evento.clientY);

        // Pointer capture: a peça continua recebendo eventos mesmo se o
        // ponteiro sair dela. Isso evita travamentos no mobile.
        peca.setPointerCapture(evento.pointerId);

        peca.addEventListener('pointermove', durante);
        peca.addEventListener('pointerup',   finalizar);
        peca.addEventListener('pointercancel', cancelar);

        Feedback.clique();
    }

    /**
     * Atualiza posição da peça e destaca o slot sob o ponteiro.
     */
    function durante(evento) {
        if (!estado.arrastando) return;
        moverPeca(evento.clientX, evento.clientY);

        // Detecta qual slot está sob o ponteiro
        const slotSob = detectarSlotSob(evento.clientX, evento.clientY);

        // Atualiza destaque visual dos slots
        if (slotSob !== estado.slotAtual) {
            limparDestaqueSlots();
            if (slotSob && !slotSob.classList.contains('tabuleiro__slot--preenchido')) {
                // Mostra se o slot é válido para a peça que está sendo arrastada
                const tipoCompativel = slotSob.dataset.tipo === estado.arrastando.dataset.tipo;
                slotSob.classList.add(tipoCompativel ? 'tabuleiro__slot--alvo' : 'tabuleiro__slot--invalido');
            }
            estado.slotAtual = slotSob;
        }
    }

    /**
     * Reposiciona a peça flutuante no ponteiro.
     */
    function moverPeca(x, y) {
        const peca = estado.arrastando;
        peca.style.left = (x - estado.deslocX) + 'px';
        peca.style.top  = (y - estado.deslocY) + 'px';
    }

    /**
     * Finaliza o arrasto: tenta encaixar ou devolve à bandeja.
     */
    function finalizar(evento) {
        if (!estado.arrastando) return;
        const peca = estado.arrastando;

        const slotDestino = detectarSlotSob(evento.clientX, evento.clientY);
        limparDestaqueSlots();

        if (slotDestino &&
            !slotDestino.classList.contains('tabuleiro__slot--preenchido') &&
            slotDestino.dataset.tipo === peca.dataset.tipo) {
            // ENCAIXE CORRETO ✓
            encaixarPeca(peca, slotDestino);
        } else {
            // Devolve para a bandeja (peça volta ao layout original)
            estado.tentativas++;
            if (slotDestino) {
                // Tentou encaixar em lugar errado
                Feedback.erro();
                el.feedback.textContent = `Hmm, essa peça não cabe ali. Observe a cor e o tamanho do espaço.`;
                el.feedback.className = 'quebracabeca__feedback erro';
            }
            atualizarHUD();
        }

        // Limpeza do estado de arrasto
        peca.classList.remove('peca--arrastando');
        peca.style.left = '';
        peca.style.top = '';
        peca.style.width = '';
        peca.style.height = '';

        peca.removeEventListener('pointermove', durante);
        peca.removeEventListener('pointerup', finalizar);
        peca.removeEventListener('pointercancel', cancelar);

        estado.arrastando = null;
        estado.slotAtual = null;
    }

    function cancelar() {
        if (estado.arrastando) {
            const peca = estado.arrastando;
            peca.classList.remove('peca--arrastando');
            peca.style.left = '';
            peca.style.top = '';
            peca.style.width = '';
            peca.style.height = '';
            limparDestaqueSlots();
            estado.arrastando = null;
            estado.slotAtual = null;
        }
    }

    /**
     * Detecta o slot do tabuleiro que está sob as coordenadas dadas.
     * Usamos getBoundingClientRect para funcionar mesmo com a peça
     * flutuando por cima (pointer-events:none cobre esse caso).
     */
    function detectarSlotSob(x, y) {
        const slots = el.tabuleiro.querySelectorAll('.tabuleiro__slot');
        for (const slot of slots) {
            const r = slot.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
                return slot;
            }
        }
        return null;
    }

    function limparDestaqueSlots() {
        el.tabuleiro.querySelectorAll('.tabuleiro__slot').forEach(s => {
            s.classList.remove('tabuleiro__slot--alvo', 'tabuleiro__slot--invalido');
        });
    }

    /**
     * Encaixa a peça no slot, marca como utilizada e verifica vitória.
     */
    function encaixarPeca(peca, slot) {
        Feedback.acerto();

        // Cria a peça "fixa" dentro do slot
        const fixa = document.createElement('div');
        fixa.className = `peca-encaixada peca--${peca.dataset.tipo}`;
        // Replica o conteúdo da peça original
        const principal = peca.querySelector('.peca__principal').textContent;
        const secundario = peca.querySelector('.peca__secundario').textContent;
        fixa.innerHTML = `
            <div class="peca-encaixada__principal">${principal}</div>
            <div class="peca-encaixada__secundario">${secundario}</div>
        `;
        // Aplica cor de fundo correta
        const corMap = { 'a2': 'var(--cor-a-quadrado)', 'b2': 'var(--cor-b-quadrado)', 'ab': 'var(--cor-ab-retangulo)' };
        fixa.style.backgroundColor = corMap[peca.dataset.tipo];
        if (peca.dataset.tipo === 'ab') fixa.style.color = 'var(--cor-tinta)';

        slot.appendChild(fixa);
        slot.classList.add('tabuleiro__slot--preenchido');

        // "Apaga" a peça original da bandeja
        peca.classList.add('peca--utilizada');

        estado.pecasEncaixadas++;
        el.feedback.textContent = `Peça encaixada! Faltam ${4 - estado.pecasEncaixadas}.`;
        el.feedback.className = 'quebracabeca__feedback acerto';

        // Vitória?
        if (estado.pecasEncaixadas === 4) {
            estado.acertos++;
            atualizarHUD();
            celebrarVitoria();
        } else {
            atualizarHUD();
        }
    }

    /**
     * Mostra animação de vitória e libera o botão "Próxima rodada".
     */
    function celebrarVitoria() {
        const cel = el.celebracao;
        cel.classList.add('celebracao--visivel');
        cel.setAttribute('aria-hidden', 'false');

        // Feedback positivo extra
        Feedback.acerto();
        setTimeout(() => Feedback.acerto(), 200);

        setTimeout(() => {
            cel.classList.remove('celebracao--visivel');
            cel.setAttribute('aria-hidden', 'true');
        }, 1400);

        el.feedback.textContent = `✓ Você reconstruiu (a+b)² = a² + 2ab + b² com a=${estado.a} e b=${estado.b}. Total: ${(estado.a + estado.b) ** 2}.`;
        el.feedback.className = 'quebracabeca__feedback acerto';

        el.botaoProxima.disabled = false;
    }

    function atualizarHUD() {
        el.rodada.textContent = estado.rodada;
        el.acertos.textContent = estado.acertos;
        el.tentativas.textContent = estado.tentativas;
        el.valores.textContent = `a=${estado.a}, b=${estado.b}`;
    }

    return { inicializar, aoEntrar };
})();


/* ====================================================================
   6. JOGO NÍVEL 2 — "COMPLETE A EXPRESSÃO"
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
   7. TETRIS ALGÉBRICO (Módulo 2 - Nível 3)
   --------------------------------------------------------------------
   Expressões matemáticas caem do topo da arena. O jogador deve
   tocar/clicar nas que NÃO são trinômios quadrados perfeitos (TQP)
   para destruí-las. As que são TQP devem chegar ao chão em paz.
   
   Regras de pontuação:
     • Destruir um inválido  → +10 pontos
     • Deixar um válido passar → +5 pontos
     • Destruir um válido (erro) → -1 vida
     • Deixar um inválido passar → -1 vida
   
   A velocidade e a frequência de spawn aumentam com o nível.
   Game over após perder as 3 vidas.
   ==================================================================== */
const TetrisAlgebrico = (() => {
    'use strict';

    // === ESTADO DO JOGO ===
    const estado = {
        rodando: false,
        pontos: 0,
        vidas: 3,
        nivel: 1,
        destruidos: 0,
        blocos: [],          // lista de blocos ativos na arena
        proximoId: 0,
        ultimoSpawn: 0,
        ultimoFrame: 0,
        intervaloSpawn: 1800,// ms entre spawns (diminui com o nível)
        velocidadeBase: 60,  // pixels por segundo (aumenta com o nível)
        rafId: null,
        alturaArena: 500,
        larguraArena: 600,
        pontosParaSubirNivel: 50
    };

    let el = {};

    /**
     * Inicializa elementos e listeners (uma vez).
     */
    function inicializar() {
        el = {
            painel:        document.getElementById('jogo-nivel3'),
            arena:         document.getElementById('tx-arena'),
            pontos:        document.getElementById('tx-pontos'),
            nivel:         document.getElementById('tx-nivel'),
            vidas:         document.getElementById('tx-vidas'),
            destruidos:    document.getElementById('tx-destruidos'),
            telaInicial:   document.getElementById('tx-tela-inicial'),
            botaoIniciar:  document.getElementById('tx-iniciar')
        };

        el.botaoIniciar.addEventListener('click', iniciarPartida);
    }

    /**
     * Chamado quando o jogador abre o painel deste nível.
     */
    function aoEntrar() {
        // Garante que a arena tenha dimensões válidas para cálculos
        atualizarDimensoes();
        window.addEventListener('resize', atualizarDimensoes);
    }

    /**
     * Chamado quando o jogador sai do painel. Pausa o jogo.
     */
    function aoSair() {
        if (estado.rodando) {
            pararLoop();
            // Mantém o estado, mas o usuário precisa re-iniciar ao voltar
        }
        window.removeEventListener('resize', atualizarDimensoes);
    }

    function atualizarDimensoes() {
        const r = el.arena.getBoundingClientRect();
        estado.larguraArena = r.width;
        estado.alturaArena = r.height;
    }

    /**
     * Inicia uma nova partida (zera tudo).
     */
    function iniciarPartida() {
        estado.pontos = 0;
        estado.vidas = 3;
        estado.nivel = 1;
        estado.destruidos = 0;
        estado.blocos = [];
        estado.intervaloSpawn = 1800;
        estado.velocidadeBase = 60;
        estado.ultimoSpawn = performance.now();
        estado.ultimoFrame = performance.now();
        estado.rodando = true;

        // Limpa arena (mas preserva tela inicial e celebração)
        el.arena.querySelectorAll('.bloco-tetris').forEach(b => b.remove());
        el.arena.querySelectorAll('.tetris__floater').forEach(f => f.remove());

        el.telaInicial.classList.add('tela-inicial--oculta');
        atualizarHUD();
        atualizarDimensoes();

        Feedback.clique();
        loopPrincipal();
    }

    /**
     * Loop principal do jogo (requestAnimationFrame).
     */
    function loopPrincipal() {
        if (!estado.rodando) return;

        const agora = performance.now();
        const dt = (agora - estado.ultimoFrame) / 1000; // segundos
        estado.ultimoFrame = agora;

        // 1. Spawn de novos blocos
        if (agora - estado.ultimoSpawn >= estado.intervaloSpawn) {
            spawnarBloco();
            estado.ultimoSpawn = agora;
        }

        // 2. Atualiza posição de cada bloco
        const velocidade = estado.velocidadeBase + (estado.nivel - 1) * 15;
        const limiteInferior = estado.alturaArena - 50; // antes da linha do chão

        for (let i = estado.blocos.length - 1; i >= 0; i--) {
            const bloco = estado.blocos[i];
            bloco.y += velocidade * dt;
            bloco.elemento.style.transform = `translateY(${bloco.y}px)`;

            // Atingiu o chão?
            if (bloco.y >= limiteInferior) {
                processarChegadaChao(bloco, i);
            }
        }

        estado.rafId = requestAnimationFrame(loopPrincipal);
    }

    function pararLoop() {
        estado.rodando = false;
        if (estado.rafId) {
            cancelAnimationFrame(estado.rafId);
            estado.rafId = null;
        }
    }

    /**
     * Cria um novo bloco no topo da arena com expressão aleatória.
     */
    function spawnarBloco() {
        const dadosExpressao = gerarExpressao();
        const idBloco = estado.proximoId++;
        const corClasse = `bloco-tetris--cor-${(idBloco % 5) + 1}`;

        const elemento = document.createElement('div');
        elemento.className = `bloco-tetris ${corClasse}`;
        elemento.textContent = dadosExpressao.texto;

        // Posição horizontal aleatória (com margem para não colar nas bordas)
        const larguraEstimada = 180;
        const xMax = Math.max(20, estado.larguraArena - larguraEstimada - 20);
        const x = 20 + Math.random() * xMax;
        elemento.style.left = `${x}px`;
        elemento.style.top = '-60px'; // começa fora da tela

        const bloco = {
            id: idBloco,
            elemento,
            y: 0,
            ehValido: dadosExpressao.ehValido,
            expressao: dadosExpressao.texto,
            xPos: x
        };

        // Click/touch destrói o bloco
        elemento.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            destruirBloco(bloco);
        });

        el.arena.appendChild(elemento);
        estado.blocos.push(bloco);
    }

    /**
     * Gera uma expressão (50% válida, 50% inválida) com cuidado
     * de fazer os "falsos TQP" parecerem plausíveis para gerar desafio.
     */
    function gerarExpressao() {
        const ehValido = Math.random() < 0.5;
        // Coeficiente "a" no quadrado (x + a)². Mantemos pequeno para
        // que mentes infantojuvenis consigam validar mentalmente.
        const a = 1 + Math.floor(Math.random() * 9); // 1..9

        // Coeficientes do TQP verdadeiro: x² + 2ax + a²
        const coefMeio = 2 * a;
        const termoFinal = a * a;

        if (ehValido) {
            // Forma o TQP genuíno
            // Variação: às vezes mostramos como (x+a)² já desenvolvido
            return {
                texto: `x² + ${coefMeio}x + ${termoFinal}`,
                ehValido: true
            };
        }

        // INVÁLIDO: perturbamos um dos termos de modo plausível
        const tipoErro = Math.floor(Math.random() * 3);

        if (tipoErro === 0) {
            // Erro no termo do meio (coef ±1, ±2 ou um valor totalmente aleatório)
            let coefErrado;
            do {
                const delta = [-2, -1, 1, 2, 3][Math.floor(Math.random() * 5)];
                coefErrado = coefMeio + delta;
            } while (coefErrado === coefMeio || coefErrado <= 0);
            return {
                texto: `x² + ${coefErrado}x + ${termoFinal}`,
                ehValido: false
            };
        }

        if (tipoErro === 1) {
            // Erro no termo final (não é quadrado perfeito, ou é o quadrado errado)
            let finalErrado;
            do {
                const delta = [-3, -2, -1, 1, 2, 3, 5][Math.floor(Math.random() * 7)];
                finalErrado = termoFinal + delta;
            } while (finalErrado === termoFinal || finalErrado <= 0);
            return {
                texto: `x² + ${coefMeio}x + ${finalErrado}`,
                ehValido: false
            };
        }

        // tipoErro === 2: sinal trocado no meio (subtração)
        // Cuidado: x² - 2ax + a² TAMBÉM é TQP! Então usamos coef errado + sinal negativo
        let coefErrado2;
        do {
            const delta = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
            coefErrado2 = coefMeio + delta;
        } while (coefErrado2 === coefMeio || coefErrado2 <= 0);
        return {
            texto: `x² − ${coefErrado2}x + ${termoFinal}`,
            ehValido: false
        };
    }

    /**
     * Jogador clicou/tocou em um bloco — destruir.
     */
    function destruirBloco(bloco) {
        if (bloco.destruido) return;
        bloco.destruido = true;

        // Remove da lista ativa
        const indice = estado.blocos.indexOf(bloco);
        if (indice >= 0) estado.blocos.splice(indice, 1);

        if (bloco.ehValido) {
            // ERRO: destruiu um TQP válido (deveria ter deixado passar)
            perderVida();
            Feedback.erro();

            bloco.elemento.classList.add('bloco-tetris--erro');
            mostrarFloater(bloco, '−1 vida', true);
            setTimeout(() => bloco.elemento.remove(), 500);
        } else {
            // ACERTO: destruiu um impostor
            estado.destruidos++;
            estado.pontos += 10;
            Feedback.acerto();

            bloco.elemento.classList.add('bloco-tetris--explodindo');
            mostrarFloater(bloco, '+10', false);
            setTimeout(() => bloco.elemento.remove(), 400);

            verificarSubidaNivel();
        }

        atualizarHUD();
    }

    /**
     * Bloco chegou ao chão sem ser destruído.
     */
    function processarChegadaChao(bloco, indice) {
        estado.blocos.splice(indice, 1);

        if (bloco.ehValido) {
            // ACERTO PASSIVO: jogador foi sábio em deixar passar
            estado.pontos += 5;
            mostrarFloater(bloco, '+5', false);
            bloco.elemento.remove();
        } else {
            // ERRO: deixou um impostor chegar ao chão
            perderVida();
            Feedback.erro();
            bloco.elemento.classList.add('bloco-tetris--erro');
            mostrarFloater(bloco, '−1 vida', true);
            setTimeout(() => bloco.elemento.remove(), 500);
        }

        atualizarHUD();
    }

    function perderVida() {
        estado.vidas--;
        // Marca o emoji de coração com animação ao atualizar
        el.vidas.classList.add('vida-perdida');
        setTimeout(() => el.vidas.classList.remove('vida-perdida'), 600);

        if (estado.vidas <= 0) {
            finalizarPartida();
        }
    }

    /**
     * Sobe de nível a cada N pontos: aumenta velocidade e frequência.
     */
    function verificarSubidaNivel() {
        const nivelEsperado = 1 + Math.floor(estado.pontos / estado.pontosParaSubirNivel);
        if (nivelEsperado > estado.nivel) {
            estado.nivel = nivelEsperado;
            // Spawn fica mais frequente (mín. 700ms) e velocidade aumenta
            estado.intervaloSpawn = Math.max(700, 1800 - (estado.nivel - 1) * 150);
            // Velocidade já é calculada com base em estado.nivel no loop
        }
    }

    /**
     * Mostra um floater de pontuação subindo a partir do bloco.
     */
    function mostrarFloater(bloco, texto, ehErro) {
        const floater = document.createElement('div');
        floater.className = 'tetris__floater';
        if (ehErro) floater.classList.add('tetris__floater--erro');
        floater.textContent = texto;
        // Posiciona no lugar do bloco
        floater.style.left = `${bloco.xPos + 30}px`;
        floater.style.top = `${bloco.y + 10}px`;
        el.arena.appendChild(floater);
        setTimeout(() => floater.remove(), 800);
    }

    /**
     * Encerra a partida (vidas esgotadas).
     */
    function finalizarPartida() {
        pararLoop();

        // Limpa blocos restantes
        setTimeout(() => {
            el.arena.querySelectorAll('.bloco-tetris').forEach(b => b.remove());
        }, 600);

        // Recria a tela inicial com placar
        const conteudo = el.telaInicial.querySelector('.tela-inicial__conteudo');
        conteudo.innerHTML = `
            <h3 class="tela-inicial__titulo">Fim de jogo!</h3>
            <p class="tela-inicial__texto">
                Você destruiu <strong>${estado.destruidos}</strong> impostores e acumulou
                <strong>${estado.pontos} pontos</strong>, chegando ao
                <strong>nível ${estado.nivel}</strong>.
            </p>
            <button class="botao botao--principal" id="tx-iniciar">
                ↻ Jogar novamente
            </button>
        `;
        el.botaoIniciar = document.getElementById('tx-iniciar');
        el.botaoIniciar.addEventListener('click', iniciarPartida);

        el.telaInicial.classList.remove('tela-inicial--oculta');
    }

    function atualizarHUD() {
        el.pontos.textContent = estado.pontos;
        el.nivel.textContent = estado.nivel;
        el.destruidos.textContent = estado.destruidos;
        // Mostra corações conforme vidas restantes
        el.vidas.textContent = '❤'.repeat(Math.max(0, estado.vidas)) || '✗';
    }

    return { inicializar, aoEntrar, aoSair };
})();


/* ====================================================================
   8. CONTROLES DE ACESSIBILIDADE (Módulo 3 - toggles)
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
    AlternadorNiveis.inicializar();
    Quebracabeca.inicializar();
    JogoNivel2.inicializar();
    TetrisAlgebrico.inicializar();
    ControlesAcessibilidade.inicializar();
    Libras.inicializar();

    // Mensagem de boas-vindas no console (útil para professores devs)
    console.log(
        '%c📐 Trinômio Quadrado Perfeito',
        'font-size: 16px; font-weight: bold; color: #D62828;'
    );
    console.log('Aplicação carregada com sucesso. Acessibilidade ativa.');
});
