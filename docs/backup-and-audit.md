# Backup e auditoria operacional

## Backup recomendado

1. No Supabase, mantenha os backups automaticos do projeto ativos.
2. Para operacao comercial, habilite Point-in-Time Recovery (PITR) no projeto de producao.
3. Rode um backup exportavel pelo menos 1 vez por dia e guarde fora do computador local.
4. Teste restauracao em um projeto Supabase separado pelo menos 1 vez por mes.

## Backup manual via CLI

O projeto ja esta ligado ao Supabase. Para gerar um pacote local:

```powershell
.\scripts\backup-supabase.ps1
```

O arquivo sera criado em:

```text
backups/supabase/YYYYMMDD-HHMMSS.zip
```

Esse diretorio esta no `.gitignore` para evitar vazamento de dados.

Se a CLI pedir senha do banco ou se estiver rodando em outro computador, use uma variavel de ambiente com a connection string do Supabase:

```powershell
$env:SUPABASE_DB_URL="postgresql://postgres.PROJECT_REF:SENHA@aws-0-region.pooler.supabase.com:5432/postgres"
.\scripts\backup-supabase.ps1
```

Para incluir dumps separados de `auth` e `storage`, rode:

```powershell
.\scripts\backup-supabase.ps1 -IncludeAuthStorage
```

## Agendamento no Windows

Exemplo para rodar todo dia as 02:00:

```powershell
$project = "C:\Users\bandm\Documents\BDM Insumos"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$project\scripts\backup-supabase.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At 02:00
Register-ScheduledTask -TaskName "BDM Insumos Supabase Backup" -Action $action -Trigger $trigger -Description "Backup diario do Supabase BDM Insumos"
```

## Auditoria

A tabela `public.audit_logs` e lida pela tela Logs. A escrita deve acontecer apenas por triggers do banco e por Edge Functions confiaveis.

Eventos cobertos:

- cadastro, atualizacao e exclusao de produtos, fornecedores, pessoas, centros de custo, localizacoes, categorias e tipos de ativo;
- cadastro, atualizacao e exclusao de ativos de TI;
- entrada e saida de estoque;
- atualizacao e exclusao de movimentacoes;
- criacao, aprovacao, rejeicao, atualizacao e exclusao de cotacoes;
- criacao, alteracao, bloqueio, desbloqueio e remocao de usuarios por empresa;
- alteracoes de senha, primeiro acesso e 2FA.

## Politica sugerida

- Retencao minima de logs: 12 meses.
- Backup diario exportavel: manter 30 dias.
- Backup mensal: manter 12 meses.
- PITR: manter 7 dias quando o sistema estiver em uso comercial.
- Teste de restauracao: mensal.
