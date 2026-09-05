/* =========================================================
   TECHLEAD HUB
   MOTOR CENTRAL DE PRAZOS DE ATENDIMENTO
========================================================= */

export type ServiceUrgency =
  | "P1"
  | "P2"
  | "P3"
  | "P4";

export type ServiceProfile =
  | "STANDARD"
  | "VIP";

export type ServiceKind =
  | "GENERAL"
  | "BUG";

export type DeadlineLevel =
  | "NORMAL"
  | "ATTENTION"
  | "CRITICAL"
  | "OVERDUE"
  | "NOT_APPLICABLE";

export type ServiceLevelTicket = {
  urgency?:
    string | null;

  category?:
    string | null;

  cause?:
    string | null;

  subject?:
    string | null;

  createdDate:
    string | Date;

  resolvedDate?:
    string | Date | null;

  closedDate?:
    string | Date | null;

  /*
   * Vencimento oficial da solução recebido/importado
   * do campo "Vencimento em" do Movidesk.
   *
   * Quando houver uma data válida, ela tem prioridade
   * sobre o vencimento recalculado pelo TechLead Hub.
   */
  dueDate?:
    string | Date | null;

  /*
   * Utilizado principalmente para reconhecer tickets
   * cujo prazo está oficialmente pausado no Movidesk.
   */
  baseStatus?:
    string | null;

  firstResponseDate?:
    string | Date | null;

  /*
   * Vencimento oficial da primeira resposta
   * recebido/importado do Movidesk.
   *
   * Quando informado, possui prioridade sobre
   * o vencimento calculado internamente.
   */
  firstResponseDueDate?:
    string | Date | null;

  stoppedMinutes?:
    number | null;

  /*
   * Por enquanto informado externamente.
   * Quando tivermos essa informação no banco,
   * podemos automatizar.
   */
  profile?:
    ServiceProfile;

  kind?:
    ServiceKind;
};

export type ServiceLevelResult = {
  applicable:
    boolean;

  reason:
    string | null;

  urgency:
    ServiceUrgency | null;

  profile:
    ServiceProfile;

  kind:
    ServiceKind;

  firstResponse: {
    targetMinutes:
      number | null;

    consumedMinutes:
      number;

    remainingMinutes:
      number | null;

    percentageUsed:
      number;

    deadline:
      Date | null;

    level:
      DeadlineLevel;

    completed:
      boolean;

    withinDeadline:
      boolean | null;
  };

  resolution: {
    targetMinutes:
      number | null;

    consumedMinutes:
      number;

    remainingMinutes:
      number | null;

    percentageUsed:
      number;

    deadline:
      Date | null;

    level:
      DeadlineLevel;

    completed:
      boolean;

    withinDeadline:
      boolean | null;
  };

  ola?: {
    supportMinutes:
      number;

    factoryMinutes:
      number;

    totalMinutes:
      number;

    /*
     * OLA: alerta preventivo quando
     * 50% do prazo já foi consumido.
     */
    alertPercentage:
      50;
  };

  /*
   * SLA: alerta quando restam 40%,
   * ou seja, quando 60% foi consumido.
   */
  slaAlertPercentage:
    60;
};

/* =========================================================
   CONFIGURAÇÃO DE HORAS ÚTEIS
========================================================= */

type WorkingPeriod = {
  start:
    string;

  end:
    string;
};

type WorkingSchedule =
  Partial<
    Record<
      number,
      WorkingPeriod[]
    >
  >;

/*
 * JS:
 * 0 = domingo
 * 1 = segunda
 * ...
 * 6 = sábado
 */

/*
 * Dúvida / Problema / Contorno:
 *
 * Seg–Sex 08:00–18:30
 * Sáb     08:00–12:00
 */
const GENERAL_SCHEDULE:
  WorkingSchedule = {
  1: [
    {
      start:
        "08:00",

      end:
        "18:30",
    },
  ],

  2: [
    {
      start:
        "08:00",

      end:
        "18:30",
    },
  ],

  3: [
    {
      start:
        "08:00",

      end:
        "18:30",
    },
  ],

  4: [
    {
      start:
        "08:00",

      end:
        "18:30",
    },
  ],

  5: [
    {
      start:
        "08:00",

      end:
        "18:30",
    },
  ],

  6: [
    {
      start:
        "08:00",

      end:
        "12:00",
    },
  ],
};

