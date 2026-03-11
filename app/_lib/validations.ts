import { z } from "zod";

export const referentSchema = z.object({
  name: z.string().min(1, "Inserisci nome e cognome.").trim(),
  email: z.string().email("Email non valida.").toLowerCase().trim(),
  is_active: z.boolean().default(true),
});

export const movementNoteSchema = z.object({
  note: z.string().min(1, "Le note sono obbligatorie.").trim(),
});

export const equipmentAssetSchema = z.object({
  asset_code: z.string().trim().optional().or(z.literal("")),
  serial_number: z.string().min(1, "Seriale attrezzatura obbligatorio.").trim(),
  name: z.string().min(1, "Nome attrezzatura obbligatorio.").trim(),
  category: z.string().trim().optional().or(z.literal("")),
  brand: z.string().trim().optional().or(z.literal("")),
  model: z.string().trim().optional().or(z.literal("")),
  shelf: z.string().trim().optional().or(z.literal("")),
  place: z.string().trim().optional().or(z.literal("")),
  barcode: z.string().trim().optional().or(z.literal("")),
  nfc_tag_id: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const equipmentMovementSchema = z
  .object({
    equipment_id: z.string().uuid("Seleziona un'attrezzatura valida."),
    type: z.enum(["OUT"]),
    note: z.string().min(1, "Le note sono obbligatorie.").trim(),
    assigned_to_name: z.string().trim().optional().or(z.literal("")),
    assigned_to_email: z.string().trim().optional().or(z.literal("")),
    assigned_to_badge: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.type === "OUT" && !value.assigned_to_name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assigned_to_name"],
        message: "Inserisci il nominativo assegnatario.",
      });
    }
  });

export type ReferentInput = z.infer<typeof referentSchema>;
export type MovementNoteInput = z.infer<typeof movementNoteSchema>;
export type EquipmentAssetInput = z.infer<typeof equipmentAssetSchema>;
export type EquipmentMovementInput = z.infer<typeof equipmentMovementSchema>;
