/** JSON-compatible primitive types */
export type JsonPrimitive = string | number | boolean | null;

/** JSON-compatible array */
export type JsonArray = JsonValue[];

/** JSON-compatible object */
export type JsonObject = { [key: string]: JsonValue };

/** Any JSON-compatible value */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/** Make selected properties optional */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Make selected properties required */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** Extract non-undefined type */
export type Defined<T> = T extends undefined ? never : T;

/** A value that may or may not be present */
export type Maybe<T> = T | undefined;
