import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { formatCurrencyInputFromDigits } from "@/lib/format";

type CurrencyInputProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function CurrencyInput({ value, onValueChange, ...props }: CurrencyInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(event) => onValueChange(formatCurrencyInputFromDigits(event.target.value))}
    />
  );
}
