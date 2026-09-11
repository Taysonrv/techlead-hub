export type ReleaseNoteItem = {
  title: string;
  description: string;
};

export type ReleaseNote = {
  version: string;
  title?: string;
  items: readonly ReleaseNoteItem[];
};

export const FALLBACK_APP_VERSION = "1.0.0-rc.1";

export const releaseNotes: Record<string, ReleaseNote> = {
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