/*
 * Bug:
 *
 * Seg–Sex 08:00–18:00
 */
const BUG_SCHEDULE:
  WorkingSchedule = {
  1: [
    {
      start:
        "08:00",

      end:
        "18:00",
    },
  ],

  2: [
    {
      start:
        "08:00",

      end:
        "18:00",
    },
  ],

  3: [
    {
      start:
        "08:00",

      end:
        "18:00",
    },
  ],

  4: [
    {
      start:
        "08:00",

      end:
        "18:00",
    },
  ],

  5: [
    {
      start:
        "08:00",

      end:
        "18:00",
    },
  ],
};

/* =========================================================
   PRAZOS — DÚVIDA / PROBLEMA / CONTORNO
========================================================= */

const GENERAL_TARGETS = {
  STANDARD: {
    P1: {
      firstResponse:
        120,

      resolution:
        11 * 60,
    },

    P2: {
      firstResponse:
        180,

      resolution:
        22 * 60,
    },

    P3: {
      firstResponse:
        270,

      resolution:
        33 * 60,
    },

    P4: {
      firstResponse:
        480,

      resolution:
        44 * 60,
    },
  },

  VIP: {
    P1: {
      firstResponse:
        60,

      resolution:
        330,
    },

    P2: {
      firstResponse:
        90,

      resolution:
        11 * 60,
    },

    P3: {
      firstResponse:
        150,

      resolution:
        990,
    },

    P4: {
      firstResponse:
        240,

      resolution:
        22 * 60,
    },
  },
} as const;

/* =========================================================
   BUG — SUPORTE + FÁBRICA
========================================================= */

const BUG_TARGETS = {
  STANDARD: {
    P1: {
      firstResponse:
        120,

      support:
        11 * 60,

      factory:
        8 * 60,

      total:
        19 * 60,
    },

    P2: {
      firstResponse:
        180,

      support:
        22 * 60,

      factory:
        56 * 60,

      total:
        78 * 60,
    },

    P3: {
      firstResponse:
        270,

      support:
        33 * 60,

      factory:
        160 * 60,

      total:
        193 * 60,
    },

    P4: {
      firstResponse:
        480,

      support:
        44 * 60,

      factory:
        360 * 60,

      total:
        404 * 60,
    },
  },

  VIP: {
    P1: {
      firstResponse:
        60,

      support:
        330,

      factory:
        240,

      total:
        570,
    },

    P2: {
      firstResponse:
        90,

      support:
        11 * 60,

      factory:
        24 * 60,

      total:
        35 * 60,
    },

    P3: {
      firstResponse:
        150,

      support:
        990,

      factory:
        80 * 60,

      total:
        5790,
    },

    P4: {
      firstResponse:
        240,

      support:
        22 * 60,

      factory:
        180 * 60,

      total:
        202 * 60,
    },
  },
} as const;

/* =========================================================
   FERIADOS

   Pode ser abastecido posteriormente pelo backend.
   Formato: YYYY-MM-DD
========================================================= */

const NATIONAL_HOLIDAYS =
  new Set<string>();

export function setNationalHolidays(
  dates:
    string[]
) {
  NATIONAL_HOLIDAYS
    .clear();

  dates.forEach(
    (date) =>
      NATIONAL_HOLIDAYS.add(
        date
      )
  );
}

/* =========================================================
   CÁLCULO PRINCIPAL
========================================================= */

