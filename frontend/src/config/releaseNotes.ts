export type ReleaseNoteItem = {
  title: string;
  description: string;
};

export type ReleaseNote = {
  version: string;
  title?: string;
  items: readonly ReleaseNoteItem[];
};

export const FALLBACK_APP_VERSION = "0.2.0-beta.3";

export const releaseNotes: Record<string, ReleaseNote> = {
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

export function getReleaseNote(version: string | null | undefined): ReleaseNote | null {
  if (!version) return null;
  return releaseNotes[version] ?? null;
}
