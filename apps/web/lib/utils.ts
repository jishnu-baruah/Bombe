// Minimal className combiner (shadcn-style cn without the clsx/tailwind-merge
// deps; our call sites never pass conflicting Tailwind classes).
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}
