import { generateId } from "../../utils/ids.js";

export interface ObjectKeyPolicyInput {
  readonly fileName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly ownerId?: string | undefined;
  readonly prefix?: string | undefined;
}

export interface IObjectKeyPolicy {
  generate(input: ObjectKeyPolicyInput): string;
}

export class DefaultObjectKeyPolicy implements IObjectKeyPolicy {
  generate(input: ObjectKeyPolicyInput): string {
    const id = generateId();
    const parts: string[] = [];

    if (input.prefix) {
      parts.push(input.prefix.replace(/\/+$/, ""));
    }

    if (input.ownerId) {
      parts.push(input.ownerId);
    }

    const ext = input.fileName ? extractExtension(input.fileName) : "";
    parts.push(ext ? `${id}${ext}` : id);

    return parts.join("/");
  }
}

function extractExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) {
    return "";
  }
  return fileName.slice(dot).toLowerCase();
}
