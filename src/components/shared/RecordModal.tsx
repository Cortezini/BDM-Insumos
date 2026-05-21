import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type Field =
  | { name: string; label: string; type: "text" | "email" | "number" | "date"; placeholder?: string; required?: boolean; step?: string }
  | { name: string; label: string; type: "textarea"; required?: boolean }
  | { name: string; label: string; type: "switch" }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; required?: boolean; allowEmpty?: boolean };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  fields: Field[];
  initial?: Record<string, unknown> | null;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitting?: boolean;
  children?: ReactNode;
}

export function RecordModal({ open, onOpenChange, title, description, fields, initial, onSubmit, submitting, children }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, unknown> = {};
      const src = (initial ?? {}) as Record<string, unknown>;
      fields.forEach((f) => {
        const v = src[f.name];
        if (f.type === "switch") init[f.name] = v ?? true;
        else init[f.name] = v ?? "";
      });
      if (src.id) init.id = src.id;
      setValues(init);
    }
  }, [open, initial, fields]);

  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const payload: Record<string, unknown> = {};
            for (const f of fields) {
              let v = values[f.name];
              if (f.type === "number") v = v === "" || v == null ? 0 : Number(v);
              if (f.type === "select" && (v === "" || v === "__none__")) v = null;
              payload[f.name] = v;
            }
            if (values.id) payload.id = values.id;
            await onSubmit(payload);
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2"
        >
          {fields.map((f) => (
            <div key={f.name} className={f.type === "textarea" ? "md:col-span-2" : ""}>
              <Label className="text-xs font-medium text-muted-foreground">{f.label}</Label>
              <div className="mt-1.5">
                {f.type === "textarea" ? (
                  <Textarea
                    value={(values[f.name] as string) ?? ""}
                    onChange={(e) => set(f.name, e.target.value)}
                    rows={3}
                  />
                ) : f.type === "select" ? (
                  <Select value={(values[f.name] as string) ?? ""} onValueChange={(v) => set(f.name, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {f.allowEmpty && <SelectItem value="__none__">— Nenhum —</SelectItem>}
                      {f.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.type === "switch" ? (
                  <div className="flex items-center gap-2 h-9">
                    <Switch checked={!!values[f.name]} onCheckedChange={(v) => set(f.name, v)} />
                    <span className="text-sm text-muted-foreground">{values[f.name] ? "Ativo" : "Inativo"}</span>
                  </div>
                ) : (
                  <Input
                    type={f.type}
                    step={f.type === "number" ? f.step ?? "any" : undefined}
                    placeholder={f.placeholder}
                    required={f.required}
                    value={(values[f.name] as string) ?? ""}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
              </div>
            </div>
          ))}
          {children}
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}