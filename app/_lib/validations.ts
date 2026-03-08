import { z } from "zod";

export const referentSchema = z.object({
  name: z.string().min(1, "Inserisci nome e cognome.").trim(),
  email: z.string().email("Email non valida.").toLowerCase().trim(),
  is_active: z.boolean().default(true),
});

export const movementNoteSchema = z.object({
  note: z.string().min(1, "Le note sono obbligatorie.").trim(),
});

export type ReferentInput = z.infer<typeof referentSchema>;
export type MovementNoteInput = z.infer<typeof movementNoteSchema>;
