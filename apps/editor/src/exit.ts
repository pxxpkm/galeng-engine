import type { ChoiceOption, Exit } from "./types";

export type ExitKind = "none" | "next" | "choices" | "branch" | "return";

export function exitKind(exit: Exit | undefined): ExitKind {
  if (!exit) return "none";
  return exit.type;
}

export function emptyChoice(): ChoiceOption {
  return { text: "", goto: "" };
}

export function setExitKind(exit: Exit | undefined, kind: ExitKind): Exit | undefined {
  if (kind === "none") return undefined;
  if (kind === "next") {
    return { type: "next", goto: exit && exit.type === "next" ? exit.goto : "" };
  }
  if (kind === "choices") {
    if (exit && exit.type === "choices") return exit;
    return { type: "choices", options: [emptyChoice(), emptyChoice()] };
  }
  if (kind === "return") {
    if (exit && exit.type === "return") return exit;
    return { type: "return" };
  }
  if (exit && exit.type === "branch") return exit;
  return emptyBranch();
}

export type CmpOp = "gte" | "lte" | "gt" | "lt" | "eq";

export type BranchForm = {
  name: string;
  op: CmpOp;
  n: number;
  then: string;
  else: string;
};

export function emptyBranch(): Extract<Exit, { type: "branch" }> {
  return { type: "branch", if: { flag: { gte: 0 } }, then: "", else: "" };
}

export function readBranch(exit: Extract<Exit, { type: "branch" }>): BranchForm {
  const entries = Object.entries(exit.if ?? {});
  const [name, pred] = entries[0] ?? ["flag", { gte: 0 }];
  return {
    name: name || "flag",
    ...predToCmp(pred),
    then: exit.then,
    else: exit.else,
  };
}

export function writeBranch(form: BranchForm): Extract<Exit, { type: "branch" }> {
  const name = form.name.trim() || "flag";
  return {
    type: "branch",
    if: { [name]: { [form.op]: form.n } },
    then: form.then,
    else: form.else,
  };
}

export type CondForm = { name: string; op: CmpOp; n: number };

export function emptyCond(): CondForm {
  return { name: "", op: "gte", n: 0 };
}

export function readCond(ifVal: unknown): CondForm {
  if (!ifVal || typeof ifVal !== "object") {
    return emptyCond();
  }
  const entries = Object.entries(ifVal as Record<string, unknown>);
  const [name, pred] = entries[0] ?? ["", { gte: 0 }];
  return { name: name || "", ...predToCmp(pred) };
}

export function writeCond(form: CondForm): ChoiceOption["if"] | undefined {
  const name = form.name.trim();
  if (!name) {
    return undefined;
  }
  return { [name]: { [form.op]: form.n } };
}

export function patchChoiceIf(opt: ChoiceOption, form: CondForm): ChoiceOption {
  const next: ChoiceOption = { ...opt };
  const written = writeCond(form);
  if (written) {
    next.if = written;
  } else {
    delete next.if;
  }
  return next;
}

function predToCmp(pred: unknown): { op: CmpOp; n: number } {
  if (typeof pred === "boolean") {
    return { op: "eq", n: pred ? 1 : 0 };
  }
  if (typeof pred === "number" && Number.isFinite(pred)) {
    return { op: "eq", n: pred };
  }
  if (pred && typeof pred === "object") {
    const obj = pred as Record<string, unknown>;
    for (const op of ["gte", "lte", "gt", "lt", "eq"] as const) {
      const v = obj[op];
      if (typeof v === "number" && Number.isFinite(v)) {
        return { op, n: v };
      }
    }
  }
  return { op: "gte", n: 0 };
}

export function formatSet(set: ChoiceOption["set"] | undefined): string {
  if (!set) return "";
  return Object.entries(set)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

export function parseSet(text: string): ChoiceOption["set"] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const out: NonNullable<ChoiceOption["set"]> = {};
  for (const part of trimmed.split(/\s+/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const raw = part.slice(eq + 1);
    if (raw === "true" || raw === "false") {
      out[key] = raw === "true";
    } else if (/^[+-]?\d+$/.test(raw) && !raw.startsWith("+") && !raw.startsWith("-")) {
      out[key] = Number(raw);
    } else {
      out[key] = raw;
    }
  }
  return Object.keys(out).length ? out : undefined;
}
