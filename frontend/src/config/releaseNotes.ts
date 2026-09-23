export type ReleaseNoteItem = {
  title: string;
  description: string;
};

export type ReleaseNote = {
  version: string;
  title?: string;
  items: readonly ReleaseNoteItem[];
};

export const FALLBACK_APP_VERSION = "1.0.0-rc.15";

export const releaseNotes: Record<string, ReleaseNote> = {
  "1.0.0-rc.15": {
    version: "1.0.0-rc.15",
    title: "Cockpit de Liderança e inteligência operacional",
    items: [
      { title: "Central de Liderança modernizada", description: "A visão executiva recebe cards padronizados, interativos e navegáveis, com acabamento visual mais moderno e consistente com o restante do TechLead Hub." },
      { title: "Cockpit operacional", description: "Nova área consolida entradas, resoluções, reaberturas, backlog, aging e balanço de fluxo para leitura gerencial da operação." },
      { title: "SLA de solução e primeira resposta", description: "Indicadores do Movidesk passam a ser apresentados em visualizações modernas, com percentuais, distribuição e recorte por analista." },
      { title: "Resolução por analista", description: "Nova análise compara resoluções, reaberturas e ocorrências fora do SLA por responsável, sem depender dos painéis externos do Movidesk." },
      { title: "Categorias, clientes e solicitantes", description: "Distribuições operacionais mostram concentração por categoria, cliente e contato no mesmo período e filtros da Central." },
      { title: "Aging e antecipação de risco", description: "O backlog é segmentado por idade, destacando atendimentos com mais de 15 dias e permitindo abrir diretamente as evidências." },
      { title: "Indicadores acionáveis", description: "Cards de backlog, SLA, bloqueios, reaberturas e aging abrem os atendimentos relacionados para investigação, reduzindo a distância entre indicador e ação." },
      { title: "Inteligência além do Movidesk", description: "Taxa de reabertura, resolução no primeiro contato e balanço entre entradas e resoluções complementam os relatórios tradicionais com sinais de saúde operacional." },
      { title: "Cockpit como visão inicial", description: "A Central passa a abrir diretamente nos indicadores operacionais, priorizando leitura executiva e investigação antes das análises especializadas." },
      { title: "Exportação das evidências", description: "Listagens abertas a partir dos indicadores da liderança podem ser exportadas para Excel para conciliação, acompanhamento e comparação com o Movidesk." },
      { title: "Relatórios interativos", description: "Séries, categorias e segmentos dos gráficos podem ser marcados ou desmarcados; o relatório recalcula e reorganiza automaticamente a visualização mantendo pelo menos uma dimensão ativa." },
    ],
  },
  "1.0.0-rc.14": {
    version: "1.0.0-rc.14",
    title: "Mapa SIMER, experiência unificada e Desktop mais leve",
    items: [
      { title: "Mapa e Fluxo SIMER", description: "Nova experiência integrada para navegar pela árvore do sistema, regras Bizagi, mapas técnicos, rotinas relacionadas e investigação contextual." },
      { title: "Design System unificado", description: "Cards, cabeçalhos, botões, chips, abas, tabelas e superfícies passam a compartilhar o mesmo padrão visual moderno em toda a aplicação." },
      { title: "Interface mais fluida", description: "Efeitos gráficos globais mais pesados foram removidos e o carregamento do frontend foi dividido em pacotes menores para reduzir trabalho desnecessário na abertura e navegação." },
      { title: "Instalação e atualização otimizadas", description: "O runtime Desktop é higienizado antes do empacotamento, removendo dependências de desenvolvimento, caches e resíduos que não precisam acompanhar o instalador." },
      { title: "Builds mais confiáveis", description: "Backend e Desktop passam a limpar saídas antigas antes da compilação, evitando arquivos obsoletos entre versões." },
      { title: "Novidades após atualizar", description: "Ao abrir uma nova versão pela primeira vez, o TechLead Hub apresenta as principais mudanças e permite seguir para a aplicação ou consultar todos os detalhes." },
    ],
  },
  "1.0.0-rc.8": {
    version: "1.0.0-rc.8",
    title: "Colaboração operacional e menções",
    items: [
      { title: "Canais com participantes", description: "O chat permite selecionar usuários ativos e aprovados ao criar um canal da equipe." },
      { title: "Menções integradas", description: "Mensagens com @usuario geram notificações navegáveis para o canal relacionado." },
      { title: "Não lidas precisas", description: "Cada canal passa a exibir a quantidade real de mensagens ainda não visualizadas pelo usuário." },
      { title: "Segurança preservada", description: "Menções respeitam os membros do canal e continuam protegidas contra envio de credenciais." },
    ],
  },
  "1.0.0-rc.7": {
    version: "1.0.0-rc.7",
    title: "Colaboração, coordenação e proteção de dados",
    items: [
      { title: "Chat interno seguro", description: "Canais da equipe com controle de membros, histórico auditável e bloqueio de padrões de credenciais." },
      { title: "Central de Coordenação", description: "Backlog, criticidade, vencimentos, bloqueios e carga combinada de tickets e Work Items por analista." },
      { title: "Microsoft 365", description: "Leitura delegada de Planner, calendário Outlook e equipes do Teams sobre a conexão corporativa existente." },
      { title: "Proteção contra vazamento", description: "Cabeçalhos defensivos, respostas sem cache, token por sessão do navegador e verificação de segredos no CI." },
      { title: "Documentação completa", description: "Requisitos, arquitetura, banco, API, segurança, integrações e runbook de operação e publicação." },
    ],
  },
  "1.0.0-rc.6": {
    version: "1.0.0-rc.6",
    title: "Sincronizações auditáveis, desempenho e dados enriquecidos",
    items: [
      {
        title: "Central de Sincronizações",
        description:
          "Movidesk, importações e Azure DevOps passam a compartilhar histórico, ações manuais, situação, duração e resultados em uma única visão.",
      },
      {
        title: "Importação validada",
        description:
          "Arquivos Excel e JSON são inspecionados antes da confirmação, com quantidade de registros, formato e aviso de arquivo já processado.",
      },
      {
        title: "Auditoria e ocorrências",
        description:
          "As importações registram o responsável, a assinatura do arquivo e as ocorrências, que podem ser baixadas em CSV pelo resultado ou histórico.",
      },
      {
        title: "Movidesk enriquecido",
        description:
          "Linha do tempo, reaberturas, resolução no primeiro contato, satisfação e payload completo apoiam análises operacionais e executivas.",
      },
      {
        title: "Pendências e desempenho",
        description:
          "Consultas compartilhadas, índices em memória, cache curto e carregamento sob demanda reduzem o tempo das telas e restauram Pendências com a base completa.",
      },
      {
        title: "Carregamento por tela",
        description:
          "As páginas são carregadas sob demanda, reduzindo o pacote inicial e acelerando a abertura do aplicativo Web e Desktop.",
      },
    ],
  },
  "1.0.0-rc.5": {
    version: "1.0.0-rc.5",
    title: "Consolidação executiva e operacional",
    items: [
      {
        title: "Gestão integrada",
        description:
          "Consolidação das melhorias executivas, operacionais, de relatórios, notificações, usuários e experiência das telas principais.",
      },
    ],
  },
  "1.0.0-rc.4": {
    version: "1.0.0-rc.4",
    title: "Saúde do cliente e higienização operacional",
    items: [
      {
        title: "Histórico e Saúde do Cliente",
        description:
          "O relatório executivo passa a considerar até dez anos de histórico e reúne atendimentos, SLA, categorias, analistas, desenvolvimento e versões para visitas e reuniões.",
      },
      {
        title: "Higienização de atendimentos",
        description:
          "A Qualidade dos Dados identifica tickets ainda abertos quando a Correção, Evolução ou APOIO relacionado já foi concluído com versão ou cancelado.",
      },
      {
        title: "Navegação para ação",
        description:
          "Os registros de higienização exibem Ticket, Task, situação e versão, com acesso direto aos detalhes do atendimento.",
      },
      {
        title: "Atualizador corrigido",
        description:
          "Versões anteriores deixam de ser apresentadas como novas quando o aplicativo instalado já está em uma versão superior.",
      },
    ],
  },
  "1.0.0-rc.3": {
    version: "1.0.0-rc.3",
    title: "Desktop resiliente e atualização corrigida",
    items: [
      {
        title: "Inicialização do Desktop",
        description:
          "O aplicativo volta a iniciar com o backend local empacotado enquanto o servidor Web central ainda não estiver configurado.",
      },
      {
        title: "Servidor Web opcional",
        description:
          "A conexão com https://techlead-hub.aliare.co somente é ativada quando TECHLEAD_HUB_SERVER_URL for definida na implantação.",
      },
      {
        title: "Atualizações Beta e RC",
        description:
          "O canal Beta aceita novas versões de pré-lançamento, impede downgrade e consulta os artefatos publicados em techlead-hub-releases.",
      },
      {
        title: "Publicação mais segura",
        description:
          "O workflow publica apenas o instalador, o blockmap e o manifesto do canal, sem enviar arquivos internos do electron-builder.",
      },
      {
        title: "Minha Operação",
        description:
          "Kanban compacto em uma única linha, cartões mais legíveis, status na listagem e abertura dos atendimentos com os mesmos detalhes da tela de Tickets.",
      },
      {
        title: "Versão Web",
        description:
          "A imagem Docker continua sendo gerada junto com a versão Desktop, pronta para implantação e validação pela infraestrutura.",
      },
    ],
  },
    "1.0.0-rc.1": {
    version: "1.0.0-rc.1",
    title: "TechLead Hub Web e operação centralizada",
    items: [
      {
        title: "Versão Web",
        description:
          "O TechLead Hub agora pode ser disponibilizado via Docker e acessado pelo navegador em um endereço centralizado.",
      },
      {
        title: "Desktop conectado à Web",
        description:
          "A versão Desktop 1.x passa a utilizar o mesmo servidor, banco de dados e configurações da aplicação Web.",
      },
      {
        title: "Configuração administrativa central",
        description:
          "Azure DevOps, Wiki, Microsoft 365, SharePoint e BPMN são configurados uma única vez pelo administrador e compartilhados com todos os usuários.",
      },
      {
        title: "Segurança das integrações",
        description:
          "As configurações sensíveis são criptografadas no PostgreSQL e não são incluídas na imagem Docker.",
      },
      {
        title: "Implantação e monitoramento",
        description:
          "Nova imagem Docker com health checks, documentação de implantação, atualização e rollback.",
      },
      {
        title: "Publicação coordenada",
        description:
          "O processo de release passa a gerar versões correspondentes da aplicação Web e do instalador Desktop.",
      },
    ],
  },
  "0.2.0-beta.4": {
    version: "0.2.0-beta.4",
    title: "Inteligência operacional e conhecimento integrado",
    items: [
      {
        title: "Base de Conhecimento",
        description:
          "Pesquisa integrada à Wiki do Azure DevOps, com resultados contextualizados, links diretos e preparação para integração com SharePoint e fluxos BPMN.",
      },
      {
        title: "Versões e entregas relacionadas",
        description:
          "A pesquisa por assunto agora relaciona versões recentes, correções e evoluções, permitindo consultar detalhes e abrir a entrega diretamente no Azure DevOps.",
      },
      {
        title: "Análise executiva de clientes",
        description:
          "Tela de clientes aprimorada com indicadores, categorias, insights, filtros, visão de Backoffice e apresentação em tela cheia.",
      },
      {
        title: "Relatórios gerenciais",
        description:
          "Novos filtros específicos por relatório, incluindo cliente, analista, período, SLA, categoria, status e demais dimensões operacionais.",
      },
      {
        title: "Operação e SLA",
        description:
          "Indicadores de prazo unificados, melhorias no Kanban da Minha Operação e movimentação operacional local dos atendimentos.",
      },
      {
        title: "Experiência padronizada",
        description:
          "Telas, cartões, títulos, painéis laterais, cabeçalho, pesquisa global, calendário e sidebar revisados seguindo o padrão visual do Dashboard.",
      },
      {
        title: "Integrações Microsoft",
        description:
          "Configuração administrativa preparada para Tenant ID e Client ID, permitindo ativar futuramente SharePoint e fontes Microsoft 365.",
      },
      {
        title: "Segurança e estabilidade",
        description:
          "Correções preventivas, atualização de dependências, validações de dados e melhorias no processo automatizado de publicação.",
      },
    ],
  },

  "0.2.0-beta.3": {
    version: "0.2.0-beta.3",
    items: [
      {
        title: "Configuração integrada",
        description:
          "A primeira instalação permite informar a conexão PostgreSQL diretamente no aplicativo, sem exigir um arquivo .env.",
      },
      {
        title: "Importação opcional do .env",
        description:
          "O provisionamento por arquivo continua disponível e importa banco e Azure DevOps para o armazenamento seguro do Windows.",
      },
      {
        title: "Azure DevOps protegido",
        description:
          "Organização, projeto, Wiki e PAT são armazenados de forma criptografada e repassados somente ao backend local.",
      },
      {
        title: "Inicialização resiliente",
        description:
          "A ausência de configuração do Azure não impede mais o TechLead Hub de iniciar.",
      },
    ],
  },

  "0.1.4-beta.1": {
    version: "0.1.4-beta.1",
    items: [
      {
        title: "Banco de dados compartilhado",
        description:
          "O TechLead Hub passa a utilizar a base PostgreSQL compartilhada, permitindo que usuários autorizados trabalhem sobre o mesmo conjunto de dados.",
      },
      {
        title: "Cadastro e aprovação de usuários",
        description:
          "Novo fluxo de criação de conta com aprovação administrativa, ativação, desativação e controle de acesso.",
      },
      {
        title: "Segurança reforçada",
        description:
          "APIs operacionais protegidas por autenticação e validação de sessão, usuário ativo e aprovação administrativa.",
      },
      {
        title: "Configuração segura do desktop",
        description:
          "Credenciais locais de conexão passam a ser armazenadas de forma criptografada pelo Windows no aplicativo desktop.",
      },
      {
        title: "Importação e snapshots",
        description:
          "Aprimoramentos na importação do Movidesk e uso do último snapshot válido para manter os indicadores consistentes.",
      },
      {
        title: "SLA e indicadores",
        description:
          "Indicadores oficiais do Movidesk e regras centralizadas de prazo passam a compor a análise histórica e operacional.",
      },
      {
        title: "Atualizações do aplicativo",
        description:
          "Fluxo de verificação, download e instalação de versões Beta pelo próprio TechLead Hub.",
      },
      {
        title: "Prontidão do backend",
        description:
          "Nova validação de disponibilidade do backend e da conexão com o banco antes da abertura da aplicação.",
      },
    ],
  },

  "0.1.3-beta.1": {
    version: "0.1.3-beta.1",
    items: [
      {
        title: "Atualização automática",
        description:
          "Estrutura de atualização Beta via GitHub Releases integrada ao aplicativo desktop.",
      },
      {
        title: "Sobre e Atualizações",
        description:
          "Tela dedicada para consultar a versão instalada e gerenciar atualizações.",
      },
    ],
  },

  "0.1.2-beta.1": {
    version: "0.1.2-beta.1",
    items: [
      {
        title: "Prazos oficiais do Movidesk",
        description:
          "Primeira resposta e solução passam a priorizar os vencimentos oficiais importados do Movidesk.",
      },
      {
        title: "Tickets em pausa",
        description:
          'Casos com "Vencimento em = Em pausa" deixam de gerar alertas incorretos de prazo vencido.',
      },
      {
        title: "Importação aprimorada",
        description:
          "Reconhecimento de Serviço (2º Nível), Vencimento em, Tempo de vida (Horas úteis), Versão Entregue Task e Número Task.",
      },
      {
        title: "Indicadores de desempenho",
        description:
          "Ajustes nos indicadores históricos de primeira resposta, resolução e desempenho por analista.",
      },
      {
        title: "Motor central de prazo",
        description:
          "Performance, Tickets e Pontos de Atenção passam a consumir a mesma regra centralizada.",
      },
      {
        title: "Sobre e Atualizações",
        description:
          "Nova experiência para consultar versão, verificar, baixar e instalar atualizações.",
      },
    ],
  },
};

export function getReleaseNote(
  version: string | null | undefined,
): ReleaseNote | null {
  if (!version) return null;

  return releaseNotes[version] ?? null;
}
