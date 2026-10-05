import "react-native-get-random-values";
import { v7 as uuid } from "uuid";

export function createUuid(): string { return uuid(); }
