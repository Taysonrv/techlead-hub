export type ReleaseNoteType =
  | "feature"
  | "improvement"
  | "fix"
  | "security"
  | "technical";

export type ReleaseNoteItem = {
  type:
    ReleaseNoteType;

  title:
    string;

  description:
    string;
};

export type ReleaseNote = {
  version:
    string;

  date:
    string;

  status:
    | "released"
    | "development";

  title:
    string;

  description?:
    string;

  items:
    ReleaseNoteItem[];
};

/* =========================================================
   HISTÓRICO DE RELEASES

   Sempre adicionar novas versões no início da lista.
========================================================= */

export const releaseNotes:
  ReleaseNote[] = [
  {
    version:
      "0.1.1-beta.2",

    date:
      "23/08/2026",

    status:
      "development",

    title:
      "Melhorias de visualização e experiência",

    description:
      "Segunda versão Beta do TechLead Hub, com foco na correção dos indicadores gráficos e melhoria da leitura das informações operacionais.",

    items: [
      {
        type:
          "fix",

        title:
          "Evolução dos Tickets",

        description:
          "Corrigida a apresentação das datas e das quantidades no gráfico de evolução dos tickets. O tooltip agora apresenta corretamente a data e o total de tickets abertos naquele dia.",
      },

      {
        type:
          "improvement",

        title:
          "Evolução diária",

        description:
          "O gráfico do Dashboard passa a considerar também dias sem abertura de tickets, evitando saltos na linha de evolução.",
      },

      {
        type:
          "improvement",

        title:
          "Última atualização dos dados",

        description:
          "Incluída no Dashboard a informação da última atualização identificada a partir dos dados importados.",
      },

      {
        type:
          "improvement",

        title:
          "Visualização dos Analistas",

        description:
          "Reestruturada a distribuição da carteira por analista, reduzindo o espaço ocupado pelos nomes e melhorando a proporção entre gráfico e legenda.",
      },

      {
        type:
          "improvement",

        title:
          "Top analistas",

        description:
          "A distribuição por analista passa a destacar os principais responsáveis e agrupar os demais em Outros, mantendo quantidade e percentual na legenda.",
      },

      {
        type:
          "improvement",

        title:
          "Visualização dos Clientes",

        description:
          "Ajustada a distribuição por cliente para evitar que nomes extensos comprometam a visualização dos gráficos e indicadores.",
      },

      {
        type:
          "improvement",

        title:
          "Top clientes",

        description:
          "O gráfico passa a apresentar os principais clientes de forma compacta, agrupando os demais em Outros e exibindo quantidade e participação percentual.",
      },

      {
        type:
          "improvement",

        title:
          "Tabelas responsivas",

        description:
          "Nomes extensos de analistas, clientes e assuntos passaram a utilizar limites de largura e exibição compacta, preservando o layout das tabelas.",
      },
    ],
  },

  {
    version:
      "0.1.1-beta.1",

    date:
      "23/08/2026",

    status:
      "released",

    title:
      "Primeira versão Beta distribuível",

    description:
      "Primeira versão Beta do TechLead Hub preparada para instalação e atualização como aplicativo desktop.",

    items: [
      {
        type:
          "feature",

        title:
          "Aplicativo Desktop",

        description:
          "Disponibilizada a primeira versão instalável do TechLead Hub utilizando Electron.",
      },

      {
        type:
          "technical",

        title:
          "Backend embarcado",

        description:
          "O aplicativo desktop passa a iniciar e controlar automaticamente o backend do TechLead Hub.",
      },

      {
        type:
          "technical",

        title:
          "Frontend integrado",

        description:
          "A versão de produção do frontend passou a ser disponibilizada diretamente pelo backend embarcado.",
      },

      {
        type:
          "feature",

        title:
          "Atualização pelo GitHub",

        description:
          "Implementado mecanismo de verificação, download e instalação de novas versões utilizando GitHub Releases.",
      },

      {
        type:
          "feature",

        title:
          "Sobre e Atualizações",

        description:
          "Criada uma área dedicada para visualizar a versão instalada, verificar novas versões e acompanhar o progresso das atualizações.",
      },

      {
        type:
          "technical",

        title:
          "Canal Beta",

        description:
          "Configurado canal Beta para distribuição controlada das novas versões do TechLead Hub.",
      },

      {
        type:
          "technical",

        title:
          "Instalador Windows",

        description:
          "Gerado instalador NSIS para Windows x64 com atalhos e possibilidade de atualização sobre a instalação existente.",
      },
    ],
  },
];