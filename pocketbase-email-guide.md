# PocketBase v0.39.4 — Guia Completo: Sistema de E-mails (Verificação, Reset, Troca)

> **Projeto AMAR (AMARCAP53)** — Documentação gerada a partir da implementação real em produção.
> Stack: PocketBase v0.39.4 (Goja/ES5) + React + TypeScript + Tailwind CSS + Cloudflare Pages

---

## PARTE 1 — Análise dos 3 Fluxos de E-mail

---

### Fluxo 1: Verificação de E-mail (Email Verification)

#### Modo de Operação

O PocketBase possui um sistema nativo de verificação de e-mail. Quando um usuário se cadastra, o backend gera um token JWT de curta duração e envia um e-mail com um link contendo esse token.

**Fluxo completo:**

```
1. Usuário preenche formulário de cadastro
2. Frontend chama: pb.collection('users').create(dados)
3. Frontend chama: pb.collection('users').requestVerification(email)
4. PocketBase gera token e envia e-mail com link:
   https://{FRONTEND_URL}/confirm-verification?verify={TOKEN}
5. Usuário clica no link
6. Frontend intercepta ANTES do React carregar (script inline no index.html)
7. Script inline chama POST /api/collections/{collection}/confirm-verification
8. PocketBase valida o token e marca o campo "verified = true"
9. Usuário é redirecionado com ?verified=1 na URL
10. React processa o resultado e exibe mensagem de sucesso
```

**Por que funciona em 3 camadas (redundância):**
- **Camada 1 — Script inline `index.html`**: Roda antes do React. Usa `fetch()` direto ao backend. Funciona mesmo se o JS do React falhar.
- **Camada 2 — `App.tsx` useEffect**: Detecta `?verify=TOKEN` na URL como fallback. Processa via fetch direto.
- **Camada 3 — `EmailActionPage.tsx`**: Componente React que auto-processa tokens de verificação via fetch direto.

#### Instalação e Configuração

**Backend (PocketBase Admin):**
- A collection de usuários deve ter o campo `verified` (boolean) habilitado
- O SMTP deve estar configurado em `Settings > Mail settings` no painel admin
- Os templates de e-mail são gerenciados pelo PocketBase (não versionados no repo)
- URL do template de verificação: usa `{{actionUrl}}` que precisa ser customizado para apontar para o frontend

**Frontend — `index.html` (script inline antes do React):**
```javascript
// Captura ?verify=TOKEN antes de qualquer framework
var params = new URLSearchParams(window.location.search);
var verifyToken = params.get('verify');

if (verifyToken) {
  var pbUrl = 'https://SEU_BACKEND';  // URL do PocketBase
  window.history.replaceState(null, '', window.location.pathname); // Limpa URL

  fetch(pbUrl + '/api/collections/amarcap53_users/confirm-verification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: 'token=' + encodeURIComponent(verifyToken),
  }).then(function(resp) {
    // Processa resultado e redireciona com ?verified=1 ou ?verify_error=1
  });
}
```

**Frontend — Hook de bloqueio de login (`unique_user.pb.js`):**
```javascript
onRecordAuthRequest(function(e) {
  var record = e.record;
  if (!record) { e.next(); return; }

  var verified = record.get('verified');
  if (verified === false || verified === 0 || verified === 'false' ||
      verified === null || verified === undefined) {
    throw new Error('E-mail nao confirmado. Verifique sua caixa de entrada.');
  }

  e.next();
}, "amarcap53_users");
```

**Frontend — Verificação dupla no login (`AuthScreen.tsx`):**
```typescript
const authData = await pb.collection('amarcap53_users').authWithPassword(email, password);
if (authData?.record?.verified === false) {
  pb.authStore.clear();
  setError('E-mail não confirmado. Verifique sua caixa de entrada.');
  return;
}
```

#### Estado Atual
- **Status**: Funcionando perfeitamente
- **Ponto de atenção**: O script inline hardcoded a URL do backend (`centraldedados.dev.br`). Se o backend mudar de endereço, precisa atualizar em 2 lugares: `index.html` e `pocketbase.ts`

---

### Fluxo 2: Redefinição de Senha (Password Reset)

#### Modo de Operação

