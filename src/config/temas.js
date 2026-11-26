'use strict';

/**
 * Catálogo de TEMAS da rede social (admin → "Tema da rede").
 *
 * O tema ativo muda a cara do app INTEIRO (feed, Direct, painel, admin e até o
 * login) e pode liberar uma aba extra de preferências para os participantes
 * (ex.: Mês das Crianças → "presentes que eu mais gosto"), que o anjo consulta.
 *
 * Temas: padrão, Dia das Crianças, Halloween e Natal. Para criar um novo
 * tema: adicione um item aqui, uma folha /css/tema-<chave>.css e (se tiver aba de
 * preferências) os campos em `prefs`. O resto do app lê daqui.
 */
// Ícones (SVG, traço na cor do texto, tamanho 1em: acompanham o tamanho do rótulo onde entram).
// O emoji de cada tema continua sendo a "identidade" dele (cards, decoração); rótulo usa ícone.
const svg = (p) => '<svg class="tema-ic" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
const IC = {
  brilho: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  balao: svg('<path d="M12 2a6 6 0 0 0-6 6c0 4.2 3 7.2 6 8.2 3-1 6-4 6-8.2a6 6 0 0 0-6-6z"/><path d="M11 16.2 10.5 18h3l-.5-1.8"/><path d="M12 18c0 1.6-1.6 2-1.6 4"/>'),
  abobora: svg('<path d="M12 7c-5 0-8.5 3-8.5 7s3.5 7 8.5 7 8.5-3 8.5-7-3.5-7-8.5-7z"/><path d="M12 7c-2.2 2.3-2.2 11.7 0 14"/><path d="M12 7c2.2 2.3 2.2 11.7 0 14"/><path d="M12 7c0-2 .8-3.6 2.8-4.2"/>'),
  presente: svg('<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'),
  urso: svg('<circle cx="12" cy="13.5" r="6.5"/><circle cx="6.3" cy="6.8" r="2.4"/><circle cx="17.7" cy="6.8" r="2.4"/><circle cx="9.7" cy="12.3" r=".7" fill="currentColor"/><circle cx="14.3" cy="12.3" r=".7" fill="currentColor"/><path d="M10.4 15.6c.9.8 2.3.8 3.2 0"/>'),
  pirulito: svg('<circle cx="12" cy="8.5" r="6"/><path d="M12 8.5a2.6 2.6 0 1 1 2.6-2.6"/><line x1="12" y1="14.5" x2="12" y2="22"/>'),
  estrela: svg('<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>'),
  pipa: svg('<path d="M12 2l7 7-7 9-7-9z"/><line x1="12" y1="2" x2="12" y2="18"/><line x1="5" y1="9" x2="19" y2="9"/><path d="M12 18c-1.2 1.4 1.2 2.4 0 4"/>'),
  carta: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/>'),
  bala: svg('<circle cx="12" cy="12" r="4.2"/><path d="M8.6 9.6 4.5 6.5 3 10.4l2.6 1"/><path d="M15.4 14.4l4.1 3.1 1.5-3.9-2.6-1"/>'),
  mascara: svg('<path d="M3 6.5c3 1 6 1 9 0s6-1 9 0c0 6-2 10.5-5 10.5-2 0-2.5-2-4-2s-2 2-4 2c-3 0-5-4.5-5-10.5z"/><circle cx="8.5" cy="10.5" r="1.4"/><circle cx="15.5" cy="10.5" r="1.4"/>'),
  filme: svg('<rect x="2" y="2" width="20" height="20" rx="2.2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>'),
  fantasma: svg('<path d="M5 21V10a7 7 0 0 1 14 0v11l-2.3-1.7L14.3 21 12 19.3 9.7 21l-2.4-1.7z"/><circle cx="9.5" cy="10" r="1" fill="currentColor"/><circle cx="14.5" cy="10" r="1" fill="currentColor"/>'),
  raio: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  arvore: svg('<polygon points="12 2 17.5 9 14.6 9 19 15 15.6 15 19.5 20 4.5 20 8.4 15 5 15 9.4 9 6.5 9"/><line x1="12" y1="20" x2="12" y2="23"/>'),
  talheres: svg('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>'),
  biscoito: svg('<circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="9" r="1" fill="currentColor"/><circle cx="14.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="14.5" r="1" fill="currentColor"/><circle cx="9.5" cy="15" r="1" fill="currentColor"/>'),
};

