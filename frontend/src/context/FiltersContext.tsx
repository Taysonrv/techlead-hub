import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

type PeriodOption =
  | "7d"
  | "30d"
  | "month"
  | "custom";

type FiltersContextData = {
  period: PeriodOption;
  setPeriod: (period: PeriodOption) => void;

  startDate: string;
  setStartDate: (date: string) => void;

  endDate: string;
  setEndDate: (date: string) => void;

  effectiveStartDate: Date;
  effectiveEndDate: Date;
};

const FiltersContext =
  createContext<FiltersContextData | undefined>(
    undefined
  );

type Props = {
  children: ReactNode;
};

export function FiltersProvider({
  children,
}: Props) {
  const [period, setPeriod] =
    useState<PeriodOption>("30d");

  const [startDate, setStartDate] =
    useState("");

  const [endDate, setEndDate] =
    useState("");

  const {
    effectiveStartDate,
    effectiveEndDate,
  } = useMemo(() => {
    const now = new Date();

    const end = new Date(now);

    let start = new Date(now);

    if (period === "7d") {
      start.setDate(
        start.getDate() - 7
      );
    }

    if (period === "30d") {
      start.setDate(
        start.getDate() - 30
      );
    }

    if (period === "month") {
      start = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );
    }

    if (
      period === "custom" &&
      startDate &&
      endDate
    ) {
      start = new Date(
        `${startDate}T00:00:00`
      );

      return {
        effectiveStartDate: start,
        effectiveEndDate: new Date(
          `${endDate}T23:59:59`
        ),
      };
    }

    return {
      effectiveStartDate: start,
      effectiveEndDate: end,
    };
  }, [
    period,
    startDate,
    endDate,
  ]);

  return (
    <FiltersContext.Provider
      value={{
        period,
        setPeriod,

        startDate,
        setStartDate,

        endDate,
        setEndDate,

        effectiveStartDate,
        effectiveEndDate,
      }}
    >
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const context =
    useContext(FiltersContext);

  if (!context) {
    throw new Error(
      "useFilters precisa ser utilizado dentro de FiltersProvider."
    );
  }

  return context;
}