```
1. Usuário clica "Esqueci a senha" (AuthScreen) ou "Redefinir Senha" (SettingsScreen)
2. Frontend chama: pb.collection('users').requestPasswordReset(email)
3. PocketBase gera token e envia e-mail com link:
   https://{FRONTEND_URL}/reset-password?token={TOKEN}
4. Usuário clica no link
5. index.html captura ?token=TOKEN → salva em window.__authToken e window.__authAction='reset_password'
6. React monta → useState lazy initializer lê os valores SINCRONAMENTE
7. emailAction é setado como { action: 'reset_password', token }
8. emailAction check ANTES de !user → renderiza EmailActionPage
9. EmailActionPage mostra formulário (nova senha + repetir)
10. Usuário preenche e submete
11. Frontend chama: pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
12. PocketBase valida token e atualiza a senha
13. Usuário vê mensagem de sucesso e vai para o login
```

**Mecanismo de passagem de token (`window.__authToken`):**
O token precisa ser capturado ANTES do React carregar porque o `index.html` limpa a URL via `history.replaceState`. O script inline salva o token em uma variável global que o React lê de forma síncrona no primeiro render.

#### Instalação e Configuração

**Frontend — `index.html` (captura de token):**
```javascript
var authToken = params.get('token');

if (authToken) {
  var actionPath = window.location.pathname.toLowerCase();
  if (actionPath.indexOf('/confirm-email-change') !== -1) {
    window.__authAction = 'confirm_email_change';
  } else {
    window.__authAction = 'reset_password';
  }
  window.__authToken = authToken;
  window.history.replaceState(null, '', window.location.pathname);
}
```

**Frontend — `App.tsx` (leitura síncrona no mount):**
```typescript
const [emailAction, setEmailAction] = useState(() => {
  // Lê token SINCRONO no mount — ANTES do auth check
  const token = (window as any).__authToken as string | undefined;
  const action = (window as any).__authAction as string | undefined;
  delete (window as any).__authToken;
  delete (window as any).__authAction;
  if (token && token.length >= 10) {
    return {
      action: (action === 'confirm_email_change' ? 'confirm_email_change' : 'reset_password'),
      token
    };
  }
  return null;
});

// Render: emailAction ANTES de !user
if (emailAction) {
  return <EmailActionPage action={emailAction.action} token={emailAction.token} />;
}
```

**Frontend — `EmailActionPage.tsx` (confirmação via SDK):**
```typescript
const handleResetPassword = async (e: React.FormEvent) => {
  e.preventDefault();
  if (password.length < 8) { setError('Mín. 8 caracteres.'); return; }
  if (password !== passwordConfirm) { setError('Senhas não conferem.'); return; }
  setStatus('loading');
  try {
    await pb.collection('amarcap53_users').confirmPasswordReset(token, password, passwordConfirm);
    setStatus('success');
  } catch (err: any) {
    setError(String(err?.message || 'Erro ao redefinir senha.'));
    setStatus('error');
  }
};
```

**Solicitação de reset (`AuthScreen.tsx`):**
```typescript
// Na tela de login (esqueci a senha):
await pb.collection('amarcap53_users').requestPasswordReset(email);

// Nas configurações (logado):
await pb.collection('amarcap53_users').requestPasswordReset(user.email);
```

#### Estado Atual
- **Status**: Funcionando perfeitamente
- **Ponto de atenção**: O SDK do PocketBase (v0.26.8 no package.json) tem `confirmPasswordReset` disponível. Se o SDK for atualizado, verificar se a assinatura do método mudou.

---

### Fluxo 3: Confirmação de Novo E-mail (Confirm Email Change)

#### Modo de Operação

Este é o fluxo mais complexo porque o **SDK do PocketBase v0.26.8 NÃO possui o método `confirmEmailChange`**, exigindo fetch direto à API.

