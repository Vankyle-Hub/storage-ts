import type { ColumnDataType } from "kysely";

export type DatabaseType = "postgres" | "sqlite";

export interface ColumnTypeMap {
  uuid: ColumnDataType;
  bigint: ColumnDataType;
  timestamp: ColumnDataType;
  varchar(n: number): ColumnDataType;
  text: ColumnDataType;
  integer: ColumnDataType;
}

export function getColumnTypes(dbType: DatabaseType): ColumnTypeMap {
  if (dbType === "sqlite") {
    return {
      uuid: "text",
      bigint: "integer",
      timestamp: "text",
      varchar: () => "text",
      text: "text",
      integer: "integer",
    };
  }
  return {
    uuid: "varchar(36)",
    bigint: "bigint",
    timestamp: "timestamp",
    varchar: (n) => `varchar(${n})` as ColumnDataType,
    text: "text",
    integer: "integer",
  };
}