export function calculateServiceLevel(
  ticket:
    ServiceLevelTicket,

  referenceDate:
    Date =
      new Date()
):
  ServiceLevelResult {
  const profile =
    ticket.profile ??
    "STANDARD";

  const kind =
    ticket.kind ??
    inferServiceKind(
      ticket
    );

  const urgency =
    mapUrgency(
      ticket.urgency
    );

  const applicable =
    isServiceLevelApplicable(
      ticket.category
    );

  if (
    !applicable
  ) {
    return createNotApplicableResult(
      profile,
      kind,
      "Categoria não considerada na medição."
    );
  }

  if (
    !urgency
  ) {
    return createNotApplicableResult(
      profile,
      kind,
      "Urgência não identificada."
    );
  }

  const schedule =
    kind ===
    "BUG"
      ? BUG_SCHEDULE
      : GENERAL_SCHEDULE;

  const target =
    getTargets(
      kind,
      profile,
      urgency
    );

  const created =
    toDate(
      ticket.createdDate
    );

  if (!created) {
    return createNotApplicableResult(
      profile,
      kind,
      "Data de abertura inválida."
    );
  }

  const pausedMinutes =
    Math.max(
      0,
      ticket.stoppedMinutes ??
        0
    );

  /* =======================================================
     PRIMEIRA RESPOSTA
  ======================================================= */

  const firstResponseDate =
    toDate(
      ticket.firstResponseDate
    );

  const importedFirstResponseDeadline =
    toDate(
      ticket.firstResponseDueDate
    );

  /*
   * REGRA DA PRIMEIRA RESPOSTA
   *
   * Quando o Movidesk informa "1ª resposta vence em",
   * esse vencimento é a fonte prioritária para determinar
   * se a primeira resposta ficou dentro ou fora do prazo.
   *
   * Somente quando esse campo não existir, recalculamos
   * internamente o vencimento com base em:
   *
   * abertura + meta + calendário de atendimento.
   */
  const calculatedFirstResponseDeadline =
    addWorkingMinutes(
      created,
      target.firstResponse,
      schedule
    );

  const firstResponseDeadline =
    importedFirstResponseDeadline ??
    calculatedFirstResponseDeadline;

  /*
   * Para tickets já respondidos, o relógio termina
   * exatamente na data da primeira resposta.
   *
   * Para tickets ainda não respondidos, utilizamos
   * a data/hora de referência atual.
   */
  const firstResponseEnd =
    firstResponseDate ??
    referenceDate;

  const firstResponseRaw =
    calculateWorkingMinutes(
      created,
      firstResponseEnd,
      schedule
    );

  const firstResponseConsumed =
    Math.max(
      0,
      firstResponseRaw -
        pausedMinutes
    );

  const firstResponseCompleted =
    Boolean(
      firstResponseDate
    );

  const firstResponseResult =
    buildDeadlineResult({
      targetMinutes:
        target.firstResponse,

      consumedMinutes:
        firstResponseConsumed,

      deadline:
        firstResponseDeadline,

      completed:
        firstResponseCompleted,

      completionDate:
        firstResponseDate,
    });

  /* =======================================================
     RESOLUÇÃO
  ======================================================= */

  const completionDate =
    toDate(
      ticket.resolvedDate
    ) ??
    toDate(
      ticket.closedDate
    );

  const importedResolutionDeadline =
    toDate(
      ticket.dueDate
    );

  /*
   * REGRA DA SOLUÇÃO
   *
   * Quando o Movidesk disponibiliza uma data em
   * "Vencimento em", ela é a fonte prioritária para
   * determinar o cumprimento histórico da solução.
   *
   * Somente quando essa data não existir utilizamos o
   * vencimento calculado internamente pela regra de
   * urgência, perfil, categoria e horas úteis.
   */
  const calculatedResolutionDeadline =
    addWorkingMinutes(
      created,
      target.resolution,
      schedule
    );

  const resolutionDeadline =
    importedResolutionDeadline ??
    calculatedResolutionDeadline;

  const resolutionEnd =
    completionDate ??
    referenceDate;

  const resolutionRaw =
    calculateWorkingMinutes(
      created,
      resolutionEnd,
      schedule
    );

  const resolutionConsumed =
    Math.max(
      0,
      resolutionRaw -
        pausedMinutes
    );

  const resolutionCompleted =
    Boolean(
      completionDate
    );

  /*
   * Quando o relatório do Movidesk informa "Em pausa"
   * em vez de uma data de vencimento, o importador deixa
   * dueDate = null e classifica baseStatus = "Stopped".
   *
   * Para um ticket ainda aberto e pausado não devemos
   * inventar um vencimento interno, pois isso poderia
   * classificá-lo falsamente como Crítico/Vencido.
   *
   * O prazo volta a ser calculado normalmente quando o
   * ticket deixa de estar pausado ou quando o Movidesk
   * disponibiliza novamente uma data de vencimento.
   */
  const resolutionIsActivelyPaused =
    !resolutionCompleted &&
    ticket.baseStatus ===
      "Stopped" &&
    !importedResolutionDeadline;

  const resolutionResult =
    resolutionIsActivelyPaused
      ? buildPausedDeadlineResult({
          targetMinutes:
            target.resolution,

          consumedMinutes:
            resolutionConsumed,
        })
      : buildDeadlineResult({
          targetMinutes:
            target.resolution,

          consumedMinutes:
            resolutionConsumed,

          deadline:
            resolutionDeadline,

          completed:
            resolutionCompleted,

          completionDate,
        });

  return {
    applicable:
      true,

    reason:
      null,

    urgency,

    profile,

    kind,

    firstResponse:
      firstResponseResult,

    resolution:
      resolutionResult,

    ...(kind ===
      "BUG"
      ? {
          ola: {
            supportMinutes:
              target.support ??
              0,

            factoryMinutes:
              target.factory ??
              0,

            totalMinutes:
              target.resolution,

            alertPercentage:
              50 as const,
          },
        }
      : {}),

    slaAlertPercentage:
      60,
  };
}

