# Prompt Mestre — Sistema de Instalação PWA (Banner + Lógica Completa)

> **Documento gerado a partir da análise profunda do projeto `agenda.cap53`**
> Versão: 1.0 | Data: 2026-07-06

---

## 1. ARQUITETURA DO SISTEMA

### Arquivos envolvidos

| Arquivo | Responsabilidade |
|---|---|
| `public/manifest.json` | Manifest PWA — define nome, ícones, display standalone, theme_color |
| `public/sw.js` | Service Worker — cache de assets, precaching do index.html |
| `public/pwa-192x192.png` | Ícone 192x192 (obrigatório para instalação) |
| `public/pwa-512x512.png` | Ícone 512x512 (obrigatório para instalação) |
| `index.html` | Registra SW, linka manifest, meta tags Apple |
| `hooks/useInstallPrompt.ts` | Hook React — detecta plataforma, captura evento, controla estado |
| `components/InstallBanner.tsx` | Componente visual — banner com instruções nativas e manuais |
| `vite.config.ts` | Configuração do dev server (afeta HMR/WebSocket) |

### Fluxo de dados

```
Service Worker registrado
        ↓
manifest.json válido (ícones, display: standalone)
        ↓
beforeinstallprompt dispara (ou não dispara)
        ↓
useInstallPrompt detecta:
  ├── Evento disparou → canNativeInstall = true → banner "Instalar Agora"
  └── iOS/Android sem evento → canNativeInstall = false → banner manual
        ↓
InstallBanner renderiza baseado em shouldShow + canNativeInstall
```

---

## 2. O QUE DEU CERTO (Boas Práticas Comprovadas)

### 2.1. Captura global do `beforeinstallprompt`

O evento `beforeinstallprompt` pode disparar **antes** do componente React montar (ex: durante tela de login, verificação de email). Se o hook só registra o listener no `useEffect`, o evento é perdido para sempre.

**Solução que funcionou:** Capturar em variável module-scoped no nível do arquivo:

```typescript
// Fora do componente — executa no import
let capturedPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    capturedPrompt = e;
  });
}
```

Depois no hook, ler `capturedPrompt` no `useState` initializer:

```typescript
const [deferredPrompt, setDeferredPrompt] = useState<any>(capturedPrompt);
```

### 2.2. Banner dual-mode (Nativo + Manual)

A abordagem que funciona em todas as plataformas é ter **dois modos** no mesmo componente:

- **Nativo** (`canNativeInstall = true`): Click dispara `deferredPrompt.prompt()` → instalação one-click
- **Manual** (`canNativeInstall = false`): Click expande instruções passo-a-passo específicas por plataforma

### 2.3. Detecção de plataforma via User-Agent

```typescript
function getPlatform(): Platform {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
}
```

### 2.4. Detecção de modo standalone

```typescript
function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((window.navigator as any).standalone === true) return true; // iOS Safari
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
  return false;
}
```

### 2.5. Persistência do dismiss

Usar `localStorage` com chave específica para não conflitar com outros apps:

```typescript
const DISMISS_KEY = 'pwa_install_banner_dismissed';
```

### 2.6. Manifest JSON correto

```json
{
  "display": "standalone",
  "icons": [
    { "src": "pwa-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "pwa-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### 2.7. Meta tags Apple (obrigatórias para iOS)

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Nome do App" />
<link rel="apple-touch-icon" href="pwa-192x192.png" />
```

### 2.8. Service Worker simples e eficiente

```javascript
// Cache-first para assets, network-first para navegação
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
```

### 2.9. Vite config para dev server

```typescript
server: {
  port: 3000,
  strictPort: true,    // Evita fallback silencioso de porta
  host: 'localhost',   // NUNCA '0.0.0.0' — quebra WebSocket HMR
}
```

---

## 3. O QUE NÃO DEU CERTO (Armadilhas e Erros Comuns)

### 3.1. `beforeinstallprompt` NÃO dispara no iOS

**Impacto:** CRÍTICO. Safari no iOS NUNCA dispara este evento. Apple decidiu não implementar. Não é bug — é limitação da plataforma.

**Consequência:** Se o banner só aparece quando `canNativeInstall = true`, iOS nunca vê o banner.

**Correção:** Mostrar banner manual para iOS e Android automaticamente, sem depender do evento.

### 3.2. `beforeinstallprompt` pode não disparar em Android antigo

**Impacto:** ALTO. Android 9 com Chrome antigo pode não disparar o evento dependendo de configurações.

**Consequência:** Usuário não vê banner nenhum.

**Correção:** Tratar Android da mesma forma que iOS — sempre mostrar banner manual quando o evento não chega.

### 3.3. Race condition: evento antes do componente montar

**Impacto:** ALTO. O `beforeinstallprompt` pode disparar durante a tela de login, verificação de email, ou qualquer fase de loading. O componente `InstallBanner` ainda não existe. Quando ele finalmente monta, o evento já passou.

**Consequência:** Banner nunca aparece. O evento `beforeinstallprompt` dispara **uma única vez** na vida da página. Se você perdeu, perdeu.

**Correção:** Listener global no nível do módulo (não dentro do componente).

### 3.4. `host: '0.0.0.0'` quebra HMR WebSocket

**Impacto:** MÉDIO (apenas dev). Quando Vite roda com `host: '0.0.0.0'`, o WebSocket de hot-reload não consegue conectar.

**Sintomas:**
```
[vite] failed to connect to websocket
@vitejs/plugin-react can't detect preamble
```

**Correção:** Usar `host: 'localhost'` em vez de `'0.0.0.0'`.

### 3.5. `strictPort: false` (default) causa silêncio

**Impacto:** MÉDIO. Se a porta 3000 está ocupada por outro projeto, Vite automaticamente sobe para 3001. O desenvolvedor abre a URL errada e vê o sistema errado.

**Correção:** `strictPort: true` — erro claro se porta ocupada.

### 3.6. iOS Safari — `standalone` detectado incorretamente

**Impacto:** MÉDIO. O `window.navigator.standalone` é a única forma confiável no iOS. O `matchMedia('(display-mode: standalone)')` pode não funcionar em todas versões do Safari.

**Correção:** Checar as duas formas + `window-controls-overlay`:

```typescript
function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((window.navigator as any).standalone === true) return true;
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
  return false;
}
```

### 3.7. Service Worker cache sem invalidação

**Impacto:** MÉDIO. O SW atual usa `cache.put` em todas as respostas GET, mas não invalida versões antigas de forma automática. Versões do app podem ficar presas no cache.

**Correção esperada:** Usar versão no nome do cache (`agenda-cap53-v2`) e limpar caches antigos no `activate`. O projeto já faz isso parcialmente.

### 3.8. `e.preventDefault()` no listener global

**Impacto:** BAIXO. O `e.preventDefault()` no listener global é necessário para suprimir o prompt nativo do browser (a barra "Instalar?"). Mas se chamado fora de contexto de user gesture, pode causar comportamento inesperado.

**Correção:** Manter o `preventDefault` — sem ele, o browser mostra prompt nativo E seu banner, causando duplicidade.

### 3.9. Manifest `start_url` relativo

**Impacto:** BAIXO. `"start_url": "./"` depende da localização do manifest. Em subpastas pode causar loops de redirect.

**Correção:** Usar caminho absoluto se o app não estiver na raiz: `"start_url": "/app/"`.

---

## 4. TABELA DE COMPATIBILIDADE

| Plataforma | `beforeinstallprompt` | Banner nativo | Banner manual | Como instalar |
|---|---|---|---|---|
| **Windows (Edge/Chrome)** | Sim | Sim | Fallback | One-click via evento |
| **Android 9+ (Chrome)** | Geralmente sim | Depende | Sempre disponível | Evento ou manual |
| **Android antigo (8-) | Raramente | Não | Sempre disponível | Apenas manual |
| **iOS (Safari)** | NUNCA | Nunca | Sempre disponível | Share sheet → "Adicionar à Tela" |
| **macOS (Safari)** | NUNCA | Nunca | Sempre disponível | Share → "Add to Dock" |
| **Linux (Chrome/Firefox)** | Depende | Depende | Sempre disponível | Menu do navegador |

---

## 5. PROMPT DE REPLICAÇÃO

Use o prompt abaixo em qualquer novo projeto React + Vite + PWA:

---

### Prompt para IA:

```
Crie o sistema completo de instalação PWA para um projeto React + Vite + TypeScript.
O sistema deve funcionar em Windows, Android (todas versões) e iOS.

## ARQUITETURA

Crie estes 4 arquivos:

### 1. public/manifest.json
- name e short_name com o nome do app
- display: "standalone"
- theme_color e background_color
- icons: pwa-192x192.png e pwa-512x512.png (purpose: "any maskable")
- start_url: "./" e scope: "./"

### 2. public/sw.js
- Service Worker com cache name versionado
- Precache de "/" e "/index.html" no install
- Fetch handler: network-first com fallback para cache
- Activate: limpa caches antigos e faz clients.claim()

### 3. hooks/useInstallPrompt.ts
Hook React que exporta: { shouldShow, platform, canNativeInstall, install, dismiss }

LÓGICA OBRIGATÓRIA:
a) DETECÇÃO DE PLATAFORMA via User-Agent:
   - /Android/i → 'android'
   - /iPhone|iPad|iPod/i → 'ios'
   - /Windows/i → 'windows'
   - senão → 'other'

b) DETECÇÃO DE STANDALONE (3 checagens):
   - matchMedia('(display-mode: standalone)')
   - navigator.standalone === true (iOS Safari)
   - matchMedia('(display-mode: window-controls-overlay)')

c) CAPTURA GLOBAL DO beforeinstallprompt (FORA do componente):
   let capturedPrompt = null;
   window.addEventListener('beforeinstallprompt', (e) => {
     e.preventDefault();
     capturedPrompt = e;
   });
   Isso previne perda do evento quando dispara durante login/loading.

d) shouldShow inicialização:
   - Se standalone → false (já instalado)
   - Se capturedPrompt existe → true
   - Se plataforma é ios ou android → true (banner manual sempre)
   - senão → false

e) canNativeInstall:
   - true apenas se capturedPrompt existe (evento beforeinstallprompt)
   - false para iOS (nunca dispara) e Android sem evento

f) install(): chama deferredPrompt.prompt(), aguarda userChoice, limpa estado
g) dismiss(): salva em localStorage para nunca mais mostrar

### 4. components/InstallBanner.tsx
Componente React que renderiza o banner.

LÓGICA DE RENDERIZAÇÃO:
- Se !shouldShow → return null
- Duas instruções por plataforma (PLATFORM_INSTRUCTIONS):
  * android: 3 passos (⋮ → "Adicionar à tela inicial" → Confirmar)
  * ios: 3 passos (📤 compartilhar → "Adicionar à Tela de Início" → "Adicionar")
  * windows: 2 passos (ícone instalar → Confirmar)
  * other: 2 passos (menu → "Instalar aplicativo" → Confirmar)

DUAIS MODES NO MESMO BANNER:
- canNativeInstall = true:
  * Texto: "Instale o [App]" + "Acesse com um toque direto da sua tela inicial."
  * Ícone: download_for_offline
  * Botão direito: "Instalar agora" com touch_app
  * Click inteiro → install()
  
- canNativeInstall = false (iOS/Android):
  * Texto: "Para [Plataforma]" + descrição
  * Ícone: phone_iphone / android
  * Botão direito: "Como instalar" + expand_more
  * Click inteiro → expand/retrai instruções
  * Instruções em card premium com passos numerados

BOTÃO DISPENSAR:
- X no canto direito com stopPropagation()
- Chama dismiss() → salva em localStorage

ESTILO VISUAL:
- Gradient background primary
- Ícones Material Symbols
- Glassmorphism (backdrop-blur, bg-white/15)
- Animação slide-in-from-top
- z-[200]
- Acessível: role="button", tabIndex={0}, onKeyDown

### 5. index.html (adições)
No <head>:
- <link rel="manifest" href="manifest.json" />
- <meta name="theme-color" content="#COR_PRIMARIA" />
- <meta name="apple-mobile-web-app-capable" content="yes" />
- <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
- <meta name="apple-mobile-web-app-title" content="NOME" />
- <link rel="apple-touch-icon" href="pwa-192x192.png" />

No final do <body>:
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function() {});
  }
</script>

### 6. vite.config.ts (configuração obrigatória)
server: {
  port: 3000,
  strictPort: true,    // Nunca fallback de porta
  host: 'localhost',   // NUNCA '0.0.0.0' — quebra HMR WebSocket
}

## ERROS COMUNS PARA EVITAR
1. NÃO registrar listener only dentro de useEffect — evento pode chegar antes
2. NÃO depender apenas de beforeinstallprompt — iOS nunca dispara
3. NÃO usar host: '0.0.0.0' — quebra WebSocket HMR
4. NÃO usar strictPort: false — causa porta errada silenciosa
5. NÃO esquecer apple-mobile-web-app-capable — iOS não instala sem isso
6. NÃO usar display: "browser" no manifest — tem que ser "standalone"
7. NÃO esquecer navigator.standalone check — único jeito confiável no iOS

## IMAGENS NECESSÁRIAS
- pwa-192x192.png (obrigatório, mínimo 192x192)
- pwa-512x512.png (obrigatório, mínimo 512x512)
- Ambas com purpose: "any maskable" no manifest
```

---

## 6. CHECKLIST PRÉ-DEPLOY

- [ ] `manifest.json` válido (teste em https://maskable.app/)
- [ ] Ícones 192x192 e 512x512 existem em `public/`
- [ ] `sw.js` registrado no `index.html`
- [ ] Meta tags Apple presentes
- [ ] `beforeinstallprompt` listener global (não só no componente)
- [ ] Banner funciona em iOS (instruções manuais)
- [ ] Banner funciona em Android sem evento
- [ ] Banner funciona em Windows com one-click
- [ ] `isStandalone()` checa 3 formas
- [ ] `dismiss()` persiste em `localStorage`
- [ ] Dev server: `strictPort: true` + `host: 'localhost'`

---

## 7. DIAGNÓSTICO RÁPIDO

| Sintoma | Causa provável | Solução |
|---|---|---|
| Banner não aparece em iOS | beforeinstallprompt não dispara | Adicionar banner manual para iOS |
| Banner não aparece no Android | Evento perdido ou Android antigo | Captura global + banner manual |
| Banner aparece mas instalação falha | Manifest inválido ou SW não registrado | Verificar manifest.json e sw.js |
| HMR quebra no dev | host: '0.0.0.0' | Mudar para 'localhost' |
| Sistema errado abre na porta | strictPort: false | Adicionar strictPort: true |
| App instalado mas detecta como web | Falta check de standalone | Usar 3 formas de detecção |
