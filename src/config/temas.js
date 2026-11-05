'use strict';

/**
 * Catálogo de TEMAS da rede social (admin → "Tema da rede").
 *
 * O tema ativo muda a cara do app INTEIRO (feed, Direct, painel, admin e até o
 * login) e pode liberar uma aba extra de preferências para os participantes
 * (ex.: Mês das Crianças → "presentes que eu mais gosto"), que o anjo consulta.
 *
 * Temas: padrão, Dia das Crianças e Halloween. Para criar um novo
 * tema: adicione um item aqui, uma folha /css/tema-<chave>.css e (se tiver aba de
 * preferências) os campos em `prefs`. O resto do app lê daqui.
 */
const TEMAS = [
  {
    chave: 'padrao',
    nome: 'Padrão',
    emoji: '😇',
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
    slogan: 'Mês das Crianças',
    descricao: 'Outubro inteiro com cara de festa: balões subindo, confete, cores alegres, fonte arredondada e uma aba para cada um contar o que quer ganhar.',
    cor: '#ff5a8a',
    classe: 'tema-criancas',
    css: 'tema-criancas.css',
    placeholderPost: 'Conta pra turma: o que está rolando? 🎈',
    mudancas: [
      'Balões e confete flutuando por todas as telas',
      'Cores alegres, fonte arredondada e botões em gradiente',
      'Direct com balões coloridos e fundo de bolinhas',
      'Faixa "Mês das Crianças" no feed e no painel',
      'Aba "Mês das Crianças" nas preferências: presentes que a pessoa quer ganhar',
      'O anjo vê a lista de presentes na página do protegido',
    ],
    banner: {
      titulo: 'É o Mês das Crianças! 🎉',
      texto: 'Solte a criança que vive em você: conte o que você quer ganhar e deixe o seu anjo acertar em cheio.',
      botao: 'Contar o que eu quero ganhar',
      botaoPreenchido: 'Ver minha lista de presentes',
    },
    prefs: {
      titulo: 'Mês das Crianças',
      subtitulo: 'Conte o que faria a sua criança interior pular de alegria. Seu anjo consulta esta lista.',
      heroTitulo: 'Volte a ser criança por um mês 🧸',
      heroTexto: 'Brinquedo, doce, personagem, aquele presente que você sempre quis… Quanto mais você contar, mais fácil o seu anjo acertar.',
      campos: [
        {
          campo: 'presentes', tipo: 'lista', max: 12,
          rotulo: 'Presentes que eu mais gosto', emoji: '🎁',
          dica: 'Digite e aperte Enter para adicionar (até 12). Ou toque nas ideias abaixo.',
          placeholder: 'Ex.: pelúcia, LEGO, chocolate…',
          sugestoes: ['🧸 Pelúcia', '🧱 LEGO', '🧩 Quebra-cabeça', '🎲 Jogo de tabuleiro', '🎮 Videogame', '📚 Livro ou HQ', '🍫 Chocolate', '🍭 Doces', '🎨 Material de arte', '⚽ Bola', '🚗 Carrinho', '🪁 Pipa', '🎧 Fone de ouvido', '🧢 Boné', '🧦 Meia divertida', '🍿 Pipoca'],
        },
        { campo: 'brinquedo', tipo: 'texto', rotulo: 'Brinquedo favorito da infância', emoji: '🧸', placeholder: 'Ex.: boneca, carrinho Hot Wheels, pega-varetas…' },
        { campo: 'doce', tipo: 'texto', rotulo: 'Doce ou guloseima favorita', emoji: '🍭', placeholder: 'Ex.: Bis, paçoca, chiclete Ploc…' },
        { campo: 'personagem', tipo: 'texto', rotulo: 'Personagem ou desenho favorito', emoji: '🦸', placeholder: 'Ex.: Pokémon, Turma da Mônica, Dragon Ball…' },
        { campo: 'brincadeira', tipo: 'texto', rotulo: 'Brincadeira que mais gostava', emoji: '🪁', placeholder: 'Ex.: esconde-esconde, queimada, videogame com os amigos…' },
        { campo: 'sonho', tipo: 'textarea', rotulo: 'Um sonho de criança que ainda tem', emoji: '✨', placeholder: 'Aquilo que você sempre quis ganhar e nunca ganhou…' },
        { campo: 'recado', tipo: 'textarea', rotulo: 'Recadinho pro meu anjo', emoji: '💌', placeholder: 'Qualquer dica extra para o seu anjo acertar no presente' },
      ],
    },
  },
  {
    chave: 'halloween',
    nome: 'Halloween',
    emoji: '🎃',
    slogan: 'Noite das Bruxas',
    descricao: 'Noite roxa com lua cheia, morcegos cruzando a tela, fantasmas, teias e neblina. Laranja de abóbora nos botões, títulos arrepiantes e uma aba para cada um contar seus doces favoritos (e seus medos).',
    cor: '#0f0818',
    classe: 'tema-halloween',
    css: 'tema-halloween.css',
    placeholderPost: 'Conta o que está rolando… se tiver coragem 🎃',
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
          rotulo: 'Doces que eu mais gosto', emoji: '🍬',
          dica: 'Digite e aperte Enter para adicionar (até 12). Ou toque nas ideias abaixo.',
          placeholder: 'Ex.: chocolate, bala de goma, pipoca doce…',
          sugestoes: ['🍫 Chocolate', '🍬 Bala de goma', '🍭 Pirulito', '🍿 Pipoca doce', '🍪 Biscoito', '🧁 Cupcake', '🍩 Rosquinha', '🥜 Paçoca', '🍫 Bis', '🍮 Pudim', '🍯 Brigadeiro', '🍬 Fini', '🍦 Sorvete', '🥧 Torta', '🍎 Maçã do amor', '🍡 Doce de leite'],
        },
        { campo: 'fantasia', tipo: 'texto', rotulo: 'Fantasia que eu usaria', emoji: '🧛', placeholder: 'Ex.: vampiro, bruxa, personagem de filme…' },
        { campo: 'filme', tipo: 'texto', rotulo: 'Filme ou série de terror favorita', emoji: '🎬', placeholder: 'Ex.: Invocação do Mal, Stranger Things, Sexta-Feira 13…' },
        { campo: 'medo', tipo: 'texto', rotulo: 'Meu medo bobo', emoji: '🕷️', placeholder: 'Ex.: barata, escuro, palhaço, elevador…' },
        { campo: 'travessura', tipo: 'textarea', rotulo: 'Uma travessura que eu já aprontei', emoji: '😈', placeholder: 'Aquela história que a turma precisa saber…' },
        { campo: 'recado', tipo: 'textarea', rotulo: 'Recadinho pro meu anjo', emoji: '💌', placeholder: 'Qualquer dica extra para o seu anjo acertar no presente' },
      ],
    },
  },
];

const PADRAO = TEMAS[0];

function porChave(chave) {
  return TEMAS.find((t) => t.chave === chave) || null;
}

module.exports = { TEMAS, PADRAO, porChave };