/* =========================================================
   TARGETS
========================================================= */

function getTargets(
  kind:
    ServiceKind,

  profile:
    ServiceProfile,

  urgency:
    ServiceUrgency
) {
  if (
    kind ===
    "BUG"
  ) {
    const config =
      BUG_TARGETS[
        profile
      ][
        urgency
      ];

    return {
      firstResponse:
        config.firstResponse,

      resolution:
        config.total,

      support:
        config.support,

      factory:
        config.factory,
    };
  }

  const config =
    GENERAL_TARGETS[
      profile
    ][
      urgency
    ];

  return {
    firstResponse:
      config.firstResponse,

    resolution:
      config.resolution,

    support:
      null,

    factory:
      null,
  };
}

/* =========================================================
   RESULTADO
========================================================= */

function buildDeadlineResult({
  targetMinutes,
  consumedMinutes,
  deadline,
  completed,
  completionDate,
}: {
  targetMinutes:
    number;

  consumedMinutes:
    number;

  deadline:
    Date;

  completed:
    boolean;

  completionDate:
    Date | null;
}) {
  const remainingMinutes =
    targetMinutes -
    consumedMinutes;

  const percentageUsed =
    Math.max(
      0,
      Math.round(
        (
          consumedMinutes /
          targetMinutes
        ) *
          1000
      ) /
        10
    );

  const withinDeadline =
    completed &&
    completionDate
      ? completionDate.getTime() <=
        deadline.getTime()
      : null;

  return {
    targetMinutes,

    consumedMinutes,

    remainingMinutes,

    percentageUsed,

    deadline,

    level:
      getDeadlineLevel({
        percentageUsed,
        remainingMinutes,
        completed,
        withinDeadline,
      }),

    completed,

    withinDeadline,
  };
}

function buildPausedDeadlineResult({
  targetMinutes,
  consumedMinutes,
}: {
  targetMinutes:
    number;

  consumedMinutes:
    number;
}) {
  const remainingMinutes =
    Math.max(
      0,
      targetMinutes -
        consumedMinutes
    );

  const percentageUsed =
    Math.max(
      0,
      Math.round(
        (
          consumedMinutes /
          targetMinutes
        ) *
          1000
      ) /
        10
    );

  return {
    targetMinutes,

    consumedMinutes,

    remainingMinutes,

    percentageUsed,

    deadline:
      null,

    /*
     * NOT_APPLICABLE aqui significa apenas que não existe
     * prazo correndo enquanto o Movidesk mantém o ticket
     * oficialmente em pausa.
     */
    level:
      "NOT_APPLICABLE" as
        DeadlineLevel,

    completed:
      false,

    withinDeadline:
      null,
  };
}

/* =========================================================
   NÍVEIS DE RISCO

   SLA:
   Alerta quando restam 40%.
   Logo, alerta começa com 60% consumido.
========================================================= */

function getDeadlineLevel({
  percentageUsed,
  remainingMinutes,
  completed,
  withinDeadline,
}: {
  percentageUsed:
    number;

  remainingMinutes:
    number;

  completed:
    boolean;

  withinDeadline:
    boolean | null;
}):
  DeadlineLevel {
  /*
   * Para compromissos já concluídos, prevalece
   * o resultado real da comparação entre:
   *
   * data realizada <= data de vencimento.
   *
   * Isso evita que uma primeira resposta ou uma solução
   * já realizada dentro do prazo seja classificada
   * posteriormente como vencida por causa do percentual
   * calculado.
   */
  if (
    completed
  ) {
    return withinDeadline ===
      false
      ? "OVERDUE"
      : "NORMAL";
  }

  /*
   * Para compromissos ainda pendentes,
   * seguimos monitorando o consumo do prazo.
   */
  if (
    remainingMinutes <
    0
  ) {
    return "OVERDUE";
  }

  /*
   * 80% ou mais consumido:
   * situação crítica.
   */
  if (
    percentageUsed >=
    80
  ) {
    return "CRITICAL";
  }

  /*
   * Gatilho oficial:
   * 60% consumido =
   * 40% restante.
   */
  if (
    percentageUsed >=
    60
  ) {
    return "ATTENTION";
  }

  return "NORMAL";
}

/* =========================================================
   CATEGORIAS
========================================================= */

export function isServiceLevelApplicable(
  category:
    string | null | undefined
) {
  const normalized =
    normalize(
      category
    );

  if (
    !normalized
  ) {
    return true;
  }

  return ![
    "adequacao",
    "solicitacao de servico",
  ].includes(
    normalized
  );
}

/* =========================================================
   TIPO DE ATENDIMENTO
========================================================= */

export function inferServiceKind(
  ticket:
    Pick<
      ServiceLevelTicket,
      | "category"
      | "cause"
      | "subject"
    >
):
  ServiceKind {
  const searchable =
    normalize(
      [
        ticket.category,
        ticket.cause,
      ]
        .filter(
          Boolean
        )
        .join(
          " "
        )
    );

  /*
   * Evitamos considerar o assunto livre por padrão,
   * pois "bug" pode aparecer apenas no texto da descrição
   * sem representar a classificação oficial.
   */

  if (
    searchable.includes(
      "bug"
    )
  ) {
    return "BUG";
  }

  return "GENERAL";
}

/* =========================================================
   URGÊNCIA
========================================================= */

export function mapUrgency(
  urgency:
    string | null | undefined
):
  ServiceUrgency | null {
  const normalized =
    normalize(
      urgency
    );

  if (
    normalized ===
      "p1" ||
    normalized.includes(
      "critica"
    )
  ) {
    return "P1";
  }

  if (
    normalized ===
      "p2" ||
    normalized.includes(
      "alta"
    )
  ) {
    return "P2";
  }

  if (
    normalized ===
      "p3" ||
    normalized.includes(
      "media"
    )
  ) {
    return "P3";
  }

  if (
    normalized ===
      "p4" ||
    normalized.includes(
      "baixa"
    )
  ) {
    return "P4";
  }

  return null;
}

/* =========================================================
   HORAS ÚTEIS
========================================================= */

export function calculateWorkingMinutes(
  start:
    Date,

  end:
    Date,

  schedule:
    WorkingSchedule =
      GENERAL_SCHEDULE
) {
  if (
    end <=
    start
  ) {
    return 0;
  }

  let total =
    0;

  const cursor =
    startOfDay(
      start
    );

  const lastDay =
    startOfDay(
      end
    );

  while (
    cursor <=
    lastDay
  ) {
    if (
      !isHoliday(
        cursor
      )
    ) {
      const periods =
        schedule[
          cursor.getDay()
        ] ??
        [];

      for (
        const period
        of periods
      ) {
        const periodStart =
          dateWithTime(
            cursor,
            period.start
          );

        const periodEnd =
          dateWithTime(
            cursor,
            period.end
          );

        const effectiveStart =
          new Date(
            Math.max(
              periodStart.getTime(),
              start.getTime()
            )
          );

        const effectiveEnd =
          new Date(
            Math.min(
              periodEnd.getTime(),
              end.getTime()
            )
          );

        if (
          effectiveEnd >
          effectiveStart
        ) {
          total +=
            Math.round(
              (
                effectiveEnd.getTime() -
                effectiveStart.getTime()
              ) /
                60000
            );
        }
      }
    }

    cursor.setDate(
      cursor.getDate() +
        1
    );
  }

  return total;
}

/* =========================================================
   ADICIONAR HORAS ÚTEIS
========================================================= */

