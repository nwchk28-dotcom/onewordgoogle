export type Role = "user" | "assistant";

export interface Turn {
  role: Role;
  text: string;
}

export interface QuerySuccess {
  kind: "clarification" | "answer";
  text: string;
  searchSuggestionHtml?: string;
}

export interface QueryErrorBody {
  code: string;
  message: string;
}