```
1. Usuário está logado e vai em Settings
2. Usuário digita o novo e-mail e clica "Solicitar Alteração"
3. Frontend chama: pb.collection('users').requestEmailChange(newEmail)
4. PocketBase gera token e envia e-mail para o NOVO endereço com link:
   https://{FRONTEND_URL}/confirm-email-change?token={TOKEN}
5. Usuário clica no link (pode estar logado ou não)
6. index.html captura ?token=TOKEN → window.__authAction='confirm_email_change'
7. React monta → emailAction = { action: 'confirm_email_change', token }
8. useEffect desloga o usuário (pb.authStore.clear()) para mostrar página "deslogado"
9. EmailActionPage mostra formulário de SENHA ATUAL (PocketBase exige senha para confirmar)
10. Usuário digita a senha atual e submete
11. Frontend chama FETCH DIRETO (não SDK!):
    POST /api/collections/amarcap53_users/confirm-email-change
    Body: { "token": "...", "password": "..." }
12. PocketBase valida token + senha e atualiza o e-mail
13. Usuário vê sucesso → clica "Acessar o Sistema" → vai para login
```

**Por que fetch direto e não SDK:**
O PocketBase SDK v0.26.8 (que está no `package.json`) não expõe o método `confirmEmailChange`. Mesmo que o servidor seja v0.39.4, o SDK é uma versão diferente e não tem essa função. A solução é chamar a API REST diretamente.

**Por que precisa de senha:**
Diferente da verificação de e-mail e do reset de senha (que são " Stateless" — o token sozinho é suficiente), a confirmação de troca de e-mail requer a senha atual do usuário como medida de segurança. Por isso, não é possível auto-processar — é preciso mostrar um formulário.

#### Instalação e Configuração

**Frontend — `index.html` (detecção de rota):**
```javascript
// Detecta se a URL é de confirmação de troca de e-mail
var actionPath = window.location.pathname.toLowerCase();
if (actionPath.indexOf('/confirm-email-change') !== -1) {
  window.__authAction = 'confirm_email_change';
} else {
  window.__authAction = 'reset_password';
}
```

**Frontend — `App.tsx` (logout automático para confirm_email_change):**
```typescript
// Desloga o usuário para mostrar a página "deslogado"
const emailChangeLogoutRef = useRef(false);
useEffect(() => {
  if (emailAction?.action === 'confirm_email_change' &&
      !emailChangeLogoutRef.current && pb.authStore.isValid) {
    emailChangeLogoutRef.current = true;
    pb.authStore.clear();
  }
}, [emailAction]);
```

**Frontend — `EmailActionPage.tsx` (fetch direto para confirmar):**
```typescript
const handleConfirmEmailChange = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!password) { setError('Digite sua senha atual.'); return; }
  setStatus('loading');
  try {
    const resp = await fetch(pb.baseURL + '/api/collections/amarcap53_users/confirm-email-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const text = await resp.text();
    let msg = '';
    try { msg = JSON.parse(text).message; } catch { msg = text; }

    if (resp.ok) {
      setStatus('success');
    } else {
      if (msg.includes('expired')) setError('Link expirado. Solicite novamente.');
      else if (msg.includes('password')) setError('Senha incorreta.');
      else setError(msg || 'Erro ao confirmar.');
      setStatus('error');
    }
  } catch {
    setError('Erro de conexão.');
    setStatus('error');
  }
};
```

**Solicitação de troca (`SettingsScreen.tsx`):**
```typescript
const handleRequestEmailChange = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newEmail || !user) return;
  try {
    await pb.collection('amarcap53_users').requestEmailChange(newEmail);
    setEmailSuccess(true);
  } catch (err: any) {
    alert('Erro ao solicitar troca de e-mail. Verifique se o novo e-mail já está em uso.');
  }
};
```

#### Estado Atual
- **Status**: Funcionando perfeitamente
- **Pontos de atenção**:
  - O caminho da URL (`/confirm-email-change`) deve estar no template de e-mail do PocketBase
  - O fetch usa `Content-Type: application/json` (diferente da verificação que usa `x-www-form-urlencoded`)

---

## PARTE 2 — O que deu certo (Successes)

### 1. Script inline no index.html ANTES do React

**Por que funcionou:** O script inline no `<head>` roda antes de qualquer JavaScript do React. Isso garante que os tokens sejam capturados e a URL seja limpa antes do SPA carregar.