export function addWorkingMinutes(
  start:
    Date,

  minutes:
    number,

  schedule:
    WorkingSchedule =
      GENERAL_SCHEDULE
) {
  let remaining =
    Math.max(
      0,
      minutes
    );

  let cursor =
    new Date(
      start
    );

  /*
   * Segurança contra loop infinito.
   */
  for (
    let guard = 0;
    guard <
    5000;
    guard++
  ) {
    if (
      isHoliday(
        cursor
      )
    ) {
      cursor =
        nextDayStart(
          cursor
        );

      continue;
    }

    const periods =
      schedule[
        cursor.getDay()
      ] ??
      [];

    let consumedDay =
      false;

    for (
      const period
      of periods
    ) {
      const baseDay =
        startOfDay(
          cursor
        );

      const periodStart =
        dateWithTime(
          baseDay,
          period.start
        );

      const periodEnd =
        dateWithTime(
          baseDay,
          period.end
        );

      if (
        cursor >
        periodEnd
      ) {
        continue;
      }

      const effectiveStart =
        cursor >
        periodStart
          ? cursor
          : periodStart;

      const available =
        Math.max(
          0,
          Math.floor(
            (
              periodEnd.getTime() -
              effectiveStart.getTime()
            ) /
              60000
          )
        );

      if (
        remaining <=
        available
      ) {
        return new Date(
          effectiveStart.getTime() +
            remaining *
              60000
        );
      }

      remaining -=
        available;

      cursor =
        new Date(
          periodEnd.getTime() +
            60000
        );

      consumedDay =
        true;
    }

    if (
      remaining <=
      0
    ) {
      return cursor;
    }

    cursor =
      nextDayStart(
        cursor
      );

    if (
      !consumedDay
    ) {
      continue;
    }
  }

  throw new Error(
    "Não foi possível calcular o prazo em horas úteis."
  );
}

/* =========================================================
   FORMATAÇÃO
========================================================= */

export function formatServiceMinutes(
  minutes:
    number | null
) {
  if (
    minutes ===
    null
  ) {
    return "—";
  }

  const negative =
    minutes <
    0;

  const absolute =
    Math.abs(
      Math.round(
        minutes
      )
    );

  const hours =
    Math.floor(
      absolute /
        60
    );

  const mins =
    absolute %
    60;

  const value =
    hours >
    0
      ? mins >
        0
        ? `${hours}h ${mins}min`
        : `${hours}h`
      : `${mins}min`;

  return negative
    ? `-${value}`
    : value;
}

/* =========================================================
   AUXILIARES
========================================================= */

function createNotApplicableResult(
  profile:
    ServiceProfile,

  kind:
    ServiceKind,

  reason:
    string
):
  ServiceLevelResult {
  const empty = {
    targetMinutes:
      null,

    consumedMinutes:
      0,

    remainingMinutes:
      null,

    percentageUsed:
      0,

    deadline:
      null,

    level:
      "NOT_APPLICABLE" as
        DeadlineLevel,

    completed:
      false,

    withinDeadline:
      null,
  };

  return {
    applicable:
      false,

    reason,

    urgency:
      null,

    profile,

    kind,

    firstResponse: {
      ...empty,
    },

    resolution: {
      ...empty,
    },

    slaAlertPercentage:
      60,
  };
}

function normalize(
  value:
    string | null | undefined
) {
  return (
    value ??
    ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    );
}

function toDate(
  value:
    string | Date | null | undefined
) {
  if (
    !value
  ) {
    return null;
  }

  const result =
    value instanceof
    Date
      ? new Date(
          value
        )
      : new Date(
          value
        );

  if (
    Number.isNaN(
      result.getTime()
    )
  ) {
    return null;
  }

  return result;
}

function startOfDay(
  date:
    Date
) {
  const result =
    new Date(
      date
    );

  result.setHours(
    0,
    0,
    0,
    0
  );

  return result;
}

function nextDayStart(
  date:
    Date
) {
  const result =
    startOfDay(
      date
    );

  result.setDate(
    result.getDate() +
      1
  );

  return result;
}

function dateWithTime(
  day:
    Date,

  time:
    string
) {
  const [
    hour,
    minute,
  ] =
    time.split(
      ":"
    ).map(
      Number
    );

  const result =
    new Date(
      day
    );

  result.setHours(
    hour,
    minute,
    0,
    0
  );

  return result;
}

function isHoliday(
  date:
    Date
) {
  return NATIONAL_HOLIDAYS
    .has(
      formatDateKey(
        date
      )
    );
}

function formatDateKey(
  date:
    Date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}
