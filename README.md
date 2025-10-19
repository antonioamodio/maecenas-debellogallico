## Maecenas — Debello Gallico AR

Esperienza AR basata su Next.js, MindAR e Three.js che proietta tre video indipendenti sui target stampati dell&apos;opera *Debello Gallico*. L&apos;interfaccia è ottimizzata mobile-first e fornisce feedback in tempo reale (preparazione → scansione → tracking).

### Requisiti

- Node.js 20.x (come da `package.json`)
- Target MindAR compilato (`/public/targets/targets.mind`)
- Tre video MP4 posizionati in `/public/videos/video{1,2,3}.mp4` (stesso ordine dei target)

### Avvio in locale

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) da un dispositivo con fotocamera. Il pulsante “Avvia esperienza” compare quando tutti i video sono stati precaricati.

### Flusso utente

1. **Preparazione** – i video vengono caricati fuori campo per garantire un avvio immediato e l&apos;UI mostra l&apos;avanzamento.
2. **Scansione** – la fotocamera viene ridimensionata dinamicamente e la HUD guida l&apos;utente nel framing ottimale.
3. **Tracking** – quando il target è agganciato, il video corrispondente viene riprodotto sopra l&apos;immagine con smoothing dei movimenti e gestione audio (tap per sbloccare).

Il sistema ritorna automaticamente in modalità Recupero → Scansione se il target va perso.

### Suggerimenti di tracking

- Usa stampe A4 in condizioni di luce diffusa; evita riflessi diretti.
- Mantieni il dispositivo parallelo al target durante l&apos;aggancio.
- I parametri MindAR sono ottimizzati per stabilità (`filterMinCF`, `filterBeta`, `warmupTolerance`, `missTolerance`) e un ulteriore smoothing viene applicato via Three.js per ridurre jitter e ghosting.

### Build

```bash
npm run build
npm run start
```

L&apos;export statico è supportato tramite `npm run export` (cartella `out/`).

### Linting

```bash
npm run lint
```

L&apos;ESLint è configurato con le regole `next/core-web-vitals` e ignora gli script di build custom nella cartella `scripts/`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
