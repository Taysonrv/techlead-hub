import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import type {
  ReactNode,
} from "react";

type PeriodOption =
  | "7d"
  | "30d"
  | "month"
  | "custom";

type FiltersContextData = {
  period: PeriodOption;
  setPeriod: (
    period: PeriodOption
  ) => void;

  startDate: string;
  setStartDate: (
    date: string
  ) => void;

  endDate: string;
  setEndDate: (
    date: string
  ) => void;

  effectiveStartDate: Date;
  effectiveEndDate: Date;
};

type FiltersProviderProps = {
  children: ReactNode;
};

const FiltersContext =
  createContext<
    FiltersContextData | undefined
  >(undefined);

export function FiltersProvider({
  children,
}: FiltersProviderProps) {
  const [
    period,
    setPeriod,
  ] =
    useState<PeriodOption>(
      "30d"
    );

  const [
    startDate,
    setStartDate,
  ] =
    useState("");

  const [
    endDate,
    setEndDate,
  ] =
    useState("");

  const {
    effectiveStartDate,
    effectiveEndDate,
  } = useMemo(() => {
    const now =
      new Date();

    const end =
      endOfDay(now);

    let start =
      startOfDay(now);

    if (
      period === "7d"
    ) {
      start.setDate(
        start.getDate() - 7
      );
    }

    if (
      period === "30d"
    ) {
      start.setDate(
        start.getDate() - 30
      );
    }

    if (
      period === "month"
    ) {
      start =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
          0,
          0,
          0,
          0
        );
    }

    if (
      period === "custom"
    ) {
      const customStart =
        parseLocalDate(
          startDate,
          false
        );

      const customEnd =
        parseLocalDate(
          endDate,
          true
        );

      if (
        customStart &&
        customEnd
      ) {
        if (
          customStart <=
          customEnd
        ) {
          return {
            effectiveStartDate:
              customStart,

            effectiveEndDate:
              customEnd,
          };
        }

        return {
          effectiveStartDate:
            customEnd,

          effectiveEndDate:
            customStart,
        };
      }
    }

    return {
      effectiveStartDate:
        start,

      effectiveEndDate:
        end,
    };
  }, [
    period,
    startDate,
    endDate,
  ]);

  const value =
    useMemo<
      FiltersContextData
    >(
      () => ({
        period,
        setPeriod,

        startDate,
        setStartDate,

        endDate,
        setEndDate,

        effectiveStartDate,
        effectiveEndDate,
      }),
      [
        period,
        startDate,
        endDate,
        effectiveStartDate,
        effectiveEndDate,
      ]
    );

  return (
    <FiltersContext.Provider
      value={value}
    >
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const context =
    useContext(
      FiltersContext
    );

  if (!context) {
    throw new Error(
      "useFilters precisa ser utilizado dentro de FiltersProvider."
    );
  }

  return context;
}

/* =========================================================
   UTILITÁRIOS DE DATA
========================================================= */

function startOfDay(
  date: Date
) {
  const result =
    new Date(date);

  result.setHours(
    0,
    0,
    0,
    0
  );

  return result;
}

function endOfDay(
  date: Date
) {
  const result =
    new Date(date);

  result.setHours(
    23,
    59,
    59,
    999
  );

  return result;
}

function parseLocalDate(
  value: string,
  endOfSelectedDay: boolean
) {
  if (!value) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  const result =
    new Date(
      year,
      month - 1,
      day
    );

  if (
    Number.isNaN(
      result.getTime()
    )
  ) {
    return null;
  }

  if (
    endOfSelectedDay
  ) {
    result.setHours(
      23,
      59,
      59,
      999
    );
  } else {
    result.setHours(
      0,
      0,
      0,
      0
    );
  }

  return result;
}
