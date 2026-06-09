import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { getDefaultRoute } from "@/lib/permissions";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/login")({ component: LoginPage });

function LoginPage() {
  const { signIn, user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && !authLoading) navigate({ to: getDefaultRoute(profile) ?? "/" });
  }, [user, profile, authLoading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
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
          <span className="font-semibold text-lg">BDM</span>
        </div>
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold leading-tight">Gestão de Insumos</h1>
          <p className="text-primary-foreground/80 max-w-md">
            Controle produtos, fornecedores, movimentações e relatórios em um único lugar — pronto
            para sua operação.
          </p>
        </div>
        <div className="text-xs text-primary-foreground/70">© {new Date().getFullYear()} BDM</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold">Entrar</h2>
            <p className="text-sm text-muted-foreground">Acesse sua conta para continuar.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