**Repetir sempre:**
```html
<script>
  (function () {
    var params = new URLSearchParams(window.location.search);
    var verifyToken = params.get('verify');
    var authToken = params.get('token');

    // Verificação: processa inline com fetch direto
    if (verifyToken) {
      window.history.replaceState(null, '', window.location.pathname);
      fetch(pbUrl + '/api/collections/{collection}/confirm-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: 'token=' + encodeURIComponent(verifyToken),
      }).then(function(resp) { /* redireciona com resultado */ });
    }

    // Reset / Email Change: salva token para React
    if (authToken) {
      var actionPath = window.location.pathname.toLowerCase();
      window.__authAction = actionPath.indexOf('/confirm-email-change') !== -1
        ? 'confirm_email_change' : 'reset_password';
      window.__authToken = authToken;
      window.history.replaceState(null, '', window.location.pathname);
    }
  })();
</script>
```

### 2. useState com lazy initializer síncrono

**Por que funcionou:** `useState(() => ...)` executa a função de inicialização de forma síncrona no primeiro render, ANTES de qualquer `useEffect`. Isso garante que o token seja lido antes do React processar o auth check.

**Repetir sempre:**
```typescript
const [emailAction, setEmailAction] = useState(() => {
  const token = (window as any).__authToken as string | undefined;
  const action = (window as any).__authAction as string | undefined;
  delete (window as any).__authToken;
  delete (window as any).__authAction;
  if (token && token.length >= 10) {
    return { action: action === 'confirm_email_change' ? 'confirm_email_change' : 'reset_password', token };
  }
  return null;
});
```

### 3. Render condicional emailAction ANTES de !user

**Por que funcionou:** Se `emailAction` for verificado DEPOIS de `!user`, usuários não logados nunca alcançam a verificação (o AuthScreen é retornado antes). Colocando ANTES, o EmailActionPage é renderizado independentemente do estado de autenticação.

**Repetir sempre:**
```typescript
// 1. Loading check
if (isLoading) return <Spinner />;

// 2. Email action — ANTES do auth check
if (emailAction) return <EmailActionPage ... />;

// 3. Auth check
if (!user) return <AuthScreen />;

// 4. Dashboard
return <Dashboard />;
```

### 4. Fetch direto para endpoints não suportados pelo SDK

**Por que funcionou:** O SDK do PocketBase v0.26.8 não tem `confirmEmailChange`. O fetch direto à API REST funciona perfeitamente porque o backend expõe o endpoint HTTP.

**Repetir sempre quando:**
- O SDK não tem o método desejado
- A versão do SDK é diferente da versão do servidor
- Precisa de controle total sobre headers/body

### 5. Hook fail-open no backend (Goja/ES5)

**Por que funcionou:** No hook `unique_user.pb.js`, erros inesperados no catch retornam `false` (fail-open) em vez de `true` (fail-closed). Isso garante que um bug no hook não bloqueie cadastros legítimos.

**Repetir sempre:**
```javascript
function hasDuplicate(dao, filter) {
  if (!filter) return false;
  try {
    var rows = dao.findRecordsByFilter('collection', filter, '-created', 1, 0);
    return rows && rows.length > 0;
  } catch (e) {
    console.error('[hook] Erro: ' + String(e));
    return false;  // fail-open: não bloqueia se o check falhar
  }
}
```

### 6. Bloqueio de login para usuários não verificados (dupla verificação)

**Por que funcionou:** O bloqueio acontece em 2 camadas:
- **Backend** (`onRecordAuthRequest`): Impede a autenticação no servidor
- **Frontend** (`AuthScreen`): Verifica `verified === false` após o login e limpa o auth store

Isso garante que mesmo se uma camada falhar, a outra bloqueia.

### 7. Deslogar usuário ao acessar link de troca de e-mail

**Por que funcionou:** O `useEffect` com `useRef` (para evitar duplo clear) limpa o `pb.authStore` quando `emailAction.action === 'confirm_email_change'`. Isso garante que a página apareça "deslogado" mesmo se o usuário estava logado.

### 8. Tratamento de erros robusto no cadastro

**Por que funcionou:** O handler de erro no `handleRegister` verifica múltiplos cenários:
- Erro de duplicata do hook server-side (busca por mensagem)
- Erro 400 com data de campos específicos (email duplicado, unique constraint)
- Erro 400 sem data (hook engoliu mensagem)
- Erros de rede e genéricos

---

## PARTE 3 — O que NÃO deu certo (Pitfalls)

### 1. SDK v0.26.8 vs Servidor v0.39.4 — Incompatibilidade de métodos

**Problema:** O `package.json` tem `"pocketbase": "^0.26.8"` mas o servidor roda v0.39.4. O método `confirmEmailChange` existe no servidor mas NÃO no SDK da v0.26.8.

**Solução:** Usar fetch direto para `/api/collections/{collection}/confirm-email-change`.

**Evitar:** Assumir que todos os métodos do servidor estão disponíveis no SDK. Sempre verificar a versão do SDK vs servidor.

### 2. confirmEmailChange exige senha — não é auto-processável

**Problema:** Inicialmente tentamos auto-processar a confirmação de troca de e-mail (como a verificação). Mas o PocketBase exige a senha do usuário como medida de segurança.

**Solução:** Mostrar formulário de senha no `EmailActionPage` para `confirm_email_change`.

**Evitar:** Tratar todos os tokens de e-mail da mesma forma. Verificação e reset são "stateless" (token sozinho basta), mas troca de e-mail requer autenticação adicional.

### 3. Templates de e-mail apontam para o admin do PocketBase

**Problema:** O `{{actionUrl}}` nos templates padrão do PocketBase gera URLs como `https://centraldedados.dev.br/_/...` (admin), não para o frontend React.

**Solução:** Customizar os templates com URL hardcoded do frontend:
```
https://amarcap53.pages.dev/confirm-email-change?token={{token}}
```

**Evitar:** Usar `{{actionUrl}}` sem verificar para onde ele aponta. Sempre customizar com a URL correta do frontend.

### 4. Goja engine é ES5 — sem features modernas

**Problema:** O motor JavaScript do PocketBase (Goja) suporta apenas ES5. Arrow functions, `const`/`let`, template literals, destructuring, `async`/`await` NÃO funcionam.

**Solução:** Usar apenas `function`, `var`, concatenação de strings, try/catch síncrono.

**Evitar:** Copiar código JS moderno para hooks `.pb.js`. Sempre reescrever em ES5.

### 5. Hook bloqueava cadastros (fail-closed)

**Problema:** O hook `hasDuplicate` tinha `return true` no catch block. Se o filtro ficasse vazio ou a query falhasse, o hook bloqueava TODOS os cadastros.

**Solução:** Mudar para `return false` (fail-open) no catch block.

**Evitar:** Retornar `true` em catch blocks de hooks que validam dados. O padrão seguro é fail-open (permitir) quando o check falha.

### 6. URL limpa antes do React processar

**Problema:** O script inline faz `history.replaceState` para limpar a URL. Se o React tentar ler `window.location.search` depois, o token já não está mais lá.

**Solução:** Salvar o token em `window.__authToken` ANTES de limpar a URL. O React lê de `window.__authToken`, não da URL.

**Evitar:** Depender de `window.location.search` no React para tokens de e-mail. Sempre capturar no script inline e passar via variável global.

### 7. useEffect roda DEPOIS do primeiro render

**Problema:** Se o token for detectado apenas num `useEffect`, o primeiro render já mostra o dashboard/login antes do EmailActionPage.

**Solução:** Usar `useState(() => ...)` com lazy initializer síncrono para capturar o token no primeiro render.

**Evitar:** Detectar tokens de e-mail em `useEffect`. Sempre usar lazy initializer síncrono.

### 8. AuthScreen consome token que o App.tsx já leu

**Problema:** Tanto o `App.tsx` quanto o `AuthScreen` tentam ler `window.__authToken`. Se o `App.tsx` ler primeiro e deletar, o `AuthScreen` não encontra.

**Solução:** O `App.tsx` tem prioridade (emailAction check antes de !user). O `AuthScreen` só é renderizado se `emailAction` for null.

**Evitar:** Ter múltiplos componentes tentando ler a mesma variável global. Centralizar a captura em um único lugar (App.tsx).

---

## PARTE 4 — Arquitetura Recomendada

### Diagrama dos 3 Fluxos

```
┌─────────────────────────────────────────────────────────────┐
│                    POCKETBASE SERVER v0.39.4                 │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  SMTP Config │  │  Templates   │  │  API Endpoints    │  │
│  │  (Admin UI)  │  │  (Custom)    │  │                   │  │
│  └──────┬──────┘  └──────┬───────┘  │  /confirm-        │  │
│         │                │          │   verification     │  │
│         │                │          │  /confirm-email-   │  │
│         │                │          │   change           │  │
│         │                │          │  /request-         │  │
│         │                │          │   verification     │  │
│         │                │          │  /request-password │  │
│         │                │          │   -reset           │  │
│         │                │          │  /request-email-   │  │
│         │                │          │   change           │  │
│         │                │          └────────┬──────────┘  │
│         │                │                   │              │
│  ┌──────┴────────────────┴───────────────────┴──────────┐  │
│  │              PB_HOOKS (Goja ES5)                      │  │
│  │  unique_user.pb.js                                    │  │
│  │  - onRecordCreate: validação de duplicidade           │  │
│  │  - onRecordUpdate: validação de duplicidade           │  │
│  │  - onRecordAuthRequest: bloqueio de não verificados   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ E-mails enviados
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + TS)                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  index.html — Script Inline (ANTES do React)         │  │
│  │                                                       │  │
│  │  ?verify=TOKEN ──► fetch direto confirm-verification  │  │
│  │  ?token=TOKEN  ──► window.__authToken + __authAction  │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                │
│                            ▼                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  App.tsx — Render Flow                                │  │
│  │                                                       │  │
│  │  1. isLoading? ──► Spinner                            │  │
│  │  2. emailAction? ──► EmailActionPage  ◄── PRIORIDADE  │  │
│  │  3. !user? ──► AuthScreen                             │  │
│  │  4. ──► Dashboard                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                │
│                            ▼                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  EmailActionPage.tsx                                   │  │
│  │                                                       │  │
│  │  verify: auto-processa (fetch direto, sem senha)      │  │
│  │  reset_password: formulário (SDK confirmPasswordReset)│  │
│  │  confirm_email_change: formulário (fetch direto + pwd)│  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Variáveis Globais de Comunicação

| Variável | Quem seta | Quem lê | Quando |
|----------|-----------|---------|--------|
| `window.__authToken` | `index.html` inline | `App.tsx` useState lazy | Antes do React |
| `window.__authAction` | `index.html` inline | `App.tsx` useState lazy | Antes do React |
| `window.__verifyToken` | `index.html` inline | `App.tsx` useEffect | Antes do React |

---

## PARTE 5 — Prompt de Implementação Futura

Copie o bloco abaixo e cole como prompt para uma IA ao iniciar um novo projeto com PocketBase que precise do sistema de e-mails completo:

---

```
Atue como Engenheiro de Software Sênior e Especialista em PocketBase v0.39.4.

Crie o sistema completo de e-mails para um projeto com PocketBase backend + React/TypeScript frontend + Tailwind CSS, hospedado em Cloudflare Pages.

O sistema deve implementar os seguintes 3 fluxos:

## FLUXO 1: Verificação de E-mail (Email Verification)
- Após cadastro, chamar requestVerification(email) no SDK
- Criar script inline no index.html ANTES do React que:
  - Detecte ?verify=TOKEN na URL
  - Chame POST /api/collections/{collection}/confirm-verification com Content-Type: application/x-www-form-urlencoded
  - Redirecione com ?verified=1 ou ?verify_error=1
  - Limpe a URL via history.replaceState
- Criar fallback no App.tsx via useEffect que processe tokens não capturados pelo script inline
- Bloquear login de usuários não verificados:
  - Backend: hook onRecordAuthRequest verificando campo "verified"
  - Frontend: verificar authData.record.verified após login e limpar authStore se false

## FLUXO 2: Redefinição de Senha (Password Reset)
- Criar tela de "Esqueci a senha" que chame requestPasswordReset(email)
- Criar script inline no index.html que:
  - Detecte ?token=TOKEN na URL (para rotas /reset-password)
  - Salve em window.__authToken e window.__authAction='reset_password'
  - Limpe a URL via history.replaceState
- No App.tsx, usar useState com lazy initializer SÍNCRONO para ler window.__authToken:
  const [emailAction, setEmailAction] = useState(() => {
    const token = (window as any).__authToken;
    const action = (window as any).__authAction;
    delete (window as any).__authToken;
    delete (window as any).__authAction;
    if (token && token.length >= 10) return { action, token };
    return null;
  });
- Renderizar EmailActionPage ANTES do check de auth (antes de if (!user))
- EmailActionPage mostra formulário (nova senha + repetir) e chama confirmPasswordReset(token, password, passwordConfirm) via SDK

## FLUXO 3: Confirmação de Troca de E-mail (Confirm Email Change)
- Criar tela em Settings que chame requestEmailChange(newEmail)
- Criar script inline no index.html que:
  - Detecte ?token=TOKEN na URL (para rotas /confirm-email-change)
  - Salve em window.__authToken e window.__authAction='confirm_email_change'
  - Limpe a URL via history.replaceState
- IMPORTANTE: O SDK do PocketBase v0.26.8 NÃO tem confirmEmailChange. Usar fetch DIRETO:
  fetch(pb.baseURL + '/api/collections/{collection}/confirm-email-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ token, password }),
  })
- A API EXIGE a senha do usuário (não é auto-processável). Mostrar formulário de senha.
- Ao acessar o link, deslogar o usuário (pb.authStore.clear()) para mostrar a página "deslogado"
- Usar useRef para evitar duplo clear do auth store

## REGRAS GERAIS OBRIGATÓRIAS

1. Script inline no index.html DEVE rodar antes do React (no <head>)
2. Tokens devem ser capturados via window.__authToken ANTES de history.replaceState
3. EmailActionPage DEVE ser renderizado ANTES de !user no App.tsx
4. Templates de e-mail devem usar URL hardcoded do frontend, NÃO {{actionUrl}} (que aponta para o admin do PB)
5. Hooks Goja (.pb.js) devem ser ES5: function, var, sem arrow functions, sem const/let, sem template literals
6. Hooks devem ser fail-open: catch blocks retornam false (não bloqueiam)
7. Erro handler no cadastro deve verificar: duplicata do hook, erro 400 com data, erro 400 sem data, erros de rede
8. Content-Type para confirm-verification é application/x-www-form-urlencoded
9. Content-Type para confirm-email-change é application/json

Cole o resultado completo com todos os arquivos necessários, incluindo:
- index.html (com script inline)
- App.tsx (com render flow)
- EmailActionPage.tsx (com os 3 fluxos)
- unique_user.pb.js (hook de verificação de email)
- AuthScreen.tsx (com verificação de verified no login)
- SettingsScreen.tsx (com requestEmailChange e requestPasswordReset)
```

---

## Referência Rápida de Endpoints

| Ação | Método | Content-Type | Endpoint |
|------|--------|-------------|----------|
| Solicitar verificação | SDK | - | `requestVerification(email)` |
| Confirmar verificação | POST | `x-www-form-urlencoded` | `/api/collections/{col}/confirm-verification` |
| Solicitar reset de senha | SDK | - | `requestPasswordReset(email)` |
| Confirmar reset de senha | SDK | - | `confirmPasswordReset(token, pwd, pwdConfirm)` |
| Solicitar troca de e-mail | SDK | - | `requestEmailChange(newEmail)` |
| Confirmar troca de e-mail | POST | `application/json` | `/api/collections/{col}/confirm-email-change` |

## Referência Rápida de Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| Link abre no admin do PB | Template usa `{{actionUrl}}` | Customizar template com URL do frontend |
| SDK não tem método | Versão do SDK diferente do servidor | Usar fetch direto à API REST |
| Página abre logado no dashboard | emailAction check depois de !user | Mover emailAction check antes |
| Token não chega ao React | URL limpa antes da captura | Capturar em window.__authToken no script inline |
| Hook bloqueia todos os cadastros | catch retorna true (fail-open) | Mudar catch para return false |
| Erro ES5 em hooks .pb.js | Usou arrow function/const/let | Reescrever em ES5 (function, var) |
| confirmEmailChange retorna 400 | Enviou string vazia como senha | Mostrar formulário de senha obrigatório |
