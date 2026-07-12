import { v4 as uuid } from "uuid";

export function createUuid(): string {
  return uuid();
}
