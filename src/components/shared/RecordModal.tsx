import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
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
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

export type RecordModalValues = Record<string, unknown>;
export type RecordModalSetValues = Dispatch<SetStateAction<RecordModalValues>>;

type FieldAction = {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  onClick: (values: RecordModalValues, setValues: RecordModalSetValues) => Promise<void> | void;
};

export type Field =
  | {
      name: string;
      label: string;
      type: "text" | "email" | "number" | "date";
      placeholder?: string;
      required?: boolean;
      step?: string;
      action?: FieldAction;
    }
  | { name: string; label: string; type: "textarea"; required?: boolean }
  | { name: string; label: string; type: "switch" }
  | {
      name: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
      required?: boolean;
      allowEmpty?: boolean;
    };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  fields: Field[];
  initial?: RecordModalValues | null;
  onSubmit: (values: RecordModalValues) => Promise<void> | void;
  submitting?: boolean;
  children?: ReactNode;
}

export function RecordModal({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  onSubmit,
  submitting,
  children,
}: Props) {
  const [values, setValues] = useState<RecordModalValues>({});
  const fieldsRef = useRef(fields);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    if (open) {
      const init: RecordModalValues = {};
      const src = (initial ?? {}) as RecordModalValues;
      fieldsRef.current.forEach((f) => {
        const v = src[f.name];
        if (f.type === "switch") init[f.name] = v ?? true;
        else init[f.name] = v ?? "";
      });
      if (src.id) init.id = src.id;
      setValues(init);
    }
  }, [open, initial]);

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
                  <SearchableSelect
                    value={(values[f.name] as string) ?? ""}
                    onValueChange={(v) => set(f.name, v)}
                    options={[
                      ...(f.allowEmpty
                        ? [{ value: "__none__", label: "— Nenhum —", pinned: true }]
                        : []),
                      ...f.options,
                    ]}
                    placeholder="Selecione..."
                    searchPlaceholder={`Digite ${f.label.toLowerCase()}...`}
                    emptyText="Nenhuma opção encontrada."
                  />
                ) : f.type === "switch" ? (
                  <div className="flex items-center gap-2 h-9">
                    <Switch checked={!!values[f.name]} onCheckedChange={(v) => set(f.name, v)} />
                    <span className="text-sm text-muted-foreground">
                      {values[f.name] ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                ) : (
                  <div className={f.action ? "flex gap-2" : ""}>
                    <Input
                      type={f.type}
                      step={f.type === "number" ? (f.step ?? "any") : undefined}
                      placeholder={f.placeholder}
                      required={f.required}
                      value={(values[f.name] as string) ?? ""}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                    {f.action && (
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        disabled={submitting || f.action.loading}
                        onClick={() => void f.action?.onClick(values, setValues)}
                      >
                        {f.action.loading
                          ? (f.action.loadingLabel ?? "Carregando...")
                          : f.action.label}
                      </Button>
                    )}
                  </div>
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
