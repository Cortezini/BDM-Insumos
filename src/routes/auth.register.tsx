import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/register")({ component: RegisterPage });

function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signUp(email, password, name);
      toast.success("Conta criada! Verifique seu e-mail para confirmar e faça login.");
      navigate({ to: "/auth/login" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary/95 to-primary text-primary-foreground">
        <div className="flex items-center gap-2">
          <div className="size-10 rounded-lg bg-primary-foreground/15 grid place-items-center">
            <Boxes className="size-6" />
          </div>
          <span className="font-semibold text-lg">Inventário</span>
        </div>
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold leading-tight">Comece em minutos.</h1>
          <p className="text-primary-foreground/80 max-w-md">
            O primeiro usuário cadastrado vira administrador automaticamente.
          </p>
        </div>
        <div />
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold">Criar conta</h2>
            <p className="text-sm text-muted-foreground">Preencha os dados abaixo.</p>
          </div>
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Senha</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
            Criar conta
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/auth/login" className="text-primary font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}