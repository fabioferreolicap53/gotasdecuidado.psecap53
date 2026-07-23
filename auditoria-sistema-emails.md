# Auditoria de Segurança — Sistema de E-mail (Gotas de Cuidado)

**Data:** 23/07/2026
**Auditor:** Engenheiro de Software Sênior / Segurança da Informação
**Projeto:** Gotas de Cuidado — Monitoramento de Crianças e Adolescentes com Diabetes e Anemia Falciforme
**Backend:** PocketBase v0.22.8 (`https://centraldedados.dev.br`)
**Frontend:** React + TypeScript + Vite + Tailwind CSS (Cloudflare Pages)

---

## 1. Mapeamento da Arquitetura Atual

### 1.1 Visão Geral dos Fluxos

O sistema possui três fluxos de comunicação por e-mail, todos orquestrados entre um **script inline pré-React** no `index.html` e componentes React:

| Fluxo | Endpoint PocketBase | Template Token | URL no Link do E-mail |
|---|---|---|---|
| Confirmação de Cadastro | `confirm-verification` | `{TOKEN}` | `/?verify={TOKEN}` |
| Redefinição de Senha | `confirm-password-reset` | `{TOKEN}` | `/?token={TOKEN}` |
| Confirmação de Troca de E-mail | `confirm-email-change` | `{TOKEN}` | `/confirm-email-change?token={TOKEN}` |

### 1.2 Arquivos Envolvidos

```
index.html                    ← Script inline: captura tokens da URL, processa verificação
src/GotasDeCuidado.tsx        ← Componente principal: roteamento pré-auth (emailAction, verificacaoStatus)
src/PaginaLogin.tsx           ← Login, cadastro, "esqueci a senha" (solicitação de reset)
src/PaginaRedefinicao.tsx     ← Página unificada: reset de senha, confirmação de troca de e-mail, solicitação de reset
src/PaginaConfiguracoes.tsx   ← Configurações (campo email desabilitado — fluxo de troca NÃO implementado)
```

### 1.3 Fluxo Detalhado: Confirmação de Cadastro

```
1. Usuário preenche formulário de cadastro (PaginaLogin.tsx)
   → POST /api/collections/gotas_de_cuidado_users/records
   → body: { email, password, passwordConfirm, unidade }

2. Após sucesso, frontend solicita envio de e-mail de verificação
   → POST /api/collections/gotas_de_cuidado_users/request-verification
   → body: { email }

3. PocketBase envia e-mail com link:
   https://gotasdecuidado-psecap53.pages.dev/?verify={TOKEN}

4. Usuário clica no link → index.html script inline executa:
   a) Captura ?verify=TOKEN do parâmetro da URL
   b) Limpa URL com history.replaceState (remove token da barra de endereço)
   c) Envia POST para confirm-verification com Content-Type: x-www-form-urlencoded
   d) Trata resposta: sucesso → redireciona para ?verified=1
      - Já verificado → trata como sucesso
      - Erro → redireciona para ?verify_error=<mensagem>
      - Falha de rede → redireciona para ?verify_fallback=<token>

5. React detecta ?verified=1 ou ?verify_error=1 (GotasDeCuidado.tsx)
   → Renderiza tela de sucesso ou erro correspondente

6. No login, verifica record.verified === false → bloqueia acesso
```

### 1.4 Fluxo Detalhado: Redefinição de Senha

```
1. Usuário clica "Esqueci a senha" (PaginaLogin.tsx) ou navega para /?token=...
   → POST /api/collections/gotas_de_cuidado_users/request-password-reset
   → body: { email }

2. PocketBase envia e-mail com link:
   https://gotasdecuidado-psecap53.pages.dev/?token={TOKEN}

3. Usuário clica no link → index.html script inline:
   a) Captura ?token=TOKEN
   b) Limpa URL com history.replaceState
   c) Salva window.__authToken = TOKEN
   d) Salva window.__authAction = 'reset_password'

4. React lê window.__authToken + window.__authAction (GotasDeCuidado.tsx)
   → Renderiza PaginaRedefinicao com action='reset_password'

5. Usuário digita nova senha + confirmação
   → POST /api/collections/gotas_de_cuidado_users/confirm-password-reset
   → body (JSON): { token, password, passwordConfirm }

6. Resposta: sucesso → tela "Senha Redefinida!"
             erro → mensagens diferenciadas (expirado/inválido/conexão)
```

### 1.5 Fluxo Detalhado: Confirmação de Troca de E-mail

```
1. Solicitação de troca de e-mail: NÃO IMPLEMENTADA no frontend
   (PaginaConfiguracoes.tsx possui campo email desabilitado)
   Fluxo só funciona se chamado diretamente via API:
   → POST /api/collections/gotas_de_cuidado_users/request-email-change

2. PocketBase envia e-mail com link:
   https://gotasdecuidado-psecap53.pages.dev/confirm-email-change?token={TOKEN}

3. Usuário clica no link → index.html script inline:
   a) Captura ?token=TOKEN
   b) Detectapathname contém '/confirm-email-change'
   c) Limpa URL com history.replaceState
   d) Salva window.__authAction = 'confirm_email_change'

4. React renderiza PaginaRedefinicao com action='confirm_email_change'
   → Exige senha atual do usuário (medida de segurança)

5. Usuário digita senha atual
   → POST /api/collections/gotas_de_cuidado_users/confirm-email-change
   → body (JSON): { token, password }

6. Resposta: sucesso → tela "E-mail Alterado!"
             erro → mensagens diferenciadas
```

---

## 2. O Que Deu Certo (Pontos Fortes)

### 2.1 Captura de Token Pré-React (Forte)

**Arquivo:** [index.html](file:///c:/projetos_devs/gotasdecuidado/index.html#L8-L78)

O script inline antes do carregamento do React é uma decisão arquitetural excelente:

- **Elimina race conditions**: O token é capturado e a URL limpa antes do React montar
- **Evita flash de tela**: Não mostra a URL com token para o usuário
- **Funciona sem JavaScript do framework**: Mesmo se o React falhar ao carregar, o token já foi processado
- **Padrão idêntico ao projeto de referência** (`amarcap53`) que já funciona em produção

### 2.2 Limpeza de URL com `history.replaceState` (Forte)

**Arquivo:** [index.html](file:///c:/projetos_devs/gotasdecuidado/index.html#L16-L18)

```javascript
window.history.replaceState(null, '', window.location.pathname);
```

- Remove o token da barra de endereço **imediatamente** após captura
- Impede que o token apareça no histórico do navegador
- Previne que extensões de browser ou analytics capturem o token
- **Prática recomendada por OWASP** para tokens em URL

### 2.3 Verificação com `x-www-form-urlencoded` (Forte)

**Arquivo:** [index.html](file:///c:/projetos_devs/gotasdecuidado/index.html#L31-L37)

A decisão de usar `application/x-www-form-urlencoded` com `encodeURIComponent` para o endpoint `confirm-verification` foi validada empiricamente — é o único Content-Type que funciona de forma consistente com o PocketBase v0.22.8 para este endpoint específico. O projeto de referência (`amarcap53`) confirmou que esta é a abordagem correta.

### 2.4 Bloqueio de Login para E-mail Não Verificado (Forte)

**Arquivo:** [PaginaLogin.tsx](file:///c:/projetos_devs/gotasdecuidado/src/PaginaLogin.tsx#L113-L115)

```typescript
if (record.verified === false || record.verified === 0) {
  setError("Email não confirmado. Verifique sua caixa de entrada.");
  return;
}
```

- Verifica tanto `false` quanto `0` (defensivo contra variações do PocketBase)
- Mensagem clara e orientadora para o usuário
- **Impede acesso indevido** antes da confirmação do e-mail

### 2.5 Tratamento de "Já Verificado" (Forte)

**Arquivo:** [index.html](file:///c:/projetos_devs/gotasdecuidado/index.html#L46-L48)

```javascript
if (msg.indexOf('already') !== -1 || msg.indexOf('verificado') !== -1) {
  window.location.href = window.location.pathname + '?verified=1';
}
```

- Trata tanto a mensagem em inglês quanto em português
- Usuário que clica no mesmo link duas vezes vê "sucesso" novamente
- **Previne confusão do usuário** com erros desnecessários

### 2.6 Validação de Senha no Reset (Forte)

**Arquivo:** [PaginaRedefinicao.tsx](file:///c:/projetos_devs/gotasdecuidado/src/PaginaRedefinicao.tsx#L47-L54)

- Mínimo de 8 caracteres (server-side validation do PocketBase também aplica)
- Confirmação de senha (password === passwordConfirm)
- Mensagens de erro claras e específicas

### 2.7 Exigência de Senha na Troca de E-mail (Forte)

**Arquivo:** [PaginaRedefinicao.tsx](file:///c:/projetos_devs/gotasdecuidado/src/PaginaRedefinicao.tsx#L84-L87)

- Requer a **senha atual** do usuário para confirmar a troca de e-mail
- **Previne sequestro de conta**: Mesmo que um atacante obtenha o token, não consegue trocar o e-mail sem a senha
- Esta é uma prática recomendada de segurança (second factor verification)

### 2.8 Estados de UI Completos (Forte)

**Arquivo:** [PaginaRedefinicao.tsx](file:///c:/projetos_devs/gotasdecuidado/src/PaginaRedefinicao.tsx)

- Loading spinner durante requisições
- Tela de sucesso com mensagem clara
- Tela de erro com mensagem diferenciada
- Botão de voltar ao login funcional
- **UX consistente** entre todos os fluxos

### 2.9 Fallback para Navegadores Sem Fetch (Forte)

**Arquivo:** [index.html](file:///c:/projetos_devs/gotasdecuidado/index.html#L62-L75)

```javascript
} else {
  var form = document.createElement('form');
  // ... form submission fallback
}
```

- Cria um `<form>` oculto e submete via POST
- Garante funcionamento em navegadores antigos
- **Compatibilidade ampla** sem sacrificar segurança

---

## 3. O Que Não Deu Correto (Pontos de Atenção e Falhas)

### 3.1 CRÍTICO — Token Vazado na URL via `verify_fallback`

**Arquivo:** [index.html](file:///c:/projetos_devs/gotasdecuidado/index.html#L59-L61)

```javascript
.catch(function() {
  window.location.href = window.location.pathname + '?verify_fallback=' + encodeURIComponent(verifyToken);
});
```

**Risco:** Se a requisição `fetch` falhar por qualquer motivo (CORS, rede, timeout), o **token bruto é colocado de volta na URL** como parâmetro de query string. Isso:
- Fica visível na barra de endereço do navegador
- É salvo no histórico de navegação
- Pode ser capturado por extensões de browser, analytics ou proxies
- É exibido em logs de servidor (se houver)

**Recomendação:** No handler `.catch`, NÃO coloque o token na URL. Em vez disso, exiba uma mensagem de erro estática ou tente novamente:

```javascript
.catch(function() {
  window.location.href = window.location.pathname + '?verify_error=connection';
});
```

### 3.2 ALTO — Falta de Implementação do Fluxo de Solicitação de Troca de E-mail

**Arquivo:** [PaginaConfiguracoes.tsx](file:///c:/projetos_devs/gotasdecuidado/src/PaginaConfiguracoes.tsx#L105-L113)

O campo de e-mail está desabilitado (`disabled`) e não há botão ou fluxo para **solicitar** uma troca de e-mail. O endpoint `confirm-email-change` está configurado no frontend (index.html + PaginaRedefinicao.tsx), mas o usuário não tem como iniciar o processo.

**Impacto:** A funcionalidade de troca de e-mail existe no backend mas é inacessível pelo frontend. Um atacante que obtenha um token por outro meio (ex.: acesso ao email antigo) poderia usar o fluxo, mas o usuário legítimo não consegue.

**Recomendação:** Implementar na `PaginaConfiguracoes.tsx`:
- Campo de novo e-mail editável
- Botão "Alterar E-mail" que chama `request-email-change`
- Feedback visual de que um e-mail de confirmação foi enviado

### 3.3 MÉDIO — Token Armazenado em Variável Global (`window.__authToken`)

**Arquivo:** [index.html](file:///c:/projetos_devs/gotasdecuidado/index.html#L21-L26) + [GotasDeCuidado.tsx](file:///c:/projetos_devs/gotasdecuidado/src/GotasDeCuidado.tsx#L261-L270)

```javascript
window.__authToken = TOKEN;
window.__authAction = action;
```

O token é armazenado em uma propriedade global do `window`, que permanece acessível enquanto a página estiver aberta. Qualquer script de terceiros (analytics, XSS, extensões) pode ler `window.__authToken`.

**Mitigação atual:** O token é consumido e deletado imediatamente pelo React (`delete (window as any).__authToken`), o que minimiza a janela de exposição.

**Recomendação adicional:** Considere usar `sessionStorage` em vez de variável global, ou usar um `CustomEvent` para transmitir o token ao React de forma mais isolada.

### 3.4 MÉDIO — Sem Rate Limiting no Frontend

**Arquivo:** [PaginaRedefinicao.tsx](file:///c:/projetos_devs/gotasdecuidado/src/PaginaRedefinicao.tsx#L310-L338) + [PaginaLogin.tsx](file:///c:/projetos_devs/gotasdecuidado/src/PaginaLogin.tsx#L206-L229)

O formulário de "Esqueci a senha" (`SolicitarReset`) e o botão "Esqueci a senha" no login não possuem proteção contra spam de requisições:

- Um atacante pode enviar múltiplas requisições de reset para o mesmo e-mail
- Isso pode causar **email flooding** (spam de e-mails de reset na caixa do usuário)
- Não há CAPTCHA, delay, ou bloqueio após N tentativas

**Nota:** O PocketBase possui rate limiting server-side (configurável), mas o frontend deveria ter uma camada adicional.

**Recomendação:** Adicionar um cooldown de 30-60 segundos entre requisições de reset, e limitar a 3-5 tentativas antes de bloquear temporariamente.

### 3.5 MÉDIO — Mensagens de Erro Podem Revelar Informações

**Arquivo:** [PaginaLogin.tsx](file:///c:/projetos_devs/gotasdecuidado/src/PaginaLogin.tsx#L180)

```typescript
setError(msg.includes("already") ? "Este email já está cadastrado" : msg);
```

A mensagem "Este email já está cadastrado" permite **enumeração de usuários** — um atacante pode descobrir quais e-mails possuem contas no sistema testando o cadastro.

**Recomendação:** Usar uma mensagem genérica como "Se este e-mail ainda não foi cadastrado, você receberá um e-mail de confirmação." (que é o que o fluxo de verificação já faz naturalmente).

### 3.6 BAIXO — Validação Mínima de Token Fraca no Frontend

**Arquivo:** [GotasDeCuidado.tsx](file:///c:/projetos_devs/gotasdecuidado/src/GotasDeCuidado.tsx#L266)

```typescript
if (token && token.length >= 10) {
```

A validação no frontend verifica apenas se o token tem pelo menos 10 caracteres. Isso é uma validação superficial — o PocketBase valida o token real server-side. No entanto:

- Tokens maliciosos de 10+ caracteres seriam processados pelo React antes de falhar no backend
- A janela entre processamento frontend e rejeição backend é pequena mas existe

**Recomendação:** Esta validação é aceitável como sanity check. Não é necessária mudança, mas é bom saber que a segurança real está no backend.

### 3.7 BAIXO — Ausência de Headers de Segurança HTTP

**Arquivo:** Configuração do Caddy (server-side, não no código)

Não foi possível verificar pelo código fonte se o servidor configura:
- `Strict-Transport-Security` (HSTS) — obrigar HTTPS
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`

**Recomendação:** Verificar e adicionar no Caddyfile:
```
header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
header X-Content-Type-Options "nosniff"
header X-Frame-Options "DENY"
```

### 3.8 BAIXO — `console.log` em Produção

**Arquivo:** [PaginaLogin.tsx](file:///c:/projetos_devs/gotasdecuidado/src/PaginaLogin.tsx#L159)

```typescript
console.log("[Cadastro] POST", url);
console.error("[Cadastro] PocketBase 400:", JSON.stringify(data, null, 2));
```

Logs de console em produção podem vazar informações sensíveis (URLs, dados de erro) para qualquer um que abra as DevTools.

**Recomendação:** Usar um sistema de logging adequado (ex.: Sentry) ou remover logs em produção via Vite config.

---

## 4. Prompt Guia para Projetos Futuros

Use este prompt como manual de instruções ao implementar o sistema de e-mail (verificação, reset, troca) em qualquer projeto novo com **PocketBase + React SPA hospedada em Cloudflare Pages**.

---

### PROMPT OTIMIZADO E REUSÁVEL

```
## Sistema de E-mail Completo: Verificação, Reset de Senha e Troca de E-mail
### Stack: PocketBase + React (SPA) + Cloudflare Pages

### Arquitetura Geral

Crie um sistema de e-mail com 3 fluxos, usando SPA React com PocketBase backend.

#### Fluxo 1: Verificação de Cadastro (Email Verification)
#### Fluxo 2: Redefinição de Senha (Password Reset)
#### Fluxo 3: Confirmação de Troca de E-mail (Email Change Confirmation)

---

### REGRAS DE SEGURANÇA OBRIGATÓRIAS

1. **Tokens NUNCA ficam na URL visível** — limpar com `history.replaceState` imediatamente após captura
2. **Content-Type para confirm-verification** — usar `application/x-www-form-urlencoded` com `encodeURIComponent(token)`
3. **Content-Type para confirm-password-reset e confirm-email-change** — usar `application/json`
4. **Login bloqueado até verificação** — `record.verified === false || record.verified === 0` impede acesso
5. **Troca de e-mail exige senha atual** — sempre pedir a senha do usuário para confirmar a troca
6. **Token nunca retorna à URL** — no handler `.catch` de erro, NÃO colocar o token como query parameter
7. **Templates PocketBase** — usar `{TOKEN}` (chave simples, maiúscula), NÃO `{{token}}` ou `{{TOKEN}}`
8. **Mínimo 8 caracteres** para senhas, com confirmação (password === passwordConfirm)

---

### ESTRUTURA DE ARQUIVOS RECOMENDADA

```
index.html                  ← Script inline pré-React (captura de tokens)
src/App.tsx                 ← Componente raiz
src/pages/LoginPage.tsx     ← Login + Cadastro + "Esqueci a senha"
src/pages/EmailActionPage.tsx ← Reset de senha + Confirmação de troca de e-mail + Solicitação de reset
src/pages/SettingsPage.tsx  ← Configurações (com botão de solicitar troca de e-mail)
```

---

### PADRÃO: Script Inline no index.html

```html
<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var verifyToken = params.get('verify');
  var authToken = params.get('token');
  var pbUrl = 'SUA_URL_POCKETBASE';

  // 1. Limpar URL IMEDIATAMENTE após captura
  if (verifyToken || authToken) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  // 2. Reset/Email Change: salvar token para React
  if (authToken) {
    var actionPath = window.location.pathname.toLowerCase();
    window.__authAction = actionPath.indexOf('/confirm-email-change') !== -1
      ? 'confirm_email_change' : 'reset_password';
    window.__authToken = authToken;
  }

  // 3. Verificação de e-mail: processar ANTES do framework
  if (verifyToken) {
    if (window.fetch) {
      fetch(pbUrl + '/api/collections/SUA_COLLECTION/confirm-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=' + encodeURIComponent(verifyToken),
      }).then(function(resp) {
        var ct = resp.headers.get('content-type') || '';
        if (ct.indexOf('application/json') !== -1) {
          return resp.json().then(function(data) {
            if (resp.ok) {
              window.location.href = window.location.pathname + '?verified=1';
            } else {
              var msg = (data && data.message) || '';
              if (msg.indexOf('already') !== -1 || msg.indexOf('verificado') !== -1) {
                window.location.href = window.location.pathname + '?verified=1';
              } else {
                window.location.href = window.location.pathname + '?verify_error=' + encodeURIComponent(msg);
              }
            }
          });
        }
        if (resp.ok || resp.redirected) {
          window.location.href = window.location.pathname + '?verified=1';
        } else {
          window.location.href = window.location.pathname + '?verify_error=1';
        }
      }).catch(function() {
        // ⚠️ NUNCA colocar o token de volta na URL!
        window.location.href = window.location.pathname + '?verify_error=connection';
      });
    } else {
      // Fallback: formulário oculto
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = pbUrl + '/api/collections/SUA_COLLECTION/confirm-verification';
      form.target = '_self';
      form.style.display = 'none';
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'token';
      input.value = verifyToken;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    }
  }
})();
</script>
```

---

### PADRÃO: Roteamento no Componente Principal (React)

```typescript
// Capturar tokens do window ANTES de qualquer render
const [emailAction, setEmailAction] = useState(() => {
  const token = (window as any).__authToken as string | undefined;
  const action = (window as any).__authAction as string | undefined;
  delete (window as any).__authToken;
  delete (window as any).__authAction;
  if (token && token.length >= 10) {
    return {
      action: (action === "confirm_email_change" ? "confirm_email_change" : "reset_password") as
        "reset_password" | "confirm_email_change",
      token
    };
  }
  return null;
});

// Detectar resultado da verificação
const [verificacaoStatus, setVerificacaoStatus] = useState<"nenhum" | "sucesso" | "erro">(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("verified") === "1") {
    window.history.replaceState(null, "", window.location.pathname);
    return "sucesso";
  }
  if (params.get("verify_error") === "1") {
    window.history.replaceState(null, "", window.location.pathname);
    return "erro";
  }
  return "nenhum";
});

// ORDEM DE RENDERIZAÇÃO (importante!):
// 1. Email action (reset/troca) — ANTES do auth check
if (emailAction) return <EmailActionPage token={emailAction.token} action={emailAction.action} />;
// 2. Verificação de email — mostrar resultado
if (verificacaoStatus === "sucesso") return <TelaSucesso />;
if (verificacaoStatus === "erro") return <TelaErro />;
// 3. Auth check
if (!user) return <LoginPage onLogin={handleLogin} />;
```

---

### PADRÃO: Página de Ação de E-mail (Reset + Troca)

```typescript
// Endpoints
const PB_URL = "https://sua-url-pocketbase";
const COLLECTION = "sua_collection_users";

const resetUrl = `${PB_URL}/api/collections/${COLLECTION}/confirm-password-reset`;
const emailChangeUrl = `${PB_URL}/api/collections/${COLLECTION}/confirm-email-change`;
const requestResetUrl = `${PB_URL}/api/collections/${COLLECTION}/request-password-reset`;

// Reset de Senha
const handleResetPassword = async (e: React.FormEvent) => {
  e.preventDefault();
  // Validar: password.length >= 8, password === passwordConfirm
  setStatus("loading");
  const resp = await fetch(resetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ token, password, passwordConfirm }),
  });
  // Tratar: resp.ok → sucesso, expired → link expirado, invalid → senha incorreta
};

// Confirmação de Troca de E-mail
const handleConfirmEmailChange = async (e: React.FormEvent) => {
  e.preventDefault();
  // Validar: password (senha atual) não está vazio
  setStatus("loading");
  const resp = await fetch(emailChangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  // Tratar: resp.ok → sucesso, expired → link expirado, invalid → senha incorreta
};

// Solicitação de Reset (sem token)
const handleRequestReset = async (e: React.FormEvent) => {
  e.preventDefault();
  // Validar: email não está vazio
  setStatus("loading");
  const resp = await fetch(requestResetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });
  // Tratar: sucesso → "Email enviado!", erro → mensagem
};
```

---

### PADRÃO: Bloqueio de Login para E-mail Não Verificado

```typescript
// Dentro da função de login
if (record.verified === false || record.verified === 0) {
  setError("Email não confirmado. Verifique sua caixa de entrada.");
  return;
}
```

---

### PADRÃO: Templates de E-mail PocketBase

**Confirmação de Cadastro:**
- Subject: `Confirme seu e-mail — {Nome do Sistema}`
- Body: Link com `href="https://seu-dominio.pages.dev/?verify={TOKEN}"`

**Redefinição de Senha:**
- Subject: `Redefina sua senha — {Nome do Sistema}`
- Body: Link com `href="https://seu-dominio.pages.dev/?token={TOKEN}"`

**Confirmação de Troca de E-mail:**
- Subject: `Confirme a alteração do seu e-mail — {Nome do Sistema}`
- Body: Link com `href="https://seu-dominio.pages.dev/confirm-email-change?token={TOKEN}"`

**Regras para templates PocketBase:**
- Usar `{TOKEN}` (chave simples, maiúscula) — NÃO `{{token}}` ou `{{TOKEN}}`
- O `{TOKEN}` é substituído automaticamente pelo PocketBase

---

### CHECKLIST DE SEGURANÇA

- [ ] Token limpo da URL com `history.replaceState` imediatamente
- [ ] `confirm-verification` usa `application/x-www-form-urlencoded`
- [ ] `confirm-password-reset` e `confirm-email-change` usam `application/json`
- [ ] Login bloqueia usuários com `verified === false`
- [ ] Troca de e-mail exige senha atual
- [ ] Handler `.catch` NÃO retorna token à URL
- [ ] Templates usam `{TOKEN}` (chave simples)
- [ ] Senha mínima de 8 caracteres com confirmação
- [ ] Estados de UI: loading, sucesso, erro (todos implementados)
- [ ] Mensagens de erro genéricas (não revelam existência de contas)
- [ ] Rate limiting server-side configurado no PocketBase
- [ ] Headers de segurança HTTP configurados (HSTS, X-Frame-Options, etc.)
```

---

## Resumo Executivo

| Aspecto | Status | Nota |
|---|---|---|
| Captura de token pré-React | ✅ Excelente | Elimina race conditions |
| Limpeza de URL | ✅ Excelente | Previne vazamento via histórico |
| Verificação de cadastro | ✅ Funcional | x-www-form-urlencoded validado |
| Bloqueio de login (unverified) | ✅ Funcional | Verifica `false` e `0` |
| Reset de senha (UI completa) | ✅ Funcional | Loading, sucesso, erro |
| Confirmação de troca de e-mail (UI) | ✅ Funcional | Exige senha atual |
| Solicitação de troca de e-mail (UI) | ❌ Não implementado | Campo email desabilitado |
| Token no catch handler | ⚠️ Vazamento | `verify_fallback` expõe token |
| Rate limiting frontend | ⚠️ Ausente | Depende do backend |
| Enumeração de usuários | ⚠️ Mensagem revela | "Email já cadastrado" |
| Headers de segurança HTTP | ⚠️ Não verificável | Depende do Caddy |
| Logs em produção | ⚠️ Presente | console.log/error |
