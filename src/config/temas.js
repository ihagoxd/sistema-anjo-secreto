'use strict';

/**
 * Catálogo de TEMAS da rede social (admin → "Tema da rede").
 *
 * O tema ativo muda a cara do app INTEIRO (feed, Direct, painel, admin e até o
 * login) e pode liberar uma aba extra de preferências para os participantes
 * (ex.: Mês das Crianças → "presentes que eu mais gosto"), que o anjo consulta.
 *
 * Por enquanto só existem o tema padrão e o Dia das Crianças. Para criar um novo
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
];

const PADRAO = TEMAS[0];

function porChave(chave) {
  return TEMAS.find((t) => t.chave === chave) || null;
}

module.exports = { TEMAS, PADRAO, porChave };