const TEMAS = [
  {
    chave: 'padrao',
    nome: 'Padrão',
    emoji: '😇',
    icone: IC.brilho,
    slogan: 'Cuide em segredo',
    descricao: 'O visual clássico do Anjo Secreto: dourado, céu estrelado e cantos discretos.',
    cor: '#0d1117',   // theme-color da barra do navegador
    classe: null,     // classe extra no <body>
    css: null,        // folha de estilo extra (em /css)
    mudancas: [
      'Dourado e céu estrelado em todas as telas',
      'Feed, Direct e painel no visual de sempre',
      'Sem aba extra de preferências',
    ],
    prefs: null,
    banner: null,
  },
  {
    chave: 'criancas',
    nome: 'Dia das Crianças',
    emoji: '🎈',
    icone: IC.balao,
    slogan: 'Mês das Crianças',
    descricao: 'Outubro inteiro com cara de festa: balões subindo, confete, cores alegres, fonte arredondada e uma aba para cada um contar o que quer ganhar.',
    cor: '#ff5a8a',
    classe: 'tema-criancas',
    css: 'tema-criancas.css',
    placeholderPost: 'Conta pra turma: o que está rolando?',
    mudancas: [
      'Balões e confete flutuando por todas as telas',
      'Cores alegres, fonte arredondada e botões em gradiente',
      'Direct com balões coloridos e fundo de bolinhas',
      'Faixa "Mês das Crianças" no feed e no painel',
      'Aba "Mês das Crianças" nas preferências: presentes que a pessoa quer ganhar',
      'O anjo vê a lista de presentes na página do protegido',
    ],
    banner: {
      titulo: 'É o Mês das Crianças!',
      texto: 'Solte a criança que vive em você: conte o que você quer ganhar e deixe o seu anjo acertar em cheio.',
      botao: 'Contar o que eu quero ganhar',
      botaoPreenchido: 'Ver minha lista de presentes',
    },
    prefs: {
      titulo: 'Mês das Crianças',
      subtitulo: 'Conte o que faria a sua criança interior pular de alegria. Seu anjo consulta esta lista.',
      heroTitulo: 'Volte a ser criança por um mês',
      heroTexto: 'Brinquedo, doce, personagem, aquele presente que você sempre quis… Quanto mais você contar, mais fácil o seu anjo acertar.',
      campos: [
        {
          campo: 'presentes', tipo: 'lista', max: 12,
          rotulo: 'Presentes que eu mais gosto', emoji: '🎁', icone: IC.presente,
          dica: 'Digite e aperte Enter para adicionar (até 12). Ou toque nas ideias abaixo.',
          placeholder: 'Ex.: pelúcia, LEGO, chocolate…',
          sugestoes: ['🧸 Pelúcia', '🧱 LEGO', '🧩 Quebra-cabeça', '🎲 Jogo de tabuleiro', '🎮 Videogame', '📚 Livro ou HQ', '🍫 Chocolate', '🍭 Doces', '🎨 Material de arte', '⚽ Bola', '🚗 Carrinho', '🪁 Pipa', '🎧 Fone de ouvido', '🧢 Boné', '🧦 Meia divertida', '🍿 Pipoca'],
        },
        { campo: 'brinquedo', tipo: 'texto', rotulo: 'Brinquedo favorito da infância', emoji: '🧸', icone: IC.urso, placeholder: 'Ex.: boneca, carrinho Hot Wheels, pega-varetas…' },
        { campo: 'doce', tipo: 'texto', rotulo: 'Doce ou guloseima favorita', emoji: '🍭', icone: IC.pirulito, placeholder: 'Ex.: Bis, paçoca, chiclete Ploc…' },
        { campo: 'personagem', tipo: 'texto', rotulo: 'Personagem ou desenho favorito', emoji: '🦸', icone: IC.estrela, placeholder: 'Ex.: Pokémon, Turma da Mônica, Dragon Ball…' },
        { campo: 'brincadeira', tipo: 'texto', rotulo: 'Brincadeira que mais gostava', emoji: '🪁', icone: IC.pipa, placeholder: 'Ex.: esconde-esconde, queimada, videogame com os amigos…' },
        { campo: 'sonho', tipo: 'textarea', rotulo: 'Um sonho de criança que ainda tem', emoji: '✨', icone: IC.brilho, placeholder: 'Aquilo que você sempre quis ganhar e nunca ganhou…' },
        { campo: 'recado', tipo: 'textarea', rotulo: 'Recadinho pro meu anjo', emoji: '💌', icone: IC.carta, placeholder: 'Qualquer dica extra para o seu anjo acertar no presente' },
      ],
    },
  },
  {
    chave: 'halloween',
    nome: 'Halloween',
    emoji: '🎃',
    icone: IC.abobora,
    slogan: 'Noite das Bruxas',
    descricao: 'Noite roxa com lua cheia, morcegos cruzando a tela, fantasmas, teias e neblina. Laranja de abóbora nos botões, títulos arrepiantes e uma aba para cada um contar seus doces favoritos (e seus medos).',
    cor: '#0f0818',
    classe: 'tema-halloween',
    css: 'tema-halloween.css',
    placeholderPost: 'Conta o que está rolando… se tiver coragem',
    mudancas: [
      'Lua cheia, morcegos, fantasmas, teias e neblina em todas as telas',
      'Laranja e roxo, títulos arrepiantes e botões com brilho de abóbora',
      'Direct com balões laranja e roxos e teia no fundo da conversa',
      'Faixa "Noite das Bruxas" no feed e no painel',
      'Aba "Halloween" nas preferências: doces favoritos, fantasia, filme de terror e medos',
      'O anjo vê a lista na página do protegido',
      'Chuva de doces ao salvar a lista (e a abóbora da faixa reage ao toque)',
    ],
    banner: {
      titulo: 'A Noite das Bruxas chegou',
      texto: 'Doces ou travessuras? Conte o que te adoça e o que te assombra, e deixe o seu anjo preparar o susto bom.',
      botao: 'Contar meus doces favoritos',
      botaoPreenchido: 'Ver minha lista de doces',
    },
    prefs: {
      titulo: 'Halloween',
      subtitulo: 'Doces ou travessuras? Conte seus doces favoritos e seus medos de brincadeira. Seu anjo consulta esta lista.',
      heroTitulo: 'Doces ou travessuras?',
      heroTexto: 'Chocolate, bala, pipoca doce… e aquele filme de terror que você ama. Quanto mais você contar, mais o seu anjo acerta no susto bom.',
      gostosTitulo: 'Os doces e sustos de',
      cardTexto: 'Conte seus doces e sustos',
      cardPreenchido: 'Ver minha lista de doces',
      campos: [
        {
          campo: 'doces', tipo: 'lista', max: 12,
          rotulo: 'Doces que eu mais gosto', emoji: '🍬', icone: IC.bala,
          dica: 'Digite e aperte Enter para adicionar (até 12). Ou toque nas ideias abaixo.',
          placeholder: 'Ex.: chocolate, bala de goma, pipoca doce…',
          sugestoes: ['🍫 Chocolate', '🍬 Bala de goma', '🍭 Pirulito', '🍿 Pipoca doce', '🍪 Biscoito', '🧁 Cupcake', '🍩 Rosquinha', '🥜 Paçoca', '🍫 Bis', '🍮 Pudim', '🍯 Brigadeiro', '🍬 Fini', '🍦 Sorvete', '🥧 Torta', '🍎 Maçã do amor', '🍡 Doce de leite'],
        },
        { campo: 'fantasia', tipo: 'texto', rotulo: 'Fantasia que eu usaria', emoji: '🧛', icone: IC.mascara, placeholder: 'Ex.: vampiro, bruxa, personagem de filme…' },
        { campo: 'filme', tipo: 'texto', rotulo: 'Filme ou série de terror favorita', emoji: '🎬', icone: IC.filme, placeholder: 'Ex.: Invocação do Mal, Stranger Things, Sexta-Feira 13…' },
        { campo: 'medo', tipo: 'texto', rotulo: 'Meu medo bobo', emoji: '🕷️', icone: IC.fantasma, placeholder: 'Ex.: barata, escuro, palhaço, elevador…' },
        { campo: 'travessura', tipo: 'textarea', rotulo: 'Uma travessura que eu já aprontei', emoji: '😈', icone: IC.raio, placeholder: 'Aquela história que a turma precisa saber…' },
        { campo: 'recado', tipo: 'textarea', rotulo: 'Recadinho pro meu anjo', emoji: '💌', icone: IC.carta, placeholder: 'Qualquer dica extra para o seu anjo acertar no presente' },
      ],
    },
  },
  {
    chave: 'natal',
    nome: 'Natal',
    emoji: '🎄',
    icone: IC.arvore,
    slogan: 'Feliz Natal!',
    descricao: 'Uma noite azul de neve: céu da meia-noite com a lua cheia, neve caindo, o trenó do Papai Noel cruzando o céu, vila nevada com casinhas de janela acesa, botões no vermelho do Papai Noel, letra de cartão de Natal e uma aba para cada um escrever a cartinha do que quer ganhar.',
    cor: '#0f2558',
    classe: 'tema-natal',
    css: 'tema-natal.css',
    placeholderPost: 'Conta pra turma: como está o clima de Natal por aí?',
    mudancas: [
      'Céu azul da meia-noite com a lua cheia, estrelas e neve caindo; o trenó cruza o céu de vez em quando',
      'Vila nevada com casinhas de janela acesa, fumacinha na chaminé e pinheiros (na faixa, no login e no chão do computador)',
      'Botões no vermelho do Papai Noel, detalhes em branco e azul-gelo e pisca-pisca na barra de baixo',
      'Títulos e o texto dos posts em letra de cartão de Natal',
      'Direct com balões vermelhos e azuis e floquinhos no fundo da conversa',
      'Faixa "Feliz Natal!" no feed e no painel',
      'Aba "Natal" nas preferências: a cartinha com o que pediria ao Papai Noel, a ceia, o doce e o filme favorito',
      'O anjo vê a cartinha na página do protegido',
      'Neve de presentes ao salvar a cartinha (e tocar na vila da faixa faz nevar)',
    ],
    banner: {
      titulo: 'O Natal chegou',
      texto: 'Escreva a sua cartinha: conte o que você pediria ao Papai Noel e deixe o seu anjo fazer a parte dele.',
      botao: 'Escrever minha cartinha',
      botaoPreenchido: 'Ver minha cartinha',
    },
    prefs: {
      titulo: 'Natal',
      subtitulo: 'O que você pediria ao Papai Noel? Seu anjo consulta esta cartinha.',
      heroTitulo: 'Querido Papai Noel…',
      heroTexto: 'Presentes, o doce da ceia, aquele filme que você vê todo ano… Quanto mais você contar, mais fácil o seu anjo acertar.',
      gostosTitulo: 'A cartinha de Natal de',
      cardTexto: 'Escreva a sua cartinha de Natal',
      cardPreenchido: 'Ver minha cartinha',
      campos: [
        {
          campo: 'presentes', tipo: 'lista', max: 12,
          rotulo: 'O que eu pediria ao Papai Noel', emoji: '🎁', icone: IC.presente,
          dica: 'Digite e aperte Enter para adicionar (até 12). Ou toque nas ideias abaixo.',
          placeholder: 'Ex.: livro, perfume, caneca…',
          sugestoes: ['📚 Livro', '🌸 Perfume', '☕ Caneca', '🧦 Meias divertidas', '🍫 Chocolate', '🍷 Vinho', '🎧 Fone de ouvido', '🪴 Plantinha', '🕯️ Vela aromática', '🧣 Cachecol', '🎮 Jogo', '🧴 Kit de skincare'],
        },
        { campo: 'ceia', tipo: 'texto', rotulo: 'Prato favorito da ceia', emoji: '🍗', icone: IC.talheres, placeholder: 'Ex.: peru, farofa, salpicão, bacalhau…' },
        { campo: 'doce', tipo: 'texto', rotulo: 'Doce de Natal favorito', emoji: '🍪', icone: IC.biscoito, placeholder: 'Ex.: panetone, chocotone, rabanada, pavê…' },
        { campo: 'filme', tipo: 'texto', rotulo: 'Filme de Natal que não pode faltar', emoji: '🎬', icone: IC.filme, placeholder: 'Ex.: Esqueceram de Mim, O Grinch, Simplesmente Amor…' },
        { campo: 'tradicao', tipo: 'textarea', rotulo: 'Uma tradição de Natal que eu amo', emoji: '⭐', icone: IC.estrela, placeholder: 'Montar a árvore, o amigo secreto da família, a ceia na casa da vó…' },
        { campo: 'recado', tipo: 'textarea', rotulo: 'Recadinho pro meu anjo', emoji: '💌', icone: IC.carta, placeholder: 'Qualquer dica extra para o seu anjo acertar no presente' },
      ],
    },
  },
];

const PADRAO = TEMAS[0];

function porChave(chave) {
  return TEMAS.find((t) => t.chave === chave) || null;
}

module.exports = { TEMAS, PADRAO, porChave